import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseKnowledgeText } from "./document-parser";
import { DEFAULT_KNOWLEDGE_AI_SETTINGS } from "../../shared/contracts/knowledge-studio";
import { KnowledgeStudioDatabase, type StoredCandidate } from "./knowledge-studio-database";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function candidate(ordinal: number): StoredCandidate {
  return {
    ordinal,
    kind: "technical",
    difficulty: "intermediate",
    competency: "Agent 工程",
    question: `问题 ${ordinal + 1}`,
    answer: `答案 ${ordinal + 1}`,
    rubric: [{ title: "准确性", description: "答案由资料支持", weight: 100 }],
    pitfalls: [],
    followUps: [],
    evidence: [],
    validationStatus: "supported",
    validationNotes: [],
  };
}

describe("KnowledgeStudioDatabase", () => {
  it("adds AI settings to an existing generation table without discarding old batches", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-knowledge-settings-migration-"));
    cleanup.push(directory);
    const path = join(directory, "knowledge-studio.db");
    const legacy = new DatabaseSync(path);
    legacy.exec(`CREATE TABLE generation_batches (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, target_role TEXT NOT NULL,
      requested_question_count INTEGER NOT NULL, difficulty TEXT NOT NULL, status TEXT NOT NULL,
      stage TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, error TEXT, provider_id TEXT,
      model_id TEXT, usage_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );`);
    legacy.prepare("INSERT INTO generation_batches (id, title, target_role, requested_question_count, difficulty, status, stage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("legacy-batch", "旧任务", "工程师", 1, "mixed", "review", "review", "2026-09-21", "2026-09-21");
    legacy.close();

    const database = new KnowledgeStudioDatabase(path);
    try {
      expect(database.getBatch("legacy-batch")).toMatchObject({ title: "旧任务" });
      expect(database.getBatch("legacy-batch")?.aiSettings).toBeUndefined();
      const now = "2026-09-23";
      database.addSource("source-a", parseKnowledgeText("source-a", "资料 A", "这份资料有可供出题的足够长的正文，用于测试旧数据库迁移后的新任务创建。Agent 工具调用必须先校验权限，并记录执行结果和审计信息。"), now);
      expect(database.createBatch({ id: "new-batch", title: "新任务", targetRole: "工程师", questionCount: 1,
        difficulty: "mixed", sourceIds: ["source-a"], aiSettings: DEFAULT_KNOWLEDGE_AI_SETTINGS, createdAt: now,
      }).aiSettings).toEqual(DEFAULT_KNOWLEDGE_AI_SETTINGS);
    } finally {
      database.close();
    }
  });

  it("persists sources and counts reviews once across a multi-source batch", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-knowledge-database-"));
    cleanup.push(directory);
    const database = new KnowledgeStudioDatabase(join(directory, "knowledge-studio.db"));
    const now = "2026-09-21T00:00:00.000Z";
    try {
      database.addSource("source-a", parseKnowledgeText("source-a", "资料 A", "这是资料 A 的正文，包含足够的信息用于批量生成可靠的面试题目和参考答案，并验证资料来源与证据引用。"), now);
      database.addSource("source-b", parseKnowledgeText("source-b", "资料 B", "这是资料 B 的正文，包含另一个知识点以及可以追踪的来源证据内容，并用于测试多资料任务的统计结果。"), now);
      database.createBatch({
        id: "batch-1", title: "Agent 批次", targetRole: "Agent 工程师", questionCount: 2,
        difficulty: "mixed", sourceIds: ["source-a", "source-b"], createdAt: now,
        aiSettings: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS, timeoutMs: 90_000 },
      });
      database.replaceCandidates("batch-1", [candidate(0), candidate(1)], now);
      database.addGenerationEvent({ batchId: "batch-1", stage: "extracting", state: "completed", progress: 18,
        message: "已收到模型回复", createdAt: now,
        details: { kind: "model-call", phase: "response", purpose: "drafts", promptVersion: "test.v1",
          systemPrompt: "系统提示词", userPayload: "资料内容", responseText: "模型回复", elapsedMs: 1200,
          timeoutMs: 120000, maxOutputTokens: 12000, temperature: 0.35 },
      });
      database.reviewCandidate({ candidateId: "batch-1:candidate:0", status: "approved" }, now);

      const batch = database.getBatch("batch-1");
      expect(batch).toMatchObject({
        sourceIds: ["source-a", "source-b"],
        aiSettings: { timeoutMs: 90_000 },
        candidateCount: 2,
        approvedCount: 1,
        rejectedCount: 0,
        events: [expect.objectContaining({ details: expect.objectContaining({ responseText: "模型回复", elapsedMs: 1200 }) })],
      });
      expect(database.getSource("source-a")?.segments).toHaveLength(1);
      expect(database.resetBatch("batch-1", now).aiSettings?.timeoutMs).toBe(90_000);
      expect(database.getBatch("batch-1")?.events).toEqual([
        expect.objectContaining({ details: expect.objectContaining({ responseText: "模型回复" }) }),
        expect.objectContaining({ message: expect.stringContaining("上一轮调用及失败诊断记录已保留") }),
      ]);
      expect(() => database.deleteSource("source-a")).toThrow("被 1 个生成任务引用");
      expect(database.deleteSource("source-a", true)).toEqual({
        deleted: true,
        deletedBatchIds: ["batch-1"],
        artifactPaths: [],
      });
      expect(database.getBatch("batch-1")).toBeNull();
      expect(database.getSource("source-a")).toBeNull();
      expect(database.getSource("source-b")).not.toBeNull();
    } finally {
      database.close();
    }
  });
});
