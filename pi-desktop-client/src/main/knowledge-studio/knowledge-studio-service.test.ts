import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_KNOWLEDGE_AI_SETTINGS } from "../../shared/contracts/knowledge-studio";
import type { KnowledgeGenerationWorkflow } from "./knowledge-model-provider";
import { KnowledgeStudioService } from "./knowledge-studio-service";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("KnowledgeStudioService", () => {
  it("previews with the same planner and pins runtime model capacity for the task", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-knowledge-window-preview-"));
    cleanup.push(directory);
    const plan = vi.fn<KnowledgeGenerationWorkflow["plan"]>(() => ({ windowCount: 1, coveredSegments: 1 } as never));
    const generate = vi.fn<KnowledgeGenerationWorkflow["generate"]>(async () => ({
      candidates: [], providerId: "provider", modelId: "model", usage: {}, requestHash: "b".repeat(64),
    }));
    const service = new KnowledgeStudioService({ dataDirectory: directory, workflow: { plan, generate },
      resolveModel: async () => ({ providerId: "provider", modelId: "model" }),
      listModels: async () => [{ providerId: "provider", modelId: "model", name: "Model",
        reasoningLevels: [], contextWindowTokens: 258_000, maxOutputTokens: 16_000 }] });
    try {
      const source = await service.importText({ title: "预览资料", content: "这是需要完整纳入窗口的资料正文。题目应依据原始片段并保留来源，不应截断后半部分。" });
      const request = { title: "预览", targetRole: "工程师", sourceIds: [source.id], questionCount: 1,
        difficulty: "basic", privacyConfirmed: true };
      await expect(service.previewBatch(request)).resolves.toMatchObject({ windowCount: 1, coveredSegments: 1 });
      await expect(service.previewBatch({ ...request, questionCount: 100 })).resolves.toMatchObject({ windowCount: 1 });
      await expect(service.previewBatch({ ...request, questionCount: 501 })).rejects.toThrow("题目数量必须为 1-500");
      expect(plan.mock.calls[0]![0].aiSettings).toMatchObject({ model: { providerId: "provider", modelId: "model" },
        modelContextWindowTokens: 258_000, modelMaxOutputTokens: 16_000 });
      const legacyStage = { additionalSystemInstruction: "", temperature: 0.35, maxOutputTokens: 12_000 };
      await expect(service.previewBatch({ ...request, aiSettings: {
        ...DEFAULT_KNOWLEDGE_AI_SETTINGS,
        stages: { drafts: legacyStage, answers: legacyStage, review: legacyStage },
      } })).resolves.toMatchObject({ windowCount: 1, coveredSegments: 1 });
      expect(plan.mock.calls[2]![0].aiSettings?.stages.drafts).toEqual({ additionalSystemInstruction: "" });
      const batch = await service.createBatch(request);
      expect(batch.aiSettings).toMatchObject({ modelContextWindowTokens: 258_000 });
    } finally {
      await service.close();
    }
  });
  it("passes every selected source character to the planner without the old 72k cutoff", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-knowledge-full-source-"));
    cleanup.push(directory);
    const generate = vi.fn<KnowledgeGenerationWorkflow["generate"]>(async () => ({
      candidates: [], providerId: "test", modelId: "test", usage: {}, requestHash: "a".repeat(64),
    }));
    const service = new KnowledgeStudioService({ dataDirectory: directory, workflow: { generate } });
    try {
      const content = "A".repeat(105_000);
      const source = await service.importText({ title: "长资料", content });
      const batch = await service.createBatch({ title: "全量检查", targetRole: "工程师", sourceIds: [source.id],
        questionCount: 1, difficulty: "basic", privacyConfirmed: true });
      for (let attempt = 0; attempt < 40 && !generate.mock.calls.length; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(generate).toHaveBeenCalledOnce();
      expect(generate.mock.calls[0]![0].segments.map((segment) => segment.content).join("")).toBe(content);
      expect(service.getBatch(batch.id)?.events.find((event) => event.details?.kind === "source-selection")?.details?.selection)
        .toMatchObject({ selectedCharacters: content.length });
    } finally {
      await service.close();
    }
  });
  it("rebuilds legacy HTML segments from the saved original on startup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-knowledge-html-migration-"));
    cleanup.push(directory);
    const html = `<!doctype html><html><head><title>Agent 文档</title></head><body><main>
      <h1>Agent orchestration</h1>
      <p>${"Orchestration keeps tool calls explicit, auditable, and bounded by policy. ".repeat(45)}</p>
      <h2>Guardrails</h2>
      <p>${"Input and output guardrails should fail closed and preserve trace evidence. ".repeat(35)}</p>
    </main></body></html>`;
    const first = new KnowledgeStudioService({ dataDirectory: directory });
    const source = await first.importText({ title: "Agent 文档", content: html, format: "html" });
    await first.close();

    const database = new DatabaseSync(join(directory, "knowledge-studio.db"));
    database.exec("PRAGMA foreign_keys = ON");
    database.prepare("UPDATE source_documents SET parser_version = 1 WHERE id = ?").run(source.id);
    database.prepare("DELETE FROM source_segments WHERE document_id = ?").run(source.id);
    const insert = database.prepare(`
      INSERT INTO source_segments (id, document_id, ordinal, content, start_offset, end_offset)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (let ordinal = 0; ordinal < 40; ordinal += 1) {
      insert.run(`${source.id}:legacy:${ordinal}`, source.id, ordinal, `旧片段 ${ordinal}`, ordinal, ordinal + 4);
    }
    database.close();

    const migrated = new KnowledgeStudioService({ dataDirectory: directory });
    try {
      const detail = migrated.getSource(source.id);
      expect(detail?.segments.length).toBeGreaterThan(0);
      expect(detail?.segments.length).toBeLessThan(10);
      expect(detail?.segments[0]?.id).toBe(`${source.id}:segment:0`);
      expect(detail?.contentPreview).toContain("Agent orchestration");
    } finally {
      await migrated.close();
    }

    const verified = new DatabaseSync(join(directory, "knowledge-studio.db"), { readOnly: true });
    expect(verified.prepare("SELECT parser_version FROM source_documents WHERE id = ?").get(source.id)).toMatchObject({ parser_version: 2 });
    verified.close();
  });

  it("runs the local import, generation, review and versioned publish loop", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-knowledge-service-"));
    cleanup.push(directory);
    const generate = vi.fn<KnowledgeGenerationWorkflow["generate"]>(async (input, _signal, progress) => {
      progress("extracting", 20, "提取知识点", { state: "running" });
      progress("answering", 55, "生成答案", { state: "running" });
      progress("validating", 85, "校验证据", { state: "running" });
      const segment = input.segments[0]!;
      const quote = "Agent 需要明确的工具权限边界";
      return {
        providerId: "test-provider",
        modelId: "test-model",
        usage: { totalTokens: 120 },
        requestHash: "a".repeat(64),
        candidates: [{
          ordinal: 0,
          kind: "technical",
          difficulty: "intermediate",
          competency: "Agent 安全",
          question: "为什么 Agent 需要工具权限边界？",
          answer: "权限边界可以约束副作用，并提供审计依据。",
          rubric: [{ title: "边界", description: "说明权限和审计", weight: 100 }],
          pitfalls: ["默认信任所有工具"],
          followUps: ["如何记录审计事件？"],
          evidence: [{ segmentId: segment.id, sourceId: segment.sourceId, sourceTitle: segment.sourceTitle, quote }],
          validationStatus: "supported",
          validationNotes: [],
        }],
      };
    });
    const service = new KnowledgeStudioService({
      dataDirectory: directory,
      workflow: { generate },
      resolveModel: async () => ({ providerId: "test-provider", modelId: "test-model" }),
      listModels: async () => [{ providerId: "test-provider", modelId: "test-model", name: "Test Model", reasoningLevels: ["low", "high"] }],
      now: () => new Date("2026-09-21T00:00:00.000Z"),
    });
    try {
      const source = await service.importText({
        title: "Agent 安全资料",
        content: "Agent 需要明确的工具权限边界，并对每次产生副作用的调用保留可追溯审计记录，避免资料中的提示直接触发工具。",
      });
      await expect(service.getSourceOriginal(source.id)).resolves.toMatchObject({
        sourceId: source.id,
        fileName: "original.text",
        mode: "text",
        content: "Agent 需要明确的工具权限边界，并对每次产生副作用的调用保留可追溯审计记录，避免资料中的提示直接触发工具。",
        truncated: false,
        extracted: false,
      });
      await expect(service.getModelInfo()).resolves.toEqual({
        configured: true,
        providerId: "test-provider",
        modelId: "test-model",
        availableModels: [{ providerId: "test-provider", modelId: "test-model", name: "Test Model", reasoningLevels: ["low", "high"] }],
      });
      const progress = vi.fn();
      const batch = await service.createBatch({
        title: "Agent 面试题包",
        targetRole: "Agent 工程师",
        sourceIds: [source.id],
        questionCount: 1,
        difficulty: "mixed",
        privacyConfirmed: true,
        aiSettings: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS, model: { providerId: "test-provider", modelId: "test-model" }, thinkingLevel: "high" },
      }, progress);

      expect(batch.status).toBe("queued");
      let generated = service.getBatch(batch.id)!;
      for (let attempt = 0; attempt < 30 && generated.status !== "review"; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        generated = service.getBatch(batch.id)!;
      }
      expect(generated.status).toBe("review");
      expect(generated.candidates).toHaveLength(1);
      expect(generated.aiSettings).toMatchObject({ model: { providerId: "test-provider", modelId: "test-model" }, thinkingLevel: "high" });
      expect(generate.mock.calls[0]?.[0].aiSettings).toMatchObject({ model: { providerId: "test-provider", modelId: "test-model" }, thinkingLevel: "high" });
      expect(generated.events.find((event) => event.details?.kind === "source-selection")?.details?.selection).toMatchObject({
        selectedSegments: expect.any(Number), selectedCharacters: expect.any(Number),
        sources: [expect.objectContaining({ sourceId: source.id, included: expect.any(Number) })],
      });
      expect(generated.events.map((event) => event.stage)).toEqual([
        "extracting", "extracting", "extracting", "answering", "validating", "review",
      ]);
      expect(generated.events.at(-1)).toMatchObject({
        state: "completed",
        providerId: "test-provider",
        modelId: "test-model",
        usage: { totalTokens: 120 },
      });
      expect(generate).toHaveBeenCalledOnce();
      expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ status: "review", progress: 100 }));

      const reviewed = service.reviewCandidate({
        candidateId: generated.candidates[0]!.id,
        status: "approved",
      });
      expect(reviewed.approvedCount).toBe(1);

      const published = await service.publishBatch(batch.id);
      expect(published.status).toBe("published");
      expect(published.artifact).toMatchObject({ version: 1, questionCount: 1 });
      const artifact = JSON.parse(await readFile(published.artifact!.path, "utf8")) as Record<string, unknown>;
      expect(artifact).toMatchObject({ schemaVersion: 1, title: "Agent 面试题包", version: 1,
        generation: { model: { providerId: "test-provider", modelId: "test-model" }, thinkingLevel: "high" } });
      expect(String(artifact.contentHash)).toMatch(/^[a-f0-9]{64}$/u);
      expect(service.getSnapshot()).toMatchObject({ sourceCount: 1, candidateCount: 1, publishedCount: 1 });

      await expect(service.deleteSource({ id: source.id })).rejects.toThrow("连同这些任务");
      await expect(service.deleteBatch(batch.id)).resolves.toEqual({
        deleted: true,
        deletedArtifactCount: 1,
      });
      expect(service.getSnapshot()).toMatchObject({ sourceCount: 1, candidateCount: 0, publishedCount: 0 });
      await expect(readFile(published.artifact!.path, "utf8")).rejects.toThrow();
      await expect(service.deleteSource(source.id)).resolves.toEqual({
        deleted: true,
        deletedBatchCount: 0,
        deletedArtifactCount: 0,
      });
      expect(service.getSnapshot()).toMatchObject({ sourceCount: 0, candidateCount: 0, publishedCount: 0 });
    } finally {
      await service.close();
    }
  });

  it("requires an explicit privacy confirmation before model generation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-knowledge-privacy-"));
    cleanup.push(directory);
    const workflow = { generate: vi.fn<KnowledgeGenerationWorkflow["generate"]>() };
    const service = new KnowledgeStudioService({ dataDirectory: directory, workflow });
    try {
      const source = await service.importText({
        title: "私有资料",
        content: "这是一份用于验证隐私确认边界的内部资料，只有用户明确确认后才能发送给当前配置的模型供应商。",
      });
      await expect(service.createBatch({
        title: "未确认任务", targetRole: "工程师", sourceIds: [source.id], questionCount: 1,
        difficulty: "basic", privacyConfirmed: false,
      })).rejects.toThrow("需要确认");
      await expect(service.createBatch({
        title: "参数错误任务", targetRole: "工程师", sourceIds: [source.id], questionCount: 1,
        difficulty: "basic", privacyConfirmed: true,
        aiSettings: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS, timeoutMs: 1_000 },
      })).rejects.toThrow("模型超时必须");
      await expect(service.createBatch({
        title: "思考参数错误", targetRole: "工程师", sourceIds: [source.id], questionCount: 1,
        difficulty: "basic", privacyConfirmed: true,
        aiSettings: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS, thinkingLevel: "unsupported" as never },
      })).rejects.toThrow("思考程度无效");
      await expect(service.createBatch({
        title: "模型参数错误", targetRole: "工程师", sourceIds: [source.id], questionCount: 1,
        difficulty: "basic", privacyConfirmed: true,
        aiSettings: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS, model: { providerId: "not valid", modelId: "model" } },
      })).rejects.toThrow("所选模型无效");
      expect(workflow.generate).not.toHaveBeenCalled();
    } finally {
      await service.close();
    }
  });
});
