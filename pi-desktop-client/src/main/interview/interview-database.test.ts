import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { InterviewDatabase, type QuestionBankPackageInput } from "./interview-database";
import { loadQuestionBankCatalog } from "./question-bank-catalog";

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

function migrationQuestionPackage(
  packageVersion: string,
  version: number,
  status: "published" | "reviewing",
  prompt: string,
): QuestionBankPackageInput {
  return {
    packageId: "migration.legacy-v4",
    packageVersion,
    sources: [{
      key: "legacy-source",
      kind: "builtin",
      title: "旧版迁移题源",
      contentHash: "e".repeat(64),
    }],
    questions: [{
      stableKey: "migration.legacy-question",
      version,
      status,
      title: "旧版迁移题",
      prompt,
      kind: "technical",
      difficulty: "intermediate",
      answerOutline: ["保留已发布版本", "迁移当前编辑版本"],
      alternativeAnswers: ["双指针迁移"],
      tags: [
        { axis: "role", key: "legacy-backend", label: "旧版后端" },
        { axis: "topic", key: "migration-search", label: "仅标签可检索" },
      ],
      rubric: [{ id: "legacy-rubric", criterion: "说明迁移边界", required: true }],
    }],
  };
}

function practiceQuestionPackage(version = 1): QuestionBankPackageInput {
  return {
    packageId: "practice.seed",
    packageVersion: `${version}.0.0`,
    sources: [{
      key: "practice-source",
      kind: "builtin",
      title: "练习测试题源",
      uri: "app://question-bank/practice.json",
      contentHash: String(version).padStart(64, "a").slice(-64),
      metadata: { license: "test" },
    }],
    questions: ["one", "two"].map((suffix, index) => ({
      stableKey: `practice.${suffix}`,
      version,
      status: "published" as const,
      title: `练习题 ${index + 1}`,
      prompt: `第 ${version} 版题目 ${index + 1}`,
      kind: "technical" as const,
      difficulty: index === 0 ? "introductory" as const : "intermediate" as const,
      answerOutline: [`第 ${version} 版答案要点 ${index + 1}`],
      commonMistakes: ["只给结论"],
      estimatedDurationSeconds: 120,
      metadata: { intent: `考察能力 ${index + 1}` },
      tags: [
        { axis: "skill" as const, key: "practice", label: "练习技能" },
        { axis: "competency" as const, key: `competency-${index + 1}`, label: `能力 ${index + 1}` },
      ],
      rubric: [{ id: "core", criterion: "覆盖核心要点", weight: 100, required: true }],
      followups: [{ prompt: "请进一步说明。", trigger: "回答不完整" }],
      sources: [{ sourceKey: "practice-source", locator: { index } }],
    })),
  };
}

