import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { InterviewDatabase } from "./interview-database";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createDatabase(): Promise<{ directory: string; path: string; database: InterviewDatabase }> {
  const directory = await mkdtemp(join(tmpdir(), "pi-interview-database-"));
  cleanup.push(directory);
  const path = join(directory, "interview.db");
  return { directory, path, database: new InterviewDatabase(path) };
}

describe("InterviewDatabase", () => {
  it("upgrades an existing v2 database without losing interviews or turns", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-database-v2-"));
    cleanup.push(directory);
    const path = join(directory, "interview.db");
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations (version, applied_at)
      VALUES (1, '2026-09-19T00:00:00.000Z'), (2, '2026-09-19T00:00:01.000Z');

      CREATE TABLE interviews (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        candidate_name TEXT NOT NULL,
        position_title TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'preparing', 'ready', 'interviewing', 'generating_report', 'completed')),
        current_question_index INTEGER NOT NULL DEFAULT 0 CHECK (current_question_index >= 0),
        question_count INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 30),
        competencies_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE interview_documents (
        id TEXT PRIMARY KEY,
        interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('job_description', 'resume', 'rubric')),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(interview_id, kind)
      ) STRICT;
      CREATE TABLE interview_turns (
        id TEXT PRIMARY KEY,
        interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
        role TEXT NOT NULL CHECK (role IN ('system', 'interviewer', 'candidate')),
        content TEXT NOT NULL,
        question_kind TEXT,
        decision_json TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(interview_id, ordinal)
      ) STRICT;
      CREATE TABLE job_collection_runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed')),
        sources_json TEXT NOT NULL,
        keywords_json TEXT NOT NULL,
        limit_per_source INTEGER NOT NULL CHECK (limit_per_source BETWEEN 1 AND 100),
        results_json TEXT NOT NULL DEFAULT '[]',
        started_at TEXT NOT NULL,
        finished_at TEXT
      ) STRICT;

      INSERT INTO interviews (
        id, title, candidate_name, position_title, status, current_question_index,
        question_count, competencies_json, created_at, updated_at
      ) VALUES (
        'legacy-interview', '旧版面试', '候选人', '后端开发', 'draft', 0,
        2, '["技术基础"]', '2026-09-19T00:00:00.000Z', '2026-09-19T00:00:00.000Z'
      );
      INSERT INTO interview_documents (
        id, interview_id, kind, title, content, content_hash, created_at, updated_at
      ) VALUES
        ('legacy-jd', 'legacy-interview', 'job_description', '岗位描述', '旧版 JD', 'jd-hash', '2026-09-19T00:00:00.000Z', '2026-09-19T00:00:00.000Z'),
        ('legacy-resume', 'legacy-interview', 'resume', '简历', '旧版简历', 'resume-hash', '2026-09-19T00:00:00.000Z', '2026-09-19T00:00:00.000Z');
      INSERT INTO interview_turns (
        id, interview_id, ordinal, role, content, question_kind, decision_json, created_at
      ) VALUES (
        'legacy-turn', 'legacy-interview', 0, 'system', '旧版初始化记录', NULL, NULL, '2026-09-19T00:00:00.000Z'
      );
    `);
    legacy.close();

    const upgraded = new InterviewDatabase(path);
    expect(upgraded.getSchemaVersion()).toBe(3);
    expect(upgraded.getInterviewSession("legacy-interview")).toMatchObject({
      interview: {
        id: "legacy-interview",
        title: "旧版面试",
        status: "draft",
        questionCount: 2,
      },
      plan: null,
      currentQuestion: null,
      answeredCount: 0,
      preparationError: null,
    });
    expect(upgraded.claimInterviewPreparation("legacy-interview", "legacy-prepare", "questions-v1"))
      .toBe("claimed");
    upgraded.close();

    const inspected = new DatabaseSync(path);
    const turn = inspected.prepare(`
      SELECT content, plan_id, question_id, operation_id
      FROM interview_turns
      WHERE id = 'legacy-turn'
    `).get() as Record<string, unknown>;
    expect(turn).toEqual({
      content: "旧版初始化记录",
      plan_id: null,
      question_id: null,
      operation_id: null,
    });
    inspected.close();
  });

  it("persists interview business memory independently from Pi sessions", async () => {
    const { path, database } = await createDatabase();
    const created = database.createInterview({
      candidateName: "张三",
      positionTitle: "后端开发工程师",
      jobDescription: "负责 Node.js 服务和数据库设计。",
      resumeText: "三年 TypeScript 和 PostgreSQL 开发经验。",
      questionCount: 5,
      competencies: ["技术基础", "项目经验"],
    });

    expect(created.title).toBe("后端开发工程师 · 张三");
    expect(created.status).toBe("draft");
    expect(created.documents.map((document) => document.kind)).toEqual(["job_description", "resume"]);
    expect(created.documents[0]?.contentHash).toHaveLength(64);
    database.close();

    const reopened = new InterviewDatabase(path);
    expect(reopened.getSchemaVersion()).toBe(3);
    expect(reopened.getInterview(created.id)).toMatchObject({
      id: created.id,
      candidateName: "张三",
      positionTitle: "后端开发工程师",
      competencies: ["技术基础", "项目经验"],
    });
    expect(reopened.getSnapshot().counts.draft).toBe(1);
    reopened.close();
  });

  it("sorts the most recently created interview first", async () => {
    const { database } = await createDatabase();
    database.createInterview({
      title: "第一场",
      candidateName: "候选人 A",
      positionTitle: "岗位 A",
      jobDescription: "JD A",
      resumeText: "Resume A",
      questionCount: 3,
      competencies: ["技术基础"],
    });
    database.createInterview({
      title: "第二场",
      candidateName: "候选人 B",
      positionTitle: "岗位 B",
      jobDescription: "JD B",
      resumeText: "Resume B",
      questionCount: 4,
      competencies: ["沟通表达"],
    });

    expect(database.listInterviews().map((interview) => interview.title)).toEqual(["第二场", "第一场"]);
    database.close();
  });

  it("persists a prepared question plan idempotently and recovers an interrupted re-prepare", async () => {
    const { path, database } = await createDatabase();
    const created = database.createInterview({
      candidateName: "候选人 A",
      positionTitle: "AI 应用工程师",
      jobDescription: "负责检索增强生成系统。",
      resumeText: "有 TypeScript 与向量检索项目经验。",
      questionCount: 3,
      competencies: ["技术基础", "项目经验"],
    });

    expect(database.claimInterviewPreparation(created.id, "prepare-1", "questions-v1")).toBe("claimed");
    expect(database.claimInterviewPreparation(created.id, "prepare-1", "questions-v1")).toBe("already_running");
    const ready = database.completeInterviewPreparation({
      interviewId: created.id,
      operationId: "prepare-1",
      promptVersion: "questions-v1",
      competencies: ["技术基础", "项目经验"],
      jobDescriptionHash: "a".repeat(64),
      resumeHash: "b".repeat(64),
      questions: [
        { ordinal: 0, competency: "技术基础", kind: "technical", difficulty: "introductory", prompt: "解释向量检索。", rubric: ["概念准确"] },
        { ordinal: 1, competency: "项目经验", kind: "project", difficulty: "intermediate", prompt: "介绍一个检索项目。", rubric: ["说明职责"] },
        { ordinal: 2, competency: "技术基础", kind: "scenario", difficulty: "advanced", prompt: "如何排查召回率下降？", rubric: ["有排查顺序"] },
      ],
      invocation: {
        providerId: "test-provider",
        modelId: "test-model",
        requestHash: "c".repeat(64),
        responseHash: "d".repeat(64),
        inputTokens: 120,
        outputTokens: 80,
        totalTokens: 200,
        durationMs: 25,
      },
    });

    expect(ready).toMatchObject({
      interview: { id: created.id, status: "ready" },
      plan: { version: 1, promptVersion: "questions-v1", questionCount: 3 },
      currentQuestion: null,
      answeredCount: 0,
      preparationError: null,
    });
    expect(database.claimInterviewPreparation(created.id, "prepare-1", "questions-v1")).toBe("already_completed");
    expect(database.claimInterviewPreparation(created.id, "prepare-2", "questions-v1")).toBe("claimed");
    database.close();

    const reopened = new InterviewDatabase(path);
    expect(reopened.getInterviewSession(created.id)).toMatchObject({
      interview: { status: "ready" },
      plan: { version: 1, questionCount: 3 },
      preparationError: { code: "interrupted" },
    });
    reopened.close();
  });

  it("upserts collected jobs without duplicating the same official job", async () => {
    const { database } = await createDatabase();
    const job = {
      source: "alibaba" as const,
      sourceJobId: "job-1",
      sourceCode: "A001",
      company: "阿里巴巴",
      title: "AI 应用研发工程师",
      city: "杭州",
      jobType: "internship",
      category: "技术类",
      batch: "2027 届实习生",
      department: "阿里云",
      description: "负责 AI Agent 应用开发。",
      responsibilities: ["开发 Agent 系统"],
      requirements: ["熟悉 TypeScript"],
      rawText: "阿里巴巴 AI 应用研发工程师",
      sourceUrl: "https://campus-talent.alibaba.com/campus/position-detail?positionId=job-1",
      collectedAt: "2026-09-20T10:00:00.000Z",
    };

    expect(database.upsertJobPostings([job])).toEqual({ inserted: 1, updated: 0, unchanged: 0 });
    expect(database.upsertJobPostings([{ ...job, collectedAt: "2026-09-20T11:00:00.000Z" }]))
      .toEqual({ inserted: 0, updated: 0, unchanged: 1 });
    expect(database.upsertJobPostings([{ ...job, description: "已更新", rawText: "已更新的岗位" }]))
      .toEqual({ inserted: 0, updated: 1, unchanged: 0 });

    const run = database.startJobCollection({ sources: ["alibaba"], keywords: ["AI"], limitPerSource: 10 });
    database.finishJobCollection(run.id, "completed", [{
      source: "alibaba",
      status: "completed",
      collected: 1,
      inserted: 1,
      updated: 0,
      unchanged: 0,
    }]);
    expect(database.getJobLibrary()).toMatchObject({
      total: 1,
      bySource: { alibaba: 1, bytedance: 0 },
      jobs: [{ sourceJobId: "job-1", description: "已更新" }],
      lastRun: { status: "completed", keywords: ["AI"] },
    });
    database.close();
  });
});