function downgradeQuestionBankToLegacyV4(path: string): void {
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = OFF");
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`
        CREATE TABLE question_bank_items_v4 (
          id TEXT PRIMARY KEY,
          stable_key TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL CHECK (status IN ('draft', 'reviewing', 'published', 'deprecated')),
          current_version_id TEXT REFERENCES question_versions(id),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE question_versions_v4 (
          id TEXT PRIMARY KEY,
          question_id TEXT NOT NULL REFERENCES question_bank_items(id) ON DELETE CASCADE,
          version INTEGER NOT NULL CHECK (version > 0),
          status TEXT NOT NULL CHECK (status IN ('draft', 'reviewing', 'published', 'deprecated')),
          title TEXT NOT NULL,
          prompt TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('technical', 'project', 'behavioral', 'scenario')),
          difficulty TEXT NOT NULL CHECK (difficulty IN ('introductory', 'intermediate', 'advanced')),
          answer_outline_json TEXT NOT NULL DEFAULT '[]',
          common_mistakes_json TEXT NOT NULL DEFAULT '[]',
          alternative_answers_json TEXT NOT NULL DEFAULT '[]',
          estimated_duration_seconds INTEGER CHECK (estimated_duration_seconds IS NULL OR estimated_duration_seconds > 0),
          metadata_json TEXT NOT NULL DEFAULT '{}',
          content_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(question_id, version),
          UNIQUE(question_id, content_hash)
        ) STRICT;

        CREATE TABLE question_version_tags_v4 (
          version_id TEXT NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
          tag_id TEXT NOT NULL REFERENCES question_tags(id),
          PRIMARY KEY(version_id, tag_id)
        ) WITHOUT ROWID, STRICT;

        CREATE TABLE question_rubric_items_v4 (
          id TEXT PRIMARY KEY,
          version_id TEXT NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
          ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
          criterion TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          weight REAL NOT NULL DEFAULT 1 CHECK (weight >= 0),
          required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1)),
          UNIQUE(version_id, ordinal)
        ) STRICT;

        CREATE TABLE question_imports_v4 (
          id TEXT PRIMARY KEY,
          package_id TEXT NOT NULL,
          package_version TEXT NOT NULL,
          package_hash TEXT NOT NULL,
          source_ids_json TEXT NOT NULL DEFAULT '[]',
          question_count INTEGER NOT NULL CHECK (question_count > 0),
          inserted_count INTEGER NOT NULL CHECK (inserted_count >= 0),
          updated_count INTEGER NOT NULL CHECK (updated_count >= 0),
          unchanged_count INTEGER NOT NULL CHECK (unchanged_count >= 0),
          imported_at TEXT NOT NULL,
          UNIQUE(package_id, package_version, package_hash)
        ) STRICT;

        INSERT INTO question_bank_items_v4 (
          rowid, id, stable_key, status, current_version_id, created_at, updated_at
        )
        SELECT rowid, id, stable_key, 'reviewing', current_version_id, created_at, updated_at
        FROM question_bank_items;
        INSERT INTO question_versions_v4 (
          rowid, id, question_id, version, status, title, prompt, kind, difficulty,
          answer_outline_json, common_mistakes_json, alternative_answers_json,
          estimated_duration_seconds, metadata_json, content_hash, created_at
        )
        SELECT rowid, id, question_id, version, status, title, prompt, kind, difficulty,
               answer_outline_json, common_mistakes_json, alternative_answers_json,
               estimated_duration_seconds, metadata_json, content_hash, created_at
        FROM question_versions;
        INSERT INTO question_version_tags_v4 (version_id, tag_id)
        SELECT version_id, tag_id FROM question_version_tags;
        INSERT INTO question_rubric_items_v4 (
          id, version_id, ordinal, criterion, description, weight, required
        )
        SELECT id, version_id, ordinal, criterion, description, weight, required
        FROM question_rubric_items;
        INSERT INTO question_imports_v4 (
          id, package_id, package_version, package_hash, source_ids_json,
          question_count, inserted_count, updated_count, unchanged_count, imported_at
        )
        SELECT id, package_id, package_version, package_hash, source_ids_json,
               question_count, inserted_count, updated_count, unchanged_count, imported_at
        FROM question_imports;

        DROP TRIGGER question_versions_ai;
        DROP TRIGGER question_versions_ad;
        DROP TRIGGER question_versions_au;
        DROP TABLE question_versions_fts;
        DROP TABLE question_version_tags;
        DROP TABLE question_rubric_items;
        DROP TABLE question_imports;
        DROP TABLE question_versions;
        DROP TABLE question_bank_items;

        ALTER TABLE question_bank_items_v4 RENAME TO question_bank_items;
        ALTER TABLE question_versions_v4 RENAME TO question_versions;
        ALTER TABLE question_version_tags_v4 RENAME TO question_version_tags;
        ALTER TABLE question_rubric_items_v4 RENAME TO question_rubric_items;
        ALTER TABLE question_imports_v4 RENAME TO question_imports;

        CREATE INDEX question_bank_items_status_updated_idx
        ON question_bank_items(status, updated_at DESC);
        CREATE INDEX question_versions_question_idx
        ON question_versions(question_id, version DESC);
        CREATE INDEX question_imports_package_idx
        ON question_imports(package_id, imported_at DESC);

        CREATE VIRTUAL TABLE question_versions_fts USING fts5(
          title,
          prompt,
          answer_outline_json,
          common_mistakes_json,
          content='question_versions',
          content_rowid='rowid',
          tokenize='trigram'
        );
        CREATE TRIGGER question_versions_ai AFTER INSERT ON question_versions BEGIN
          INSERT INTO question_versions_fts(rowid, title, prompt, answer_outline_json, common_mistakes_json)
          VALUES (new.rowid, new.title, new.prompt, new.answer_outline_json, new.common_mistakes_json);
        END;
        CREATE TRIGGER question_versions_ad AFTER DELETE ON question_versions BEGIN
          INSERT INTO question_versions_fts(
            question_versions_fts, rowid, title, prompt, answer_outline_json, common_mistakes_json
          ) VALUES (
            'delete', old.rowid, old.title, old.prompt, old.answer_outline_json, old.common_mistakes_json
          );
        END;
        CREATE TRIGGER question_versions_au AFTER UPDATE ON question_versions BEGIN
          INSERT INTO question_versions_fts(
            question_versions_fts, rowid, title, prompt, answer_outline_json, common_mistakes_json
          ) VALUES (
            'delete', old.rowid, old.title, old.prompt, old.answer_outline_json, old.common_mistakes_json
          );
          INSERT INTO question_versions_fts(rowid, title, prompt, answer_outline_json, common_mistakes_json)
          VALUES (new.rowid, new.title, new.prompt, new.answer_outline_json, new.common_mistakes_json);
        END;
        INSERT INTO question_versions_fts(question_versions_fts) VALUES ('rebuild');
        DROP TABLE question_practice_progress;
        DROP TABLE question_practice_attempts;
        DROP TABLE question_practice_items;
        DROP TABLE question_practice_sessions;
        DELETE FROM schema_migrations WHERE version IN (5, 6, 7);
      `);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
    database.close();
  }
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
    expect(upgraded.getSchemaVersion()).toBe(7);
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

  it("upgrades a populated v3 database without losing its active plan and question", async () => {
    const { path, database } = await createDatabase();
    const interview = database.createInterview({
      candidateName: "候选人",
      positionTitle: "Python 工程师",
      jobDescription: "负责 Python 服务。",
      resumeText: "有三年开发经验。",
      questionCount: 1,
      competencies: ["技术基础"],
    });
    database.claimInterviewPreparation(interview.id, "migration-prepare", "questions-v1");
    const prepared = database.completeInterviewPreparation({
      interviewId: interview.id,
      operationId: "migration-prepare",
      promptVersion: "questions-v1",
      competencies: ["技术基础"],
      jobDescriptionHash: "a".repeat(64),
      resumeHash: "b".repeat(64),
      questions: [{
        ordinal: 0,
        competency: "技术基础",
        kind: "technical",
        difficulty: "intermediate",
        prompt: "解释 Python GIL。",
        rubric: ["边界准确"],
      }],
      invocation: {
        providerId: "test-provider",
        modelId: "test-model",
        requestHash: "c".repeat(64),
        responseHash: "d".repeat(64),
        durationMs: 10,
      },
    });
    database.close();

    const legacy = new DatabaseSync(path);
    const question = legacy.prepare(`
      SELECT id FROM interview_questions WHERE plan_id = ? ORDER BY ordinal LIMIT 1
    `).get(prepared.plan!.id) as { id: string };
    legacy.prepare("UPDATE interviews SET active_question_id = ? WHERE id = ?")
      .run(question.id, interview.id);
    legacy.exec(`
      DROP TRIGGER question_versions_ai;
      DROP TRIGGER question_versions_ad;
      DROP TRIGGER question_versions_au;
      DROP TABLE question_imports;
      DROP TABLE question_user_state;
      DROP TABLE question_followups;
      DROP TABLE question_rubric_items;
      DROP TABLE question_version_tags;
      DROP TABLE question_version_sources;
      DROP TABLE question_tags;
      DROP TABLE question_sources;
      DROP TABLE question_versions_fts;
      DROP TABLE question_versions;
      DROP TABLE question_bank_items;
      DROP TABLE question_practice_progress;
      DROP TABLE question_practice_attempts;
      DROP TABLE question_practice_items;
      DROP TABLE question_practice_sessions;
      DELETE FROM schema_migrations WHERE version IN (4, 5, 6, 7);
    `);
    expect((legacy.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version)
      .toBe(3);
    legacy.close();

    const upgraded = new InterviewDatabase(path);
    expect(upgraded.getSchemaVersion()).toBe(7);
    expect(upgraded.getInterviewSession(interview.id)).toMatchObject({
      plan: { id: prepared.plan!.id, version: 1, questionCount: 1 },
      currentQuestion: { id: question.id, ordinal: 0, prompt: "解释 Python GIL。" },
    });
    expect(upgraded.getQuestionBankSnapshot()).toMatchObject({ total: 0, published: 0 });
    upgraded.close();
  });

  it("rebuilds a populated legacy v4 question bank while preserving interview data", async () => {
    const { path, database } = await createDatabase();
    const interview = database.createInterview({
      candidateName: "迁移候选人",
      positionTitle: "平台工程师",
      jobDescription: "负责平台服务。",
      resumeText: "有 TypeScript 项目经验。",
      questionCount: 1,
      competencies: ["技术基础"],
    });
    database.claimInterviewPreparation(interview.id, "legacy-v4-prepare", "questions-v1");
    const prepared = database.completeInterviewPreparation({
      interviewId: interview.id,
      operationId: "legacy-v4-prepare",
      promptVersion: "questions-v1",
      competencies: ["技术基础"],
      jobDescriptionHash: "a".repeat(64),
      resumeHash: "b".repeat(64),
      questions: [{
        ordinal: 0,
        competency: "技术基础",
        kind: "technical",
        difficulty: "intermediate",
        prompt: "解释事件循环。",
        rubric: ["说明执行顺序"],
      }],
      invocation: {
        providerId: "test-provider",
        modelId: "test-model",
        requestHash: "c".repeat(64),
        responseHash: "d".repeat(64),
        durationMs: 5,
      },
    });
    database.importQuestionPackage(migrationQuestionPackage(
      "1.0.0",
      1,
      "published",
      "这是升级前应被重建的旧题库内容。",
    ));
    const oldQuestion = database.getQuestionBankItem("migration.legacy-question");
    expect(oldQuestion).not.toBeNull();
    database.setQuestionFavorite(oldQuestion!.id, true);
    database.close();

    downgradeQuestionBankToLegacyV4(path);
    const legacy = new DatabaseSync(path, { readOnly: true });
    expect((legacy.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version)
      .toBe(4);
    expect((legacy.prepare("SELECT COUNT(*) AS count FROM question_bank_items").get() as { count: number }).count)
      .toBe(1);
    expect((legacy.prepare("SELECT COUNT(*) AS count FROM interviews").get() as { count: number }).count)
      .toBe(1);
    expect((legacy.prepare("SELECT COUNT(*) AS count FROM interview_questions").get() as { count: number }).count)
      .toBe(1);
    expect((legacy.prepare("SELECT name FROM pragma_table_info('question_bank_items') WHERE name = 'published_version_id'").get()))
      .toBeUndefined();
    legacy.close();

    const upgraded = new InterviewDatabase(path);
    expect(upgraded.getSchemaVersion()).toBe(7);
    expect(upgraded.getQuestionBankSnapshot()).toMatchObject({ total: 0, published: 0, favorites: 0 });
    expect(upgraded.getInterview(interview.id)).toMatchObject({
      id: interview.id,
      candidateName: "迁移候选人",
      documents: [{ kind: "job_description" }, { kind: "resume" }],
    });
    expect(upgraded.getInterviewSession(interview.id)).toMatchObject({
      plan: { id: prepared.plan!.id, version: 1 },
    });

    expect(upgraded.importQuestionPackage(migrationQuestionPackage(
      "1.0.0",
      1,
      "published",
      "重建后重新导入的题库内容。",
    ))).toMatchObject({ inserted: 1, alreadyImported: false });
    expect(upgraded.listQuestionBank({ search: "重新导入" })).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ stableKey: "migration.legacy-question" })],
    });
    upgraded.close();

    const reopened = new InterviewDatabase(path);
    expect(reopened.getSchemaVersion()).toBe(7);
    expect(reopened.getQuestionBankSnapshot()).toMatchObject({ total: 1, published: 1 });
    expect(reopened.getInterviewSession(interview.id)?.plan?.id).toBe(prepared.plan!.id);
    reopened.close();

    const inspected = new DatabaseSync(path, { readOnly: true });
    expect(inspected.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect((inspected.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 5").get() as { count: number }).count)
      .toBe(1);
    inspected.close();
  });

  it("rolls back a failed legacy v4 reset and can retry with foreign keys enabled", async () => {
    const { path, database } = await createDatabase();
    const interview = database.createInterview({
      candidateName: "回滚候选人",
      positionTitle: "可靠性工程师",
      jobDescription: "负责数据库迁移可靠性。",
      resumeText: "有事务与恢复经验。",
      questionCount: 1,
      competencies: ["可靠性"],
    });
    database.importQuestionPackage(migrationQuestionPackage(
      "rollback-v4",
      1,
      "published",
      "迁移失败时必须完整保留的旧题目。",
    ));
    const question = database.getQuestionBankItem("migration.legacy-question");
    expect(question).not.toBeNull();
    database.setQuestionFavorite(question!.id, true);
    database.close();

    downgradeQuestionBankToLegacyV4(path);
    const faulted = new DatabaseSync(path);
    faulted.exec(`
      CREATE TRIGGER fail_v5_migration
      BEFORE INSERT ON schema_migrations
      WHEN NEW.version = 5
      BEGIN
        SELECT RAISE(ABORT, 'injected v5 migration failure');
      END;
    `);
    const beforeFailure = {
      interviews: faulted.prepare(`
        SELECT id, title, candidate_name, position_title, status, question_count, competencies_json
        FROM interviews ORDER BY id
      `).all(),
      documents: faulted.prepare(`
        SELECT id, interview_id, kind, title, content, content_hash
        FROM interview_documents ORDER BY id
      `).all(),
      items: faulted.prepare(`
        SELECT id, stable_key, status, current_version_id, created_at, updated_at
        FROM question_bank_items ORDER BY id
      `).all(),
      versions: faulted.prepare(`
        SELECT id, question_id, version, status, title, prompt, kind, difficulty,
               answer_outline_json, common_mistakes_json, alternative_answers_json,
               estimated_duration_seconds, metadata_json, content_hash, created_at
        FROM question_versions ORDER BY id
      `).all(),
      favorites: faulted.prepare(`
        SELECT question_id, is_favorite, favorite_at, updated_at
        FROM question_user_state ORDER BY question_id
      `).all(),
      imports: faulted.prepare(`
        SELECT id, package_id, package_version, package_hash, source_ids_json,
               question_count, inserted_count, updated_count, unchanged_count, imported_at
        FROM question_imports ORDER BY id
      `).all(),
    };
    faulted.close();

    expect(() => new InterviewDatabase(path)).toThrow("injected v5 migration failure");

    const rolledBack = new DatabaseSync(path);
    expect((rolledBack.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version)
      .toBe(4);
    expect(rolledBack.prepare(`
      SELECT name FROM pragma_table_info('question_bank_items') WHERE name = 'published_version_id'
    `).get()).toBeUndefined();
    expect({
      interviews: rolledBack.prepare(`
        SELECT id, title, candidate_name, position_title, status, question_count, competencies_json
        FROM interviews ORDER BY id
      `).all(),
      documents: rolledBack.prepare(`
        SELECT id, interview_id, kind, title, content, content_hash
        FROM interview_documents ORDER BY id
      `).all(),
      items: rolledBack.prepare(`
        SELECT id, stable_key, status, current_version_id, created_at, updated_at
        FROM question_bank_items ORDER BY id
      `).all(),
      versions: rolledBack.prepare(`
        SELECT id, question_id, version, status, title, prompt, kind, difficulty,
               answer_outline_json, common_mistakes_json, alternative_answers_json,
               estimated_duration_seconds, metadata_json, content_hash, created_at
        FROM question_versions ORDER BY id
      `).all(),
      favorites: rolledBack.prepare(`
        SELECT question_id, is_favorite, favorite_at, updated_at
        FROM question_user_state ORDER BY question_id
      `).all(),
      imports: rolledBack.prepare(`
        SELECT id, package_id, package_version, package_hash, source_ids_json,
               question_count, inserted_count, updated_count, unchanged_count, imported_at
        FROM question_imports ORDER BY id
      `).all(),
    }).toEqual(beforeFailure);
    rolledBack.exec("DROP TRIGGER fail_v5_migration");
    rolledBack.close();

    const retried = new InterviewDatabase(path);
    try {
      expect(retried.getSchemaVersion()).toBe(7);
      expect(retried.getQuestionBankSnapshot()).toMatchObject({ total: 0, published: 0, favorites: 0 });
      expect(retried.getInterview(interview.id)).toMatchObject({
        id: interview.id,
        candidateName: "回滚候选人",
        documents: [{ kind: "job_description" }, { kind: "resume" }],
      });

      const connection = (retried as unknown as { database: DatabaseSync }).database;
      expect((connection.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys).toBe(1);
      expect(() => connection.prepare(`
        INSERT INTO question_user_state (question_id, is_favorite, favorite_at, updated_at)
        VALUES ('missing-question', 1, NULL, '2026-09-21T00:00:00.000Z')
      `).run()).toThrow(/FOREIGN KEY constraint failed/);
    } finally {
      retried.close();
    }

    const inspected = new DatabaseSync(path, { readOnly: true });
    expect(inspected.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect((inspected.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 5").get() as { count: number }).count)
      .toBe(1);
    inspected.close();
  });

  it("marks an already complete v4 schema as v5 without losing its question bank", async () => {
    const { path, database } = await createDatabase();
    const interview = database.createInterview({
      candidateName: "完整结构候选人",
      positionTitle: "后端工程师",
      jobDescription: "负责后端服务。",
      resumeText: "有数据库经验。",
      questionCount: 1,
      competencies: ["数据库"],
    });
    database.importQuestionPackage(migrationQuestionPackage(
      "complete-v4",
      1,
      "published",
      "完整 v4 中必须保留的题目。",
    ));
    const question = database.getQuestionBankItem("migration.legacy-question");
    expect(question).not.toBeNull();
    database.setQuestionFavorite(question!.id, true);
    database.close();

    const completeV4 = new DatabaseSync(path);
    const before = completeV4.prepare(`
      SELECT q.rowid, q.id, q.current_version_id, q.published_version_id, v.search_text
      FROM question_bank_items q
      JOIN question_versions v ON v.id = q.current_version_id
      WHERE q.id = ?
    `).get(question!.id) as Record<string, unknown>;
    completeV4.exec(`
      DROP TABLE question_practice_progress;
      DROP TABLE question_practice_attempts;
      DROP TABLE question_practice_items;
      DROP TABLE question_practice_sessions;
      DELETE FROM schema_migrations WHERE version IN (5, 6, 7);
    `);
    expect((completeV4.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version)
      .toBe(4);
    completeV4.close();

    const upgraded = new InterviewDatabase(path);
    expect(upgraded.getSchemaVersion()).toBe(7);
    expect(upgraded.getQuestionBankItem(question!.id)).toMatchObject({
      id: question!.id,
      prompt: "完整 v4 中必须保留的题目。",
      favorite: true,
    });
    expect(upgraded.getInterview(interview.id)?.id).toBe(interview.id);
    upgraded.close();

    const reopened = new InterviewDatabase(path);
    expect(reopened.getQuestionBankSnapshot()).toMatchObject({ total: 1, published: 1, favorites: 1 });
    reopened.close();

    const inspected = new DatabaseSync(path, { readOnly: true });
    expect(inspected.prepare(`
      SELECT q.rowid, q.id, q.current_version_id, q.published_version_id, v.search_text
      FROM question_bank_items q
      JOIN question_versions v ON v.id = q.current_version_id
      WHERE q.id = ?
    `).get(question!.id)).toEqual(before);
    expect((inspected.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 5").get() as { count: number }).count)
      .toBe(1);
    expect(inspected.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    inspected.close();
  });

  it("rejects a future schema version and releases the database handle", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-database-future-"));
    cleanup.push(directory);
    const path = join(directory, "interview.db");
    const future = new DatabaseSync(path);
    future.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations (version, applied_at) VALUES (99, '2026-09-21T00:00:00.000Z');
    `);
    future.close();
    expect(() => new InterviewDatabase(path)).toThrow("高于客户端支持的版本 7");
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
    expect(reopened.getSchemaVersion()).toBe(7);
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

  it("imports versioned question packages idempotently and keeps provenance", async () => {
    const { path, database } = await createDatabase();
    const packageV1: QuestionBankPackageInput = {
      packageId: "builtin.backend.seed",
      packageVersion: "1.0.0",
      sources: [{
        key: "seed",
        kind: "builtin",
        title: "后端面试基础题",
        uri: "app://question-bank/backend-v1.json",
        mimeType: "application/json",
        parserId: "question-package-json",
        parserVersion: "1",
        contentHash: "a".repeat(64),
        metadata: { license: "CC-BY-4.0", language: "zh-CN" },
      }],
      questions: [{
        stableKey: "backend.redis-consistency",
        version: 1,
        title: "缓存一致性",
        prompt: "Redis 缓存与数据库如何保持一致？",
        kind: "technical",
        difficulty: "intermediate",
        answerOutline: ["先更新数据库，再删除缓存", "删除失败需要重试或补偿"],
        commonMistakes: ["先更新缓存再更新数据库"],
        alternativeAnswers: ["通过订阅 binlog 异步失效缓存"],
        estimatedDurationSeconds: 180,
        metadata: { language: "zh-CN" },
        tags: [
          { axis: "role", key: "backend", label: "后端开发" },
          { axis: "skill", key: "redis", label: "Redis" },
          { axis: "skill", key: "go", label: "Go" },
          { axis: "competency", key: "tradeoff", label: "技术取舍" },
        ],
        rubric: [
          { criterion: "说明更新顺序", weight: 2, required: true },
          { criterion: "说明失败补偿", description: "包括重试、消息队列等", weight: 1 },
        ],
        followups: [{ prompt: "删除缓存失败时如何处理？", trigger: "没有提到失败补偿" }],
        sources: [{ sourceKey: "seed", locator: { question: 1, section: "cache" } }],
      }, {
        stableKey: "behavioral.conflict",
        version: 1,
        status: "reviewing",
        title: "处理团队冲突",
        prompt: "请介绍一次你处理团队技术分歧的经历。",
        kind: "behavioral",
        difficulty: "introductory",
        answerOutline: ["说明背景", "说明行动与结果"],
        tags: [
          { axis: "role", key: "general", label: "通用" },
          { axis: "competency", key: "communication", label: "沟通表达" },
        ],
        rubric: [{ criterion: "使用具体事例", required: true }],
      }],
    };

    expect(database.importQuestionPackage(packageV1)).toMatchObject({
      inserted: 2,
      updated: 0,
      unchanged: 0,
      alreadyImported: false,
    });
    expect(database.importQuestionPackage(packageV1)).toMatchObject({
      inserted: 2,
      updated: 0,
      unchanged: 0,
      alreadyImported: true,
    });
    expect(() => database.importQuestionPackage({
      ...packageV1,
      questions: packageV1.questions.map((question, index) => index === 0
        ? { ...question, prompt: "同一题包版本中的冲突内容" }
        : question),
    })).toThrow("题包 builtin.backend.seed 的版本 1.0.0 内容冲突");

    const page = database.listQuestionBank({
      search: "Redis",
      kind: "technical",
      difficulty: "intermediate",
      role: "backend",
      skill: "redis",
      limit: 1,
    });
    expect(page).toMatchObject({
      total: 1,
      offset: 0,
      limit: 1,
      items: [{
        stableKey: "backend.redis-consistency",
        version: 1,
        title: "缓存一致性",
        favorite: false,
      }],
    });
    expect(database.listQuestionBank({ search: "go" }).items.map((item) => item.stableKey))
      .toContain("backend.redis-consistency");
    expect(database.getQuestionBankSnapshot()).toMatchObject({
      total: 2,
      published: 1,
      favorites: 0,
      byKind: { technical: 1, project: 0, behavioral: 0, scenario: 0 },
      roles: [{ value: "backend", label: "后端开发", count: 1 }],
    });

    const detail = database.getQuestionBankItem("backend.redis-consistency");
    expect(detail).toMatchObject({
      version: 1,
      answerOutline: ["先更新数据库，再删除缓存", "删除失败需要重试或补偿"],
      rubric: [
        { label: "说明更新顺序", weight: 2, critical: true },
        { label: "说明失败补偿", weight: 1, critical: false },
      ],
      followUps: [{ prompt: "删除缓存失败时如何处理？" }],
      source: {
        type: "builtin",
        uri: "app://question-bank/backend-v1.json",
        parserId: "question-package-json",
        contentHash: "a".repeat(64),
        metadata: { license: "CC-BY-4.0", language: "zh-CN" },
        locator: { question: 1, section: "cache" },
      },
    });
    expect(detail).not.toBeNull();
    expect(database.setQuestionFavorite(detail!.id, true)).toMatchObject({
      questionId: detail!.id,
      favorite: true,
      favorites: 1,
    });
    expect(database.listQuestionBank({ favoritesOnly: true }).items.map((item) => item.stableKey))
      .toEqual(["backend.redis-consistency"]);

    const packageV2: QuestionBankPackageInput = {
      ...packageV1,
      packageVersion: "2.0.0",
      questions: packageV1.questions.map((question) => question.stableKey === "backend.redis-consistency"
        ? { ...question, version: 2, prompt: "在高并发下，Redis 缓存与数据库如何保持一致？" }
        : question),
    };
    expect(database.importQuestionPackage(packageV2)).toMatchObject({
      inserted: 0,
      updated: 1,
      unchanged: 1,
      alreadyImported: false,
    });
    expect(database.getQuestionBankItem(detail!.id)).toMatchObject({
      id: detail!.id,
      stableKey: "backend.redis-consistency",
      version: 2,
      prompt: "在高并发下，Redis 缓存与数据库如何保持一致？",
      favorite: true,
    });

    const reviewingV3: QuestionBankPackageInput = {
      ...packageV2,
      packageVersion: "3.0.0-reviewing",
      questions: packageV2.questions.map((question) => question.stableKey === "backend.redis-consistency"
        ? {
            ...question,
            version: 3,
            status: "reviewing",
            prompt: "这是尚未发布的第 3 版题干。",
            tags: question.tags.map((tag) => tag.axis === "role" && tag.key === "backend"
              ? { ...tag, label: "服务端研发" }
              : tag),
          }
        : question),
    };
    expect(database.importQuestionPackage(reviewingV3)).toMatchObject({ updated: 1, unchanged: 1 });
    expect(database.listQuestionBank({ search: "缓存一致性" }).items[0]).toMatchObject({
      version: 2,
      prompt: "在高并发下，Redis 缓存与数据库如何保持一致？",
      status: "published",
    });
    expect(database.getQuestionBankItem(detail!.id)).toMatchObject({
      version: 2,
      prompt: "在高并发下，Redis 缓存与数据库如何保持一致？",
      status: "published",
    });
    expect(database.getQuestionBankSnapshot().roles).toContainEqual({
      value: "backend",
      label: "后端开发",
      count: 1,
    });
    expect(database.listQuestionBank({ search: "服务端研发" }).total).toBe(0);

    expect(database.importQuestionPackage({
      ...packageV1,
      packageVersion: "1.0.0-replay",
    })).toMatchObject({ inserted: 0, updated: 0, unchanged: 2 });
    expect(database.getQuestionBankItem(detail!.id)?.version).toBe(2);
    expect(database.importQuestionPackage({
      ...packageV2,
      packageVersion: "2.0.0-renamed-source-key",
      sources: packageV2.sources.map((source) => ({ ...source, key: "renamed-seed" })),
      questions: packageV2.questions.map((question) => ({
        ...question,
        ...(question.sources
          ? { sources: question.sources.map((source) => ({ ...source, sourceKey: "renamed-seed" })) }
          : {}),
      })),
    })).toMatchObject({ inserted: 0, updated: 0, unchanged: 2 });
    expect(() => database.importQuestionPackage({
      ...packageV2,
      packageVersion: "2.0.0-locator-conflict",
      questions: packageV2.questions.map((question) => question.stableKey === "backend.redis-consistency"
        ? {
            ...question,
            sources: [{ sourceKey: "seed", locator: { question: 99, section: "cache" } }],
          }
        : question),
    })).toThrow("第 2 版内容冲突");
    expect(() => database.importQuestionPackage({
      ...packageV2,
      packageVersion: "2.0.0-conflict",
      questions: packageV2.questions.map((question) => question.stableKey === "backend.redis-consistency"
        ? { ...question, prompt: "同一来源版本却出现不同内容" }
        : question),
    })).toThrow("第 2 版内容冲突");
    expect(database.getQuestionBankItem(detail!.id)?.prompt)
      .toBe("在高并发下，Redis 缓存与数据库如何保持一致？");

    const publishedV4: QuestionBankPackageInput = {
      ...reviewingV3,
      packageVersion: "4.0.0",
      questions: reviewingV3.questions.map((question) => question.stableKey === "backend.redis-consistency"
        ? {
            ...question,
            version: 4,
            status: "published",
            prompt: "这是审核通过并发布的第 4 版题干。",
          }
        : question),
    };
    expect(database.importQuestionPackage(publishedV4)).toMatchObject({ updated: 1, unchanged: 1 });
    expect(database.getQuestionBankItem(detail!.id)).toMatchObject({
      version: 4,
      prompt: "这是审核通过并发布的第 4 版题干。",
      status: "published",
    });
    database.close();

    const reopened = new InterviewDatabase(path);
    expect(reopened.listQuestionBank({ favoritesOnly: true })).toMatchObject({ total: 1 });
    expect(reopened.getQuestionBankItem("backend.redis-consistency")?.version).toBe(4);
    reopened.close();

    const inspected = new DatabaseSync(path);
    expect((inspected.prepare("SELECT COUNT(*) AS count FROM question_sources").get() as { count: number }).count)
      .toBe(1);
    inspected.close();
  });

  it("stores file and web import metadata without coupling it to question content", async () => {
    const { path, database } = await createDatabase();
    database.importQuestionPackage({
      packageId: "user.document.import",
      packageVersion: "2026-09-21T00:00:00.000Z",
      sources: [{
        key: "document",
        kind: "file",
        title: "团队知识库.pdf",
        uri: "file:///D:/Documents/team-handbook.pdf",
        mimeType: "application/pdf",
        parserId: "pdf-text",
        parserVersion: "2",
        contentHash: "b".repeat(64),
        metadata: { fileName: "团队知识库.pdf", size: 4096 },
      }, {
        key: "official-doc",
        kind: "web",
        title: "Python 官方文档",
        uri: "https://docs.python.org/3/",
        mimeType: "text/html",
        parserId: "readability",
        parserVersion: "1",
        contentHash: "c".repeat(64),
      }],
      questions: [{
        stableKey: "user.python.gil",
        status: "draft",
        title: "Python GIL",
        prompt: "解释 Python GIL 及其影响。",
        kind: "technical",
        difficulty: "intermediate",
        answerOutline: ["解释互斥执行", "区分 CPU 与 I/O 密集任务"],
        tags: [{ axis: "skill", key: "python", label: "Python" }],
        rubric: [{ criterion: "能够说明适用边界" }],
        sources: [
          { sourceKey: "document", locator: { page: 12, heading: "并发模型" } },
          { sourceKey: "official-doc", locator: { selector: "#gil" } },
        ],
      }],
    });

    const detail = database.getQuestionBankItem("user.python.gil");
    expect(detail?.source).toMatchObject({
      type: "file",
      mimeType: "application/pdf",
      parserId: "pdf-text",
      locator: { page: 12, heading: "并发模型" },
    });
    expect(database.listQuestionBank({ skill: "python" }).total).toBe(0);
    database.close();

    const inspected = new DatabaseSync(path);
    const provenance = inspected.prepare(`
      SELECT s.kind, s.uri, vs.locator_json
      FROM question_bank_items q
      JOIN question_versions v ON v.id = q.current_version_id
      JOIN question_version_sources vs ON vs.version_id = v.id
      JOIN question_sources s ON s.id = vs.source_id
      WHERE q.stable_key = 'user.python.gil'
      ORDER BY s.kind
    `).all() as unknown as Array<{ kind: string; uri: string; locator_json: string }>;
    expect(provenance).toEqual([
      expect.objectContaining({ kind: "file", uri: "file:///D:/Documents/team-handbook.pdf" }),
      expect.objectContaining({ kind: "web", uri: "https://docs.python.org/3/" }),
    ]);
    expect(JSON.parse(provenance[1]!.locator_json)).toEqual({ selector: "#gil" });
    inspected.close();
  });

  it("imports the bundled catalog and exposes it through the shared read models", async () => {
    const { database } = await createDatabase();
    const catalog = await loadQuestionBankCatalog(join(process.cwd(), "resources", "interview-question-bank"));
    const imported = database.importQuestionBankCatalog(catalog);
    expect(imported).toMatchObject({
      packs: catalog.packs.length,
      inserted: catalog.questions.length,
      updated: 0,
      unchanged: 0,
      alreadyImported: 0,
    });
    expect(database.getQuestionBankSnapshot()).toMatchObject({
      total: catalog.questions.length,
      published: catalog.questions.filter((question) => question.status === "published").length,
    });
    const gil = database.listQuestionBank({ search: "GIL", skill: "python" });
    expect(gil.total).toBeGreaterThan(0);
    expect(gil.items[0]).toMatchObject({
      stableKey: "python.gil.concurrency",
      subtype: "mechanism",
      sourceLabel: "Pi Desktop 原创题库",
    });
    expect(database.listQuestionBank({ search: "并发模型" }).items.map((item) => item.stableKey))
      .toContain("python.gil.concurrency");
    expect(database.listQuestionBank({ search: "cpython" }).items.map((item) => item.stableKey))
      .toContain("python.gil.concurrency");
    const detail = database.getQuestionBankItem(gil.items[0]!.id);
    expect(detail).toMatchObject({
      intent: expect.any(String),
      source: expect.objectContaining({ type: "builtin", license: "Project bundled content" }),
    });
    expect(detail?.rubric).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "gil-boundary", critical: true }),
    ]));
    expect(database.importQuestionBankCatalog(catalog)).toMatchObject({
      inserted: catalog.questions.length,
      alreadyImported: catalog.packs.length,
    });
    database.close();
  });

  it("rolls back the whole catalog when a later pack conflicts", async () => {
    const { database } = await createDatabase();
    const catalog = await loadQuestionBankCatalog(join(process.cwd(), "resources", "interview-question-bank"));
    const firstPack = catalog.packs[0]!;
    const conflictingPack = {
      ...firstPack,
      pack: { ...firstPack.pack, id: "test.conflicting-pack" },
      questions: [{
        ...firstPack.questions[0]!,
        prompt: "同一题目版本的冲突内容",
      }],
    };
    expect(() => database.importQuestionBankCatalog({
      ...catalog,
      packs: [firstPack, conflictingPack],
      questions: [...firstPack.questions, ...conflictingPack.questions],
    })).toThrow("第 1 版内容冲突");
    expect(database.getQuestionBankSnapshot()).toMatchObject({ total: 0, published: 0 });
    database.close();
  });

  it("migrates a v5 question bank to v6 without changing its durable data", async () => {
    const { path, database } = await createDatabase();
    database.importQuestionPackage(practiceQuestionPackage());
    const question = database.getQuestionBankItem("practice.one");
    expect(question).not.toBeNull();
    database.setQuestionFavorite(question!.id, true);
    database.close();

    const v5 = new DatabaseSync(path);
    v5.exec(`
      DROP TABLE question_practice_progress;
      DROP TABLE question_practice_attempts;
      DROP TABLE question_practice_items;
      DROP TABLE question_practice_sessions;
      DELETE FROM schema_migrations WHERE version IN (6, 7);
    `);
    expect((v5.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version)
      .toBe(5);
    v5.close();

    const upgraded = new InterviewDatabase(path);
    expect(upgraded.getSchemaVersion()).toBe(7);
    expect(upgraded.getQuestionBankItem(question!.id)).toMatchObject({
      stableKey: "practice.one",
      version: 1,
      favorite: true,
    });
    expect(upgraded.getQuestionPracticeOverview()).toEqual({
      completedSessions: 0,
      practicedQuestions: 0,
      dueReview: 0,
    });
    upgraded.close();

    const inspected = new DatabaseSync(path, { readOnly: true });
    expect(inspected.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect((inspected.prepare(`
      SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 6
    `).get() as { count: number }).count).toBe(1);
    inspected.close();
  });

  it("rolls back a failed v6 practice migration and succeeds on retry", async () => {
    const { path, database } = await createDatabase();
    database.importQuestionPackage(practiceQuestionPackage());
    database.close();

    const v5 = new DatabaseSync(path);
    v5.exec(`
      DROP TABLE question_practice_progress;
      DROP TABLE question_practice_attempts;
      DROP TABLE question_practice_items;
      DROP TABLE question_practice_sessions;
      DELETE FROM schema_migrations WHERE version IN (6, 7);
      CREATE TRIGGER fail_v6_migration
      BEFORE INSERT ON schema_migrations
      WHEN NEW.version = 6
      BEGIN
        SELECT RAISE(ABORT, 'injected v6 migration failure');
      END;
    `);
    v5.close();

    expect(() => new InterviewDatabase(path)).toThrow("injected v6 migration failure");
    const rolledBack = new DatabaseSync(path);
    expect((rolledBack.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version)
      .toBe(5);
    expect(rolledBack.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'question_practice_sessions'
    `).get()).toBeUndefined();
    expect((rolledBack.prepare("SELECT COUNT(*) AS count FROM question_bank_items").get() as { count: number }).count)
      .toBe(2);
    rolledBack.exec("DROP TRIGGER fail_v6_migration");
    rolledBack.close();

    const retried = new InterviewDatabase(path);
    expect(retried.getSchemaVersion()).toBe(7);
    expect(retried.getQuestionBankSnapshot()).toMatchObject({ published: 2 });
    retried.close();
  });

  it("upgrades an early v6 practice database with elapsed draft time without losing its draft", async () => {
    const { path, database } = await createDatabase();
    database.importQuestionPackage(practiceQuestionPackage());
    const started = database.startQuestionPractice({
      operationId: "practice-v6-timing",
      selection: {
        kind: "filtered",
        query: { skill: "practice" },
        count: 1,
        order: "latest",
      },
    });
    database.saveQuestionPracticeDraft({
      sessionId: started.id,
      itemId: started.currentItem!.id,
      draftRevision: 1,
      answer: "旧版 v6 草稿",
      elapsedSeconds: 12,
    });
    database.close();

    const earlyV6 = new DatabaseSync(path);
    earlyV6.exec(`
      DELETE FROM schema_migrations WHERE version = 7;
      ALTER TABLE question_practice_items DROP COLUMN draft_elapsed_seconds;
    `);
    expect((earlyV6.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version)
      .toBe(6);
    earlyV6.close();

    const upgraded = new InterviewDatabase(path);
    expect(upgraded.getSchemaVersion()).toBe(7);
    expect(upgraded.getQuestionPracticeSession(started.id)?.currentItem).toMatchObject({
      draftAnswer: "旧版 v6 草稿",
      draftRevision: 1,
      elapsedSeconds: 0,
    });
    expect(upgraded.saveQuestionPracticeDraft({
      sessionId: started.id,
      itemId: started.currentItem!.id,
      draftRevision: 2,
      answer: "升级后的草稿",
      elapsedSeconds: 23,
    })).toMatchObject({
      sessionId: started.id,
      itemId: started.currentItem!.id,
      draftRevision: 2,
    });
    expect(upgraded.getQuestionPracticeSession(started.id)?.currentItem).toMatchObject({
      draftAnswer: "升级后的草稿",
      draftRevision: 2,
      elapsedSeconds: 23,
    });
    upgraded.close();

    const inspected = new DatabaseSync(path, { readOnly: true });
    expect((inspected.prepare(`
      SELECT COUNT(*) AS count
      FROM pragma_table_info('question_practice_items')
      WHERE name = 'draft_elapsed_seconds'
    `).get() as { count: number }).count).toBe(1);
    expect(inspected.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    inspected.close();
  });

  it("persists an idempotent practice, protects drafts, and restores history", async () => {
    const { path, database } = await createDatabase();
    database.importQuestionPackage(practiceQuestionPackage());
    const request = {
      operationId: "practice-start-1",
      selection: {
        kind: "filtered" as const,
        query: { skill: "practice" },
        count: 2,
        order: "latest" as const,
      },
    };
    const started = database.startQuestionPractice(request);
    expect(started).toMatchObject({
      status: "active",
      questionCount: 2,
      currentOrdinal: 0,
      stateVersion: 0,
      summary: { answered: 0, reviewed: 0, skipped: 0 },
    });
    expect(started.currentItem).toMatchObject({
      status: "answering",
      draftAnswer: "",
      draftRevision: 0,
      coveredRubricIds: [],
    });
    expect(started.currentItem).not.toHaveProperty("review");
    expect(database.startQuestionPractice(request).id).toBe(started.id);
    expect(() => database.startQuestionPractice({
      ...request,
      operationId: "practice-start-while-active",
    })).toThrow("已有进行中的题库练习");

    const firstItem = started.currentItem!;
    expect(database.saveQuestionPracticeDraft({
      sessionId: started.id,
      itemId: firstItem.id,
      draftRevision: 2,
      answer: "最新草稿",
      elapsedSeconds: 17,
    })).toMatchObject({ draftRevision: 2 });
    expect(database.saveQuestionPracticeDraft({
      sessionId: started.id,
      itemId: firstItem.id,
      draftRevision: 1,
      answer: "延迟到达的旧草稿",
      elapsedSeconds: 20,
    })).toMatchObject({ draftRevision: 2 });
    expect(database.getQuestionPracticeSession(started.id)?.currentItem).toMatchObject({
      draftRevision: 2,
      draftAnswer: "最新草稿",
      elapsedSeconds: 20,
    });
    expect(() => database.submitQuestionPracticeAnswer({
      sessionId: started.id,
      itemId: firstItem.id,
      operationId: "practice-submit-stale",
      expectedStateVersion: 0,
      draftRevision: 1,
      answer: "延迟到达的旧草稿",
      elapsedSeconds: 10,
    })).toThrow("练习草稿已更新");

    const submitRequest = {
      sessionId: started.id,
      itemId: firstItem.id,
      operationId: "practice-submit-1",
      expectedStateVersion: 0,
      draftRevision: 2,
      answer: "最新草稿",
      elapsedSeconds: 23,
    };
    const reviewing = database.submitQuestionPracticeAnswer(submitRequest);
    expect(reviewing).toMatchObject({ stateVersion: 1, currentOrdinal: 0 });
    expect(reviewing.currentItem).toMatchObject({
      status: "reviewing",
      answerText: "最新草稿",
      elapsedSeconds: 23,
      review: {
        answerOutline: [expect.stringContaining("版答案要点")],
        rubric: [{ id: "core", critical: true }],
      },
    });
    expect(database.submitQuestionPracticeAnswer(submitRequest)).toMatchObject({ stateVersion: 1 });
    expect(() => database.submitQuestionPracticeAnswer({
      ...submitRequest,
      operationId: "practice-submit-conflict",
      expectedStateVersion: 0,
    })).toThrow();

    const reviewRequest = {
      sessionId: started.id,
      itemId: firstItem.id,
      operationId: "practice-review-1",
      expectedStateVersion: 1,
      selfRating: "needs_review" as const,
      coveredRubricIds: ["core"],
      note: "需要重新练习",
    };
    const advanced = database.completeQuestionPracticeReview(reviewRequest);
    expect(advanced).toMatchObject({
      status: "active",
      currentOrdinal: 1,
      stateVersion: 2,
      summary: {
        answered: 1,
        reviewed: 1,
        ratingCounts: { needs_review: 1, developing: 0, mastered: 0 },
        weakSkills: [{ value: "practice", count: 1 }],
      },
    });
    expect(advanced.currentItem).toMatchObject({ status: "answering" });
    expect(advanced.currentItem).not.toHaveProperty("review");
    expect(database.completeQuestionPracticeReview(reviewRequest)).toMatchObject({
      currentOrdinal: 1,
      stateVersion: 2,
    });

    const secondItem = advanced.currentItem!;
    const skipRequest = {
      sessionId: started.id,
      itemId: secondItem.id,
      operationId: "practice-skip-2",
      expectedStateVersion: 2,
    };
    const completed = database.skipQuestionPracticeItem(skipRequest);
    expect(completed).toMatchObject({
      status: "completed",
      currentOrdinal: 2,
      stateVersion: 3,
      currentItem: null,
      summary: { answered: 1, reviewed: 1, skipped: 1, totalElapsedSeconds: 23 },
    });
    expect(database.skipQuestionPracticeItem(skipRequest)).toMatchObject({ status: "completed", stateVersion: 3 });
    expect(database.getQuestionPracticeOverview()).toMatchObject({
      completedSessions: 1,
      practicedQuestions: 1,
      dueReview: 1,
    });
    expect(database.getQuestionPracticeOverview()).not.toHaveProperty("activeSession");
    expect(database.listQuestionPracticeHistory({ limit: 1 })).toMatchObject({
      total: 1,
      limit: 1,
      hasMore: false,
      items: [{ id: started.id, status: "completed", answered: 1, reviewed: 1, skipped: 1 }],
    });
    database.close();

    const reopened = new InterviewDatabase(path);
    expect(reopened.getQuestionPracticeSession(started.id)).toMatchObject({
      status: "completed",
      summary: { answered: 1, reviewed: 1, skipped: 1 },
    });
    reopened.close();
  });

  it("keeps a practice snapshot immutable across question revisions", async () => {
    const { database } = await createDatabase();
    database.importQuestionPackage(practiceQuestionPackage(1));
    const question = database.getQuestionBankItem("practice.one")!;
    const session = database.startQuestionPractice({
      operationId: "snapshot-start-v1",
      selection: { kind: "single", questionId: question.id, expectedVersion: 1 },
    });
    expect(session.currentItem?.prompt).toBe("第 1 版题目 1");

    database.importQuestionPackage(practiceQuestionPackage(2));
    expect(database.getQuestionBankItem(question.id)?.prompt).toBe("第 2 版题目 1");
    expect(database.getQuestionPracticeSession(session.id)?.currentItem?.prompt).toBe("第 1 版题目 1");
    const reviewing = database.submitQuestionPracticeAnswer({
      sessionId: session.id,
      itemId: session.currentItem!.id,
      operationId: "snapshot-submit-v1",
      expectedStateVersion: 0,
      draftRevision: 1,
      answer: "我的回答",
    });
    expect(reviewing.currentItem?.review?.answerOutline).toEqual(["第 1 版答案要点 1"]);
    database.completeQuestionPracticeReview({
      sessionId: session.id,
      itemId: session.currentItem!.id,
      operationId: "snapshot-review-v1",
      expectedStateVersion: 1,
      selfRating: "mastered",
      coveredRubricIds: ["core"],
    });

    expect(() => database.startQuestionPractice({
      operationId: "snapshot-stale-version",
      selection: { kind: "single", questionId: question.id, expectedVersion: 1 },
    })).toThrow("题目版本已经更新");
    const next = database.startQuestionPractice({
      operationId: "snapshot-start-v2",
      selection: { kind: "single", questionId: question.id, expectedVersion: 2 },
    });
    expect(next.currentItem).toMatchObject({ version: 2, prompt: "第 2 版题目 1" });
    const abandoned = database.abandonQuestionPracticeSession({
      sessionId: next.id,
      operationId: "snapshot-abandon-v2",
      expectedStateVersion: 0,
    });
    expect(abandoned).toMatchObject({ status: "abandoned", stateVersion: 1, currentItem: null });
    expect(database.abandonQuestionPracticeSession({
      sessionId: next.id,
      operationId: "snapshot-abandon-v2",
      expectedStateVersion: 0,
    })).toMatchObject({ status: "abandoned", stateVersion: 1 });
    database.close();
  });
});
