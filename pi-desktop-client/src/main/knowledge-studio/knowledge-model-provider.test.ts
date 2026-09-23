import { describe, expect, it, vi } from "vitest";
import { aiFailure, aiSuccess } from "../../platform/shared/ai/contracts";
import type { ModelGateway, ModelRequest, ModelResponse, ModelStreamEvent } from "../../platform/shared/ai/model-gateway";
import { estimateJsonRequestTokens } from "../../platform/shared/ai/token-estimate";
import { DEFAULT_KNOWLEDGE_AI_SETTINGS, knowledgeSystemPrompt, type KnowledgeGenerationEvent } from "../../shared/contracts/knowledge-studio";
import { KnowledgeGenerationWorkflow } from "./knowledge-model-provider";

function response(text: string, index: number): ModelResponse {
  return {
    requestId: `request-${index}`,
    model: { providerId: "test-provider", modelId: "test-model" },
    text,
    finishReason: "stop",
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  };
}

class QueueGateway implements ModelGateway {
  readonly requests: ModelRequest[] = [];
  private index = 0;
  async getConfiguredModel() { return { providerId: "test-provider", modelId: "test-model" }; }
  async getAvailableModels() { return [
    { providerId: "test-provider", modelId: "test-model", name: "Test", reasoningLevels: [] as [], contextWindowTokens: 128_000 },
    { providerId: "custom-provider", modelId: "reasoning-model", name: "Reasoning", reasoningLevels: ["high"] as ["high"], contextWindowTokens: 128_000 },
  ]; }

  constructor(
    private readonly responses: Array<string | { timeout: true } | { error: "provider_unavailable" | "invalid_request" | "budget_exceeded" | "invalid_provider_response" }>,
    private readonly diagnostics?: Extract<ModelStreamEvent, { type: "started" }>["diagnostics"],
  ) {}

  generate = vi.fn(async (request: ModelRequest) => {
    this.requests.push(request);
    const index = this.index++;
    const queued = this.responses[index] ?? "";
    if (typeof queued === "string") return aiSuccess(response(queued, index));
    if ("error" in queued) return aiFailure({
      code: queued.error,
      message: queued.error === "provider_unavailable" ? "The AI provider is temporarily unavailable" : "The AI request is invalid",
      retryable: queued.error === "provider_unavailable",
      ...(queued.error === "provider_unavailable" ? { diagnosticCode: "FETCH_FAILED" as const } : {}),
    });
    return aiFailure({ code: "timeout", message: "The AI request timed out", retryable: true });
  });

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const result = await this.generate(request);
    if (!result.ok) { yield { type: "failed", error: result.error }; return; }
    yield { type: "started", requestId: result.value.requestId, model: result.value.model, diagnostics: this.diagnostics };
    yield { type: "text_delta", delta: result.value.text };
    yield { type: "completed", response: result.value };
  }
}

describe("KnowledgeGenerationWorkflow", () => {
  it("uses the model's default sampling and output limit while preserving task-specific instructions", async () => {
    const segmentId = "source:segment:0";
    const gateway = new QueueGateway([
      JSON.stringify({ items: [{ ordinal: 0, competency: "安全", kind: "technical", difficulty: "basic", question: "如何校验工具权限？", evidenceSegmentIds: [segmentId] }] }),
      JSON.stringify({ items: [{ ordinal: 0, answer: "先校验权限。", rubric: [{ title: "权限", description: "说明校验", weight: 100 }], pitfalls: [], followUps: [], evidence: [{ segmentId, quote: "先校验权限" }] }] }),
      JSON.stringify({ items: [{ ordinal: 0, verdict: "supported", notes: [] }] }),
    ], { estimatedInputTokens: 234, inputTextCharacters: 321, modelContextWindowTokens: 128_000, temperatureApplied: false });
    const progress = vi.fn();
    const aiSettings = {
      model: { providerId: "custom-provider", modelId: "reasoning-model" },
      thinkingLevel: "high" as const,
      timeoutMs: 90_000,
      stages: {
        drafts: { additionalSystemInstruction: "优先考察安全边界。" },
        answers: { additionalSystemInstruction: "答案要简明。" },
        review: { additionalSystemInstruction: "严格核对证据。" },
      },
    };
    await new KnowledgeGenerationWorkflow(gateway).generate({
      batchId: "batch-config", title: "安全题库", targetRole: "Agent 工程师", difficulty: "basic", questionCount: 1,
      segments: [{ id: segmentId, sourceId: "source", sourceTitle: "资料", content: "先校验权限，再执行工具并记录审计。" }],
      aiSettings,
    }, new AbortController().signal, progress);

    expect(gateway.requests).toHaveLength(3);
    expect(gateway.requests.map((request) => request.temperature)).toEqual([undefined, undefined, undefined]);
    expect(gateway.requests.map((request) => request.model)).toEqual(Array(3).fill({ providerId: "custom-provider", modelId: "reasoning-model" }));
    expect(gateway.requests.map((request) => request.reasoning)).toEqual(["high", "high", "high"]);
    expect(gateway.requests.map((request) => request.metadata.budget?.maxOutputTokens)).toEqual([undefined, undefined, undefined]);
    expect(gateway.requests.every((request) => request.metadata.budget?.timeoutMs === 90_000)).toBe(true);
    expect(gateway.requests.map((request) => request.messages[0]?.content)).toEqual([
      expect.stringContaining("优先考察安全边界。"),
      expect.stringContaining("答案要简明。"),
      expect.stringContaining("严格核对证据。"),
    ]);
    expect(progress).toHaveBeenCalledWith("extracting", 18, expect.stringContaining("网关已解析模型"), expect.objectContaining({
      details: expect.objectContaining({
        phase: "prepared", estimatedInputTokens: 234, inputTextCharacters: 321, modelContextWindowTokens: 128_000,
      }),
    }));
  });

  it("formats the actual system prompt into readable sections without embedding its version label", () => {
    const prompt = knowledgeSystemPrompt("answers", "优先考察真实项目经验。");
    expect(prompt).toContain("【职责】\n");
    expect(prompt).toContain("\n\n【answer：口头回答】\n");
    expect(prompt).toContain("\n\n【输出】\n");
    expect(prompt).toContain("【用户补充要求】\n优先考察真实项目经验。");
    expect(prompt).not.toContain("提示词版本");
  });

  it("requires interview questions to be understandable without source material", () => {
    const draftPrompt = knowledgeSystemPrompt("drafts", "");
    const reviewPrompt = knowledgeSystemPrompt("review", "");
    expect(draftPrompt).toContain("候选人在面试中看不到 sources");
    expect(draftPrompt).toContain("技术或业务对象、作答所需的前提");
    expect(draftPrompt).toContain("在 LangGraph 工作流中");
    expect(draftPrompt).toContain("题面写得完整，不代表考点值得考");
    expect(draftPrompt).toContain("酒店预订助手");
    expect(draftPrompt).toContain("即使补全酒店场景仍缺乏区分度；不要改写成更长的题，应舍弃");
    expect(draftPrompt).toContain("不能为补背景而编造资料不支持的事实");
    expect(reviewPrompt).toContain("只读 question");
    expect(reviewPrompt).toContain("判为 needs_review");
    expect(reviewPrompt).toContain("缺房间数量就询问房间数量");
    expect(reviewPrompt).toContain("判为 rejected，而不是 supported 或 needs_review");
    expect(reviewPrompt).toContain("不得因为参考答案可读就放过无法独立理解的题面");
  });

  it("keeps an independently rejected low-value question rejected even when its evidence matches", async () => {
    const segmentId = "booking:segment:0";
    const gateway = new QueueGateway([
      JSON.stringify({ items: [{ ordinal: 0, competency: "订单澄清", kind: "scenario", difficulty: "basic",
        question: "酒店预订时房间数量是必填项，用户没说要几间，下一步怎么办？", evidenceSegmentIds: [segmentId] }] }),
      JSON.stringify({ items: [{ ordinal: 0, answer: "需要先询问用户要几间房。",
        rubric: [{ title: "澄清", description: "询问房间数量", weight: 100 }], pitfalls: [], followUps: [],
        evidence: [{ segmentId, quote: "缺少房间数量时先询问" }] }] }),
      JSON.stringify({ items: [{ ordinal: 0, verdict: "rejected", notes: ["考点过浅，答案由题干直接给出"] }] }),
    ]);
    const result = await new KnowledgeGenerationWorkflow(gateway).generate({
      batchId: "low-value-review", title: "低价值题审核", targetRole: "工程师", difficulty: "basic", questionCount: 1,
      segments: [{ id: segmentId, sourceId: "booking", sourceTitle: "预订资料", content: "缺少房间数量时先询问。" }],
    }, new AbortController().signal, () => undefined);
    expect(result.candidates[0]).toMatchObject({ validationStatus: "rejected",
      validationNotes: ["考点过浅，答案由题干直接给出"] });
  });

  it("plans one large window when seven documents fit the measured 70% input budget", () => {
    const workflow = new KnowledgeGenerationWorkflow(new QueueGateway([]));
    const input = { batchId: "large", title: "大资料", targetRole: "工程师", difficulty: "mixed" as const,
      questionCount: 3, aiSettings: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS, modelContextWindowTokens: 258_000 },
      segments: Array.from({ length: 7 }, (_, index) => ({ id: `source-${index}:segment:0`, sourceId: `source-${index}`,
        sourceTitle: `资料 ${index}`, content: "A".repeat(70_000) })) };
    const preview = workflow.plan(input);
    expect(preview.windowCount).toBe(1);
    expect(preview.availableSegments).toBe(7);
    expect(preview.coveredSegments).toBe(7);
    expect(preview.fullInputBudgetTokens).toBe(180_600);
    expect(preview.windows[0]!.estimatedInputTokens).toBeLessThanOrEqual(preview.fullInputBudgetTokens);
  });

  it("balances two windows and plans each window's full quota in one call", async () => {
    const ids = ["source-a:segment:0", "source-b:segment:0"];
    const segments = ids.map((id, index) => ({ id, sourceId: index === 0 ? "source-a" : "source-b",
      sourceTitle: index === 0 ? "资料 A" : "资料 B", content: (index === 0 ? "A" : "B").repeat(50_000) }));
    const aiSettings = { ...DEFAULT_KNOWLEDGE_AI_SETTINGS, modelContextWindowTokens: 32_000 };
    const input = { batchId: "bulk-100", title: "百题", targetRole: "工程师", difficulty: "mixed" as const,
      questionCount: 100, aiSettings, segments };
    const workflow = new KnowledgeGenerationWorkflow(new QueueGateway([]));
    expect(workflow.plan({ ...input, questionCount: 10 }).windows.map((window) => window.plannedQuestions)).toEqual([5, 5]);
    expect(workflow.plan(input).windows.map((window) => window.plannedQuestions)).toEqual([50, 50]);

    const draftResponses = Array.from({ length: 2 }, (_, windowIndex) => JSON.stringify({ items: Array.from({ length: 50 }, (_, index) => ({
      ordinal: index, competency: `能力 ${windowIndex * 50 + index + 1}`, kind: "technical", difficulty: "basic",
      question: `第 ${windowIndex * 50 + index + 1} 个不同的问题是什么？`, evidenceSegmentIds: [ids[windowIndex]],
    })) }));
    const answerResponses = Array.from({ length: 20 }, (_, batch) => JSON.stringify({ items: Array.from({ length: 5 }, (_, ordinal) => ({
      ordinal, answer: "先确认条件，再说明关键原因。", rubric: [{ title: "要点", description: "说明原因", weight: 100 }],
      pitfalls: [], followUps: [], evidence: [{ segmentId: ids[(batch * 5 + ordinal) % 2],
        quote: (batch * 5 + ordinal) % 2 === 0 ? "A" : "B" }],
    })) }));
    const reviewResponses = Array.from({ length: 10 }, () => JSON.stringify({ items: Array.from({ length: 10 }, (_, ordinal) => ({
      ordinal, verdict: "supported", notes: [],
    })) }));
    const gateway = new QueueGateway([...draftResponses, ...answerResponses, ...reviewResponses]);
    const result = await new KnowledgeGenerationWorkflow(gateway).generate(input, new AbortController().signal, () => undefined);
    expect(result.candidates).toHaveLength(100);
    expect(result.candidates.filter((candidate) => candidate.evidence[0]?.sourceId === "source-a")).toHaveLength(50);
    expect(result.candidates.filter((candidate) => candidate.evidence[0]?.sourceId === "source-b")).toHaveLength(50);
    const planningRequests = gateway.requests.filter((request) => request.metadata.purpose === "question-generation.drafts");
    const answerRequests = gateway.requests.filter((request) => request.metadata.purpose === "question-generation.answers");
    const reviewRequests = gateway.requests.filter((request) => request.metadata.purpose === "question-generation.review");
    expect(planningRequests).toHaveLength(2);
    expect(planningRequests.map((request) => JSON.parse(request.messages[1]!.content).questionCount)).toEqual([50, 50]);
    expect(planningRequests.map((request) => JSON.parse(request.messages[1]!.content).sources[0].segmentId)).toEqual(ids);
    expect(answerRequests).toHaveLength(20);
    expect(answerRequests.every((request) => JSON.parse(request.messages[1]!.content).drafts.length === 5)).toBe(true);
    expect(answerRequests.every((request) => JSON.parse(request.messages[1]!.content).sources.length === 2)).toBe(true);
    expect(reviewRequests).toHaveLength(10);
    expect(reviewRequests.every((request) => JSON.parse(request.messages[1]!.content).questions.length === 10)).toBe(true);
  });

  it("requests 30 questions from a single source window in one planning call", async () => {
    const segmentId = "single-window:segment:0";
    const draft = JSON.stringify({ items: Array.from({ length: 30 }, (_, ordinal) => ({
      ordinal, competency: `能力 ${ordinal}`, kind: "technical", difficulty: "basic",
      question: `第 ${ordinal + 1} 道不同的问题是什么？`, evidenceSegmentIds: [segmentId],
    })) });
    const answers = Array.from({ length: 6 }, () => JSON.stringify({ items: Array.from({ length: 5 }, (_, ordinal) => ({
      ordinal, answer: "先确认事实，再解释理由。", rubric: [{ title: "依据", description: "说明依据", weight: 100 }],
      pitfalls: [], followUps: [], evidence: [{ segmentId, quote: "依据" }],
    })) }));
    const reviews = Array.from({ length: 3 }, () => JSON.stringify({ items: Array.from({ length: 10 }, (_, ordinal) => ({
      ordinal, verdict: "supported", notes: [],
    })) }));
    const gateway = new QueueGateway([draft, ...answers, ...reviews]);
    const result = await new KnowledgeGenerationWorkflow(gateway).generate({
      batchId: "single-window-thirty", title: "单窗三十题", targetRole: "工程师", difficulty: "basic", questionCount: 30,
      segments: [{ id: segmentId, sourceId: "single-window", sourceTitle: "资料", content: "依据：这里包含丰富的知识点。" }],
    }, new AbortController().signal, () => undefined);
    expect(result.candidates).toHaveLength(30);
    const planningRequests = gateway.requests.filter((request) => request.metadata.purpose === "question-generation.drafts");
    expect(planningRequests).toHaveLength(1);
    expect(JSON.parse(planningRequests[0]!.messages[1]!.content).questionCount).toBe(30);
    expect(planningRequests[0]!.responseFormat?.type === "json" && planningRequests[0]!.responseFormat.jsonSchema)
      .toMatchObject({ properties: { items: { maxItems: 30 } } });
  });

  it("splits a planning call when its output fails the provider structure check", async () => {
    const segmentId = "source:segment:0";
    const draft = (start: number) => JSON.stringify({ items: Array.from({ length: 2 }, (_, index) => ({
      ordinal: index, competency: `能力 ${start + index}`, kind: "technical", difficulty: "basic",
      question: `问题 ${start + index}`, evidenceSegmentIds: [segmentId],
    })) });
    const answer = JSON.stringify({ items: Array.from({ length: 4 }, (_, ordinal) => ({ ordinal, answer: "先说明条件，再解释原因。",
      rubric: [{ title: "要点", description: "说明原因", weight: 100 }], pitfalls: [], followUps: [],
      evidence: [{ segmentId, quote: "依据" }] })) });
    const review = JSON.stringify({ items: Array.from({ length: 4 }, (_, ordinal) => ({ ordinal, verdict: "supported", notes: [] })) });
    const gateway = new QueueGateway([{ error: "invalid_provider_response" }, draft(1), draft(3), answer, review]);
    const result = await new KnowledgeGenerationWorkflow(gateway).generate({
      batchId: "output-split", title: "输出拆批", targetRole: "工程师", difficulty: "basic", questionCount: 4,
      segments: [{ id: segmentId, sourceId: "source", sourceTitle: "资料", content: "依据：每个问题都要有事实支持。" }],
    }, new AbortController().signal, () => undefined);
    expect(result.candidates).toHaveLength(4);
    expect(gateway.requests.filter((request) => request.metadata.purpose === "question-generation.drafts")
      .map((request) => JSON.parse(request.messages[1]!.content).questionCount)).toEqual([4, 2, 2]);
  });

  it("tops up missing questions after cross-window deduplication", async () => {
    const segmentId = "source:segment:0";
    const planned = (question: string) => ({ ordinal: 0, competency: "能力", kind: "technical", difficulty: "basic",
      question, evidenceSegmentIds: [segmentId] });
    const answer = JSON.stringify({ items: [0, 1].map((ordinal) => ({ ordinal, answer: "先讲结论，再说明依据。",
      rubric: [{ title: "要点", description: "说明依据", weight: 100 }], pitfalls: [], followUps: [],
      evidence: [{ segmentId, quote: "依据" }] })) });
    const review = JSON.stringify({ items: [{ ordinal: 0, verdict: "supported", notes: [] },
      { ordinal: 1, verdict: "supported", notes: [] }] });
    const gateway = new QueueGateway([JSON.stringify({ items: [planned("相同的问题"), { ...planned("相同的问题"), ordinal: 1 }] }),
      JSON.stringify({ items: [planned("补充的不同问题")] }), answer, review]);
    const result = await new KnowledgeGenerationWorkflow(gateway).generate({
      batchId: "dedup-topup", title: "补题", targetRole: "工程师", difficulty: "basic", questionCount: 2,
      segments: [{ id: segmentId, sourceId: "source", sourceTitle: "资料", content: "依据：这里有多个不同知识点。" }],
    }, new AbortController().signal, () => undefined);
    expect(result.candidates.map((candidate) => candidate.question)).toEqual(["相同的问题", "补充的不同问题"]);
    expect(gateway.requests.filter((request) => request.metadata.purpose === "question-generation.drafts")).toHaveLength(2);
  });

  it("uses a conservative mixed Chinese/English estimate and refuses an unknown capacity", () => {
    expect(estimateJsonRequestTokens("中".repeat(20), {}, "x", { type: "object" }))
      .toBeGreaterThan(estimateJsonRequestTokens("A".repeat(20), {}, "x", { type: "object" }));
    const workflow = new KnowledgeGenerationWorkflow(new QueueGateway([]));
    expect(() => workflow.plan({ batchId: "unknown", title: "容量", targetRole: "工程师", difficulty: "basic",
      questionCount: 1, segments: [{ id: "s:segment:0", sourceId: "s", sourceTitle: "资料", content: "正文" }] }))
      .toThrow("上下文容量未知");
  });

  it("splits an oversized segment without losing any characters or its original evidence ID", async () => {
    const source = "ABC。".repeat(28_000);
    const segmentId = "source-long:segment:0";
    const settings = { ...DEFAULT_KNOWLEDGE_AI_SETTINGS, modelContextWindowTokens: 32_000 };
    const baseInput = { batchId: "split", title: "超长片段", targetRole: "工程师", difficulty: "basic" as const,
      questionCount: 1, aiSettings: settings, segments: [{ id: segmentId, sourceId: "source-long", sourceTitle: "长资料", content: source }] };
    const count = new KnowledgeGenerationWorkflow(new QueueGateway([])).plan(baseInput).windowCount;
    expect(count).toBeGreaterThan(1);
    const draft = (index: number) => JSON.stringify({ items: [{ ordinal: 0, competency: "长度", kind: "technical",
      difficulty: "basic", question: `第 ${index} 个知识点是什么？`, evidenceSegmentIds: [segmentId] }] });
    const gateway = new QueueGateway([
      ...Array.from({ length: count }, (_, index) => draft(index)),
      JSON.stringify({ items: [{ ordinal: 0, answer: "这是资料中的一个知识点。", rubric: [{ title: "准确", description: "解释要点", weight: 100 }], pitfalls: [], followUps: [], evidence: [{ segmentId, quote: "ABC" }] }] }),
      JSON.stringify({ items: [{ ordinal: 0, verdict: "supported", notes: [] }] }),
    ]);
    const result = await new KnowledgeGenerationWorkflow(gateway).generate(baseInput, new AbortController().signal, () => undefined);
    const sentFragments = gateway.requests.filter((request) => request.metadata.purpose === "question-generation.drafts")
      .flatMap((request) => (JSON.parse(request.messages[1]!.content) as { sources: Array<{ segmentId: string; content: string }> }).sources);
    expect(sentFragments.map((fragment) => fragment.content).join("")).toBe(source);
    expect(sentFragments.every((fragment) => fragment.segmentId === segmentId)).toBe(true);
    expect(result.candidates).toHaveLength(1);
    for (const request of gateway.requests) {
      expect(estimateJsonRequestTokens(request.messages[0]!.content, JSON.parse(request.messages[1]!.content),
        request.responseFormat?.type === "json" ? request.responseFormat.schemaName! : "",
        request.responseFormat?.type === "json" ? request.responseFormat.jsonSchema! : {}))
        .toBeLessThanOrEqual(request.metadata.budget!.maxInputTokens!);
    }
  });

  it("reuses completed planning windows after a later window fails", async () => {
    const ids = ["source-1:segment:0", "source-2:segment:0"];
    const input = { batchId: "resume", title: "断点", targetRole: "工程师", difficulty: "basic" as const,
      questionCount: 2, aiSettings: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS, modelContextWindowTokens: 32_000 },
      segments: ids.map((id, index) => ({ id, sourceId: `source-${index + 1}`, sourceTitle: `资料 ${index + 1}`, content: `${index + 1}`.repeat(50_000) })) };
    expect(new KnowledgeGenerationWorkflow(new QueueGateway([])).plan(input).windowCount).toBe(2);
    const draft = (ordinal: number) => JSON.stringify({ items: [{ ordinal: 0, competency: "测试", kind: "technical",
      difficulty: "basic", question: `问题 ${ordinal}`, evidenceSegmentIds: [ids[ordinal]] }] });
    const events: KnowledgeGenerationEvent[] = [];
    const first = new QueueGateway([draft(0), { error: "invalid_request" }]);
    await expect(new KnowledgeGenerationWorkflow(first).generate(input, new AbortController().signal,
      (stage, progress, message, detail) => { if (detail.details) events.push({ id: events.length + 1, batchId: input.batchId,
        stage, state: detail.state, progress, message, details: detail.details, providerId: detail.providerId,
        modelId: detail.modelId, usage: detail.usage, createdAt: "2026-09-23T00:00:00.000Z" }); })).rejects.toThrow();
    const answer = JSON.stringify({ items: ids.map((segmentId, ordinal) => ({ ordinal, answer: "简短回答。",
      rubric: [{ title: "依据", description: "引用原文", weight: 100 }], pitfalls: [], followUps: [],
      evidence: [{ segmentId, quote: String(ordinal + 1) }] })) });
    const retry = new QueueGateway([draft(1), answer,
      JSON.stringify({ items: [{ ordinal: 0, verdict: "supported", notes: [] }, { ordinal: 1, verdict: "supported", notes: [] }] })]);
    const result = await new KnowledgeGenerationWorkflow(retry).generate({ ...input, previousEvents: events },
      new AbortController().signal, () => undefined);
    expect(result.candidates).toHaveLength(2);
    expect(retry.requests.filter((request) => request.metadata.purpose === "question-generation.drafts")).toHaveLength(1);
  });

  it("keeps a completed window checkpoint when the user cancels before the next window", async () => {
    const ids = ["a:segment:0", "b:segment:0"];
    const input = { batchId: "cancel-resume", title: "取消恢复", targetRole: "工程师", difficulty: "basic" as const,
      questionCount: 2, aiSettings: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS, modelContextWindowTokens: 32_000 },
      segments: ids.map((id, index) => ({ id, sourceId: `${index}`, sourceTitle: `资料 ${index}`,
        content: `${index}ABCDE。`.repeat(5_000) })) };
    expect(new KnowledgeGenerationWorkflow(new QueueGateway([])).plan(input).windowCount).toBe(2);
    const draft = (index: number) => JSON.stringify({ items: [{ ordinal: 0, competency: "内容", kind: "technical",
      difficulty: "basic", question: `题目 ${index}`, evidenceSegmentIds: [ids[index]] }] });
    const first = new QueueGateway([draft(0)]);
    const controller = new AbortController();
    const events: KnowledgeGenerationEvent[] = [];
    await expect(new KnowledgeGenerationWorkflow(first).generate(input, controller.signal, (stage, progress, message, detail) => {
      if (detail.details) events.push({ id: events.length + 1, batchId: input.batchId, stage, state: detail.state,
        progress, message, details: detail.details, providerId: detail.providerId, modelId: detail.modelId,
        usage: detail.usage, createdAt: "2026-09-23T00:00:00.000Z" });
      if (detail.details?.kind === "window-plan" && detail.details.windowIndex === 1 && detail.state === "completed") controller.abort();
    })).rejects.toThrow();
    expect(first.requests).toHaveLength(1);
    const answer = JSON.stringify({ items: ids.map((segmentId, ordinal) => ({ ordinal, answer: "简短回答。",
      rubric: [{ title: "正确", description: "说明依据", weight: 100 }], pitfalls: [], followUps: [],
      evidence: [{ segmentId, quote: `${ordinal}ABCDE` }] })) });
    const retry = new QueueGateway([draft(1), answer,
      JSON.stringify({ items: [{ ordinal: 0, verdict: "supported", notes: [] }, { ordinal: 1, verdict: "supported", notes: [] }] })]);
    await new KnowledgeGenerationWorkflow(retry).generate({ ...input, previousEvents: events }, new AbortController().signal, () => undefined);
    expect(retry.requests.filter((request) => request.metadata.purpose === "question-generation.drafts")).toHaveLength(1);
  });

  it("reuses a completed answer batch after the task is interrupted", async () => {
    const segmentId = "source:segment:0";
    const draft = JSON.stringify({ items: [1, 2].map((number, ordinal) => ({ ordinal,
      competency: `能力 ${number}`, kind: "technical", difficulty: "basic", question: `问题 ${number}`,
      evidenceSegmentIds: [segmentId],
    })) });
    const answer = JSON.stringify({ items: [0, 1].map((ordinal) => ({ ordinal, answer: "先讲结论，再解释依据。",
      rubric: [{ title: "依据", description: "说明依据", weight: 100 }], pitfalls: [], followUps: [],
      evidence: [{ segmentId, quote: "依据" }] })) });
    const review = JSON.stringify({ items: [0, 1].map((ordinal) => ({ ordinal, verdict: "supported", notes: [] })) });
    const input = { batchId: "answer-resume", title: "断点", targetRole: "工程师", difficulty: "basic" as const,
      questionCount: 2, segments: [{ id: segmentId, sourceId: "source", sourceTitle: "资料", content: "依据：先确认条件。" }] };
    const first = new QueueGateway([draft, answer]);
    const controller = new AbortController();
    const events: KnowledgeGenerationEvent[] = [];
    await expect(new KnowledgeGenerationWorkflow(first).generate(input, controller.signal, (stage, progress, message, detail) => {
      if (detail.details) events.push({ id: events.length + 1, batchId: input.batchId,
        stage, state: detail.state, progress, message, details: detail.details, providerId: detail.providerId,
        modelId: detail.modelId, usage: detail.usage, createdAt: "2026-09-23T00:00:00.000Z" });
      if (message.startsWith("已完成 2/2 道题目的答案")) controller.abort();
    })).rejects.toThrow();
    expect(first.requests.filter((request) => request.metadata.purpose === "question-generation.answers")).toHaveLength(1);
    const retry = new QueueGateway([review]);
    const result = await new KnowledgeGenerationWorkflow(retry).generate({ ...input, previousEvents: events },
      new AbortController().signal, () => undefined);
    expect(result.candidates).toHaveLength(2);
    expect(retry.requests.filter((request) => request.metadata.purpose === "question-generation.drafts")).toHaveLength(0);
    expect(retry.requests.filter((request) => request.metadata.purpose === "question-generation.answers")).toHaveLength(0);
  });

  it("reuses completed review batches when a later review batch is interrupted", async () => {
    const segmentId = "source:segment:0";
    const draft = (start: number, count: number) => JSON.stringify({ items: Array.from({ length: count }, (_, ordinal) => ({
      ordinal, competency: `能力 ${start + ordinal}`, kind: "technical", difficulty: "basic",
      question: `问题 ${start + ordinal}`, evidenceSegmentIds: [segmentId],
    })) });
    const answer = (count: number) => JSON.stringify({ items: Array.from({ length: count }, (_, ordinal) => ({ ordinal, answer: "先讲结论，再解释依据。",
      rubric: [{ title: "依据", description: "说明依据", weight: 100 }], pitfalls: [], followUps: [],
      evidence: [{ segmentId, quote: "依据" }] })) });
    const review = (count: number) => JSON.stringify({ items: Array.from({ length: count }, (_, ordinal) => ({
      ordinal, verdict: "supported", notes: [],
    })) });
    const input = { batchId: "review-resume", title: "审核断点", targetRole: "工程师", difficulty: "basic" as const,
      questionCount: 11, segments: [{ id: segmentId, sourceId: "source", sourceTitle: "资料", content: "依据：先确认条件。" }] };
    const first = new QueueGateway([draft(1, 11), answer(5), answer(5), answer(1), review(10)]);
    const controller = new AbortController();
    const events: KnowledgeGenerationEvent[] = [];
    await expect(new KnowledgeGenerationWorkflow(first).generate(input, controller.signal, (stage, progress, message, detail) => {
      if (detail.details) events.push({ id: events.length + 1, batchId: input.batchId,
        stage, state: detail.state, progress, message, details: detail.details, providerId: detail.providerId,
        modelId: detail.modelId, usage: detail.usage, createdAt: "2026-09-23T00:00:00.000Z" });
      if (message.startsWith("审核批次 1/2 已完成")) controller.abort();
    })).rejects.toThrow();
    const retry = new QueueGateway([review(1)]);
    const result = await new KnowledgeGenerationWorkflow(retry).generate({ ...input, previousEvents: events },
      new AbortController().signal, () => undefined);
    expect(result.candidates).toHaveLength(11);
    expect(retry.requests).toHaveLength(1);
    expect(retry.requests[0]?.metadata.purpose).toBe("question-generation.review");
  });

  it("shrinks only a context-rejected planning window and records the reason", async () => {
    const ids = ["source-a:segment:0", "source-b:segment:0"];
    const input = { batchId: "shrink", title: "上下文重排", targetRole: "工程师", difficulty: "basic" as const,
      questionCount: 1, aiSettings: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS, modelContextWindowTokens: 32_000 },
      segments: ids.map((id, index) => ({ id, sourceId: `source-${index}`, sourceTitle: `资料 ${index}`,
        content: `${index}ABCDE。`.repeat(2_000) })) };
    expect(new KnowledgeGenerationWorkflow(new QueueGateway([])).plan(input).windowCount).toBe(1);
    const draft = (index: number) => JSON.stringify({ items: [{ ordinal: 0, competency: "基础", kind: "technical",
      difficulty: "basic", question: `问题 ${index}`, evidenceSegmentIds: [ids[index]] }] });
    const gateway = new QueueGateway([{ error: "budget_exceeded" }, draft(0), draft(1),
      JSON.stringify({ items: [{ ordinal: 0, answer: "简短回答。", rubric: [{ title: "正确", description: "依据资料", weight: 100 }],
        pitfalls: [], followUps: [], evidence: [{ segmentId: ids[0], quote: "0ABCDE" }] }] }),
      JSON.stringify({ items: [{ ordinal: 0, verdict: "supported", notes: [] }] }),
    ]);
    const progress = vi.fn();
    const result = await new KnowledgeGenerationWorkflow(gateway).generate(input, new AbortController().signal, progress);
    expect(result.candidates).toHaveLength(1);
    expect(gateway.requests.filter((request) => request.metadata.purpose === "question-generation.drafts")).toHaveLength(3);
    expect(progress.mock.calls.some((call) => String(call[2]).includes("缩小为 2 个子窗口"))).toBe(true);
  });

  it("shrinks a repeatedly timed-out planning window while preserving its source coverage", async () => {
    vi.useFakeTimers();
    try {
      const ids = ["timeout-a:segment:0", "timeout-b:segment:0"];
      const input = { batchId: "timeout-split", title: "超时重排", targetRole: "工程师", difficulty: "basic" as const,
        questionCount: 1, aiSettings: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS, modelContextWindowTokens: 32_000 },
        segments: ids.map((id, index) => ({ id, sourceId: `source-${index}`, sourceTitle: `资料 ${index}`,
          content: `${index}ABCDE。`.repeat(2_000) })) };
      const draft = (index: number) => JSON.stringify({ items: [{ ordinal: 0, competency: "基础", kind: "technical",
        difficulty: "basic", question: `超时后的问题 ${index}`, evidenceSegmentIds: [ids[index]] }] });
      const gateway = new QueueGateway([...Array.from({ length: 6 }, () => ({ timeout: true as const })), draft(0), draft(1),
        JSON.stringify({ items: [{ ordinal: 0, answer: "简短回答。", rubric: [{ title: "依据", description: "资料依据", weight: 100 }],
          pitfalls: [], followUps: [], evidence: [{ segmentId: ids[0], quote: "0ABCDE" }] }] }),
        JSON.stringify({ items: [{ ordinal: 0, verdict: "supported", notes: [] }] }),
      ]);
      const progress = vi.fn();
      const generated = new KnowledgeGenerationWorkflow(gateway).generate(input, new AbortController().signal, progress);
      await vi.runAllTimersAsync();
      await expect(generated).resolves.toMatchObject({ candidates: [expect.any(Object)] });
      expect(progress.mock.calls.some((call) => String(call[2]).includes("连续超时"))).toBe(true);
      expect(gateway.requests.filter((request) => request.metadata.purpose === "question-generation.drafts")).toHaveLength(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it("generates, independently validates and verifies quoted evidence", async () => {
    const segmentId = "source-1:segment:0";
    const quote = "工具调用必须经过权限校验";
    const gateway = new QueueGateway([
      JSON.stringify({ items: [{
        ordinal: 0,
        competency: "Agent 安全",
        kind: "technical",
        difficulty: "intermediate",
        question: "Agent 的工具调用为什么需要权限边界？",
        evidenceSegmentIds: [segmentId],
      }] }),
      JSON.stringify({ items: [{
        ordinal: 0,
        answer: "工具调用需要权限校验和可追溯记录。",
        rubric: [
          { title: "权限", description: "说明权限校验", weight: 2 },
          { title: "审计", description: "说明执行记录", weight: 1 },
        ],
        pitfalls: ["绕过权限边界"],
        followUps: ["如何设计审计日志？"],
        evidence: [{ segmentId, quote }],
      }] }),
      JSON.stringify({ items: [{ ordinal: 0, verdict: "supported", notes: [] }] }),
    ]);
    const workflow = new KnowledgeGenerationWorkflow(gateway);
    const progress = vi.fn();
    const result = await workflow.generate({
      batchId: "batch-1",
      title: "Agent 题库",
      targetRole: "Agent 工程师",
      difficulty: "mixed",
      questionCount: 1,
      segments: [{
        id: segmentId,
        sourceId: "source-1",
        sourceTitle: "Agent handbook",
        content: `${quote}，并保留可追溯的执行记录。`,
      }, {
        id: "source-2:segment:0",
        sourceId: "source-2",
        sourceTitle: "无关资料",
        content: "这段无关内容可以参与出题规划，但没有被该题引用，因此不应重复发送到独立校验阶段。",
      }],
    }, new AbortController().signal, progress);

    expect(gateway.requests).toHaveLength(3);
    expect(gateway.requests.every((request) => request.metadata.moduleId === "knowledge-studio")).toBe(true);
    expect(gateway.requests.map((request) => request.metadata.purpose)).toEqual([
      "question-generation.drafts",
      "question-generation.answers",
      "question-generation.review",
    ]);
    expect(JSON.stringify(gateway.requests[2])).not.toContain("这段无关内容");
    expect(result.candidates[0]).toMatchObject({
      validationStatus: "supported",
      evidence: [{ segmentId, sourceId: "source-1", quote }],
    });
    expect(result.candidates[0]?.rubric.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
    expect(result.candidates[0]?.validationNotes).toContain("模型返回的 Rubric 权重未合计 100，系统已归一化，请人工检查");
    expect(result.usage.totalTokens).toBe(45);
    expect(progress.mock.calls.length).toBeGreaterThan(15);
    expect(progress).toHaveBeenCalledWith("extracting", 18, expect.stringContaining("已组装问题规划请求"), expect.objectContaining({
      details: expect.objectContaining({ phase: "request", purpose: "drafts", systemPrompt: expect.any(String), userPayload: expect.stringContaining("source-1:segment:0"),
        schemaName: "knowledge_studio_drafts_v1", jsonSchema: expect.objectContaining({ type: "object" }) }),
    }));
    expect(progress).toHaveBeenCalledWith("extracting", 18, expect.stringContaining("JSON 解析与 Schema"), expect.objectContaining({
      details: expect.objectContaining({ kind: "validation", validation: expect.objectContaining({ passed: true }) }),
    }));
    expect(progress).toHaveBeenCalledWith("extracting", 18, "已收到模型回复", expect.objectContaining({
      details: expect.objectContaining({ phase: "response", purpose: "drafts", responseText: expect.any(String), elapsedMs: expect.any(Number) }),
    }));
    expect(progress).toHaveBeenCalledWith("extracting", 34, expect.stringContaining("个窗口已覆盖"), expect.objectContaining({
      state: "completed",
      details: expect.objectContaining({ kind: "validation" }),
    }));
  });

  it("downgrades a supported answer when its quote cannot be found verbatim", async () => {
    const segmentId = "source-1:segment:0";
    const gateway = new QueueGateway([
      JSON.stringify({ items: [{ ordinal: 0, competency: "检索", kind: "technical", difficulty: "basic", question: "如何检索？", evidenceSegmentIds: [segmentId] }] }),
      JSON.stringify({ items: [{ ordinal: 0, answer: "使用检索。", rubric: [{ title: "方法", description: "说明方法", weight: 100 }], pitfalls: [], followUps: [], evidence: [{ segmentId, quote: "原文中不存在" }] }] }),
      JSON.stringify({ items: [{ ordinal: 0, verdict: "supported", notes: [] }] }),
    ]);

    const result = await new KnowledgeGenerationWorkflow(gateway).generate({
      batchId: "batch-2", title: "检索", targetRole: "工程师", difficulty: "basic", questionCount: 1,
      segments: [{ id: segmentId, sourceId: "source-1", sourceTitle: "资料", content: "这里是一段足够长的检索资料，用于校验证据引用是否真实存在于原文内容中。" }],
    }, new AbortController().signal, () => undefined);

    expect(result.candidates[0]?.validationStatus).toBe("needs_review");
    expect(result.candidates[0]?.evidence).toEqual([]);
    expect(result.candidates[0]?.validationNotes[0]).toContain("未能在原文片段");
  });

  it("keeps generated candidates for manual review when independent validation times out", async () => {
    vi.useFakeTimers();
    try {
    const segmentId = "source-1:segment:0";
    const quote = "Agent 调用工具前必须检查权限";
    const gateway = new QueueGateway([
      JSON.stringify({ items: [{
        ordinal: 0, competency: "Agent 安全", kind: "technical", difficulty: "intermediate",
        question: "为什么调用工具前需要检查权限？", evidenceSegmentIds: [segmentId],
      }] }),
      JSON.stringify({ items: [{
        ordinal: 0, answer: "权限检查可以限制工具副作用。",
        rubric: [{ title: "权限边界", description: "说明权限检查作用", weight: 100 }],
        pitfalls: [], followUps: [], evidence: [{ segmentId, quote }],
      }] }),
      ...Array.from({ length: 6 }, () => ({ timeout: true as const })),
    ]);
    const progress = vi.fn();

    const generated = new KnowledgeGenerationWorkflow(gateway).generate({
      batchId: "batch-timeout", title: "Agent 题库", targetRole: "Agent 工程师",
      difficulty: "mixed", questionCount: 1,
      segments: [{ id: segmentId, sourceId: "source-1", sourceTitle: "资料", content: `${quote}，并记录审计事件。` }],
    }, new AbortController().signal, progress);
    await vi.runAllTimersAsync();
    const result = await generated;

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      validationStatus: "needs_review",
      evidence: [{ segmentId, quote }],
    });
    expect(result.candidates[0]?.validationNotes[0]).toContain("自动质量校验暂时不可用");
    expect(result.usage.totalTokens).toBe(30);
    expect(progress).toHaveBeenCalledWith(
      "validating", 94, expect.stringContaining("已保留并标记人工复核"), expect.objectContaining({ state: "completed" }),
    );
    expect(progress).toHaveBeenLastCalledWith("validating", 96, expect.stringContaining("原文引文"), expect.objectContaining({ state: "completed" }));
    expect(gateway.requests.filter((request) => request.metadata.purpose === "question-generation.review")).toHaveLength(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it("generates answers in bounded batches and only sends the cited source segments", async () => {
    const segmentIds = ["source:segment:0", "source:segment:1", "source:segment:2"];
    const drafts = segmentIds.map((segmentId, ordinal) => ({
      ordinal, competency: `能力 ${ordinal + 1}`, kind: "technical", difficulty: "intermediate",
      question: `问题 ${ordinal + 1}`, evidenceSegmentIds: [segmentId],
    }));
    const answer = (ordinals: number[]) => JSON.stringify({ items: ordinals.map((ordinal) => ({
      ordinal: ordinals.indexOf(ordinal), answer: `答案 ${ordinal + 1}`,
      rubric: [{ title: "准确性", description: "说明资料中的关键事实", weight: 100 }],
      pitfalls: [], followUps: [], evidence: [{ segmentId: segmentIds[ordinal], quote: `原文 ${ordinal + 1}` }],
    })) });
    const gateway = new QueueGateway([
      JSON.stringify({ items: drafts }),
      answer([0, 1, 2]),
      JSON.stringify({ items: drafts.map((_, ordinal) => ({ ordinal, verdict: "supported", notes: [] })) }),
    ]);

    const result = await new KnowledgeGenerationWorkflow(gateway).generate({
      batchId: "batch-chunked", title: "分批题库", targetRole: "Agent 工程师", difficulty: "mixed", questionCount: 3,
      segments: segmentIds.map((id, ordinal) => ({
        id, sourceId: "source", sourceTitle: "资料", content: `原文 ${ordinal + 1}，这是只应发送给对应答案批次的内容。`,
      })),
    }, new AbortController().signal, () => undefined);

    expect(result.candidates).toHaveLength(3);
    expect(gateway.requests.map((request) => request.metadata.purpose)).toEqual([
      "question-generation.drafts",
      "question-generation.answers",
      "question-generation.review",
    ]);
    const answerPayload = JSON.parse(gateway.requests[1]!.messages[1]!.content);
    expect(answerPayload.drafts).toHaveLength(3);
    expect(answerPayload.sources.map((source: { segmentId: string }) => source.segmentId)).toEqual(segmentIds);
  });

  it("retries a transient planning connection failure and records its safe diagnosis", async () => {
    const segmentId = "source:segment:0";
    const gateway = new QueueGateway([
      { error: "provider_unavailable" },
      JSON.stringify({ items: [{ ordinal: 0, competency: "工具安全", kind: "technical", difficulty: "basic", question: "为什么要校验权限？", evidenceSegmentIds: [segmentId] }] }),
      JSON.stringify({ items: [{ ordinal: 0, answer: "校验权限可以限制工具的副作用。", rubric: [{ title: "权限", description: "说明校验", weight: 100 }], pitfalls: [], followUps: [], evidence: [{ segmentId, quote: "校验权限" }] }] }),
      JSON.stringify({ items: [{ ordinal: 0, verdict: "supported", notes: [] }] }),
    ]);
    const progress = vi.fn();

    const result = await new KnowledgeGenerationWorkflow(gateway).generate({
      batchId: "batch-planning-retry", title: "权限题库", targetRole: "Agent 工程师", difficulty: "basic", questionCount: 1,
      segments: [{ id: segmentId, sourceId: "source", sourceTitle: "资料", content: "调用工具前校验权限。" }],
    }, new AbortController().signal, progress);

    expect(result.candidates).toHaveLength(1);
    expect(gateway.requests.filter((request) => request.metadata.purpose === "question-generation.drafts")).toHaveLength(2);
    expect(progress).toHaveBeenCalledWith("extracting", 18, "模型调用失败，正在判断是否重试", expect.objectContaining({
      details: expect.objectContaining({ errorCode: "provider_unavailable", diagnosticCode: "FETCH_FAILED" }),
    }));
    expect(progress).toHaveBeenCalledWith("extracting", 18, expect.stringContaining("第 2/6 次尝试"), expect.anything());
  });

  it("automatically retries a timed-out answer batch", async () => {
    const ids = ["source:segment:0", "source:segment:1"];
    const drafts = ids.map((segmentId, ordinal) => ({
      ordinal, competency: "可靠性", kind: "technical", difficulty: "basic",
      question: `问题 ${ordinal + 1}`, evidenceSegmentIds: [segmentId],
    }));
    const batchedAnswer = () => JSON.stringify({ items: ids.map((segmentId, ordinal) => ({
      ordinal, answer: `答案 ${ordinal + 1}`,
      rubric: [{ title: "事实", description: "准确引用原文", weight: 100 }],
      pitfalls: [], followUps: [], evidence: [{ segmentId, quote: `证据 ${ordinal + 1}` }],
    })) });
    const gateway = new QueueGateway([
      JSON.stringify({ items: drafts }),
      { timeout: true },
      batchedAnswer(),
      JSON.stringify({ items: drafts.map((_, ordinal) => ({ ordinal, verdict: "supported", notes: [] })) }),
    ]);

    const result = await new KnowledgeGenerationWorkflow(gateway).generate({
      batchId: "batch-answer-timeout", title: "超时恢复", targetRole: "Agent 工程师", difficulty: "basic", questionCount: 2,
      segments: ids.map((id, ordinal) => ({ id, sourceId: "source", sourceTitle: "资料", content: `证据 ${ordinal + 1}，用于生成回答。` })),
    }, new AbortController().signal, () => undefined);

    expect(result.candidates.map((candidate) => candidate.answer)).toEqual(["答案 1", "答案 2"]);
    expect(gateway.requests.filter((request) => request.metadata.purpose === "question-generation.answers")).toHaveLength(2);
  });

  it("splits an answer batch when the provider rejects its output structure", async () => {
    const segmentId = "source:segment:0";
    const drafts = [0, 1, 2].map((ordinal) => ({ ordinal, competency: `能力 ${ordinal}`,
      kind: "technical", difficulty: "basic", question: `问题 ${ordinal}`, evidenceSegmentIds: [segmentId] }));
    const answers = (count: number) => JSON.stringify({ items: Array.from({ length: count }, (_, ordinal) => ({
      ordinal, answer: "先确认条件，再解释关键原因。", rubric: [{ title: "依据", description: "说明依据", weight: 100 }],
      pitfalls: [], followUps: [], evidence: [{ segmentId, quote: "依据" }],
    })) });
    const review = JSON.stringify({ items: drafts.map((_, ordinal) => ({ ordinal, verdict: "supported", notes: [] })) });
    const gateway = new QueueGateway([JSON.stringify({ items: drafts }), { error: "invalid_provider_response" },
      answers(1), answers(2), review]);
    const result = await new KnowledgeGenerationWorkflow(gateway).generate({
      batchId: "answer-split", title: "答案拆批", targetRole: "工程师", difficulty: "basic", questionCount: 3,
      segments: [{ id: segmentId, sourceId: "source", sourceTitle: "资料", content: "依据：先确认条件。" }],
    }, new AbortController().signal, () => undefined);
    expect(result.candidates).toHaveLength(3);
    expect(gateway.requests.filter((request) => request.metadata.purpose === "question-generation.answers")
      .map((request) => JSON.parse(request.messages[1]!.content).drafts.length)).toEqual([3, 1, 2]);
  });

  it("repairs only the invalid answer from a successful batch", async () => {
    const segmentId = "source:segment:0";
    const drafts = [0, 1].map((ordinal) => ({ ordinal, competency: `能力 ${ordinal}`,
      kind: "technical", difficulty: "basic", question: `问题 ${ordinal}`, evidenceSegmentIds: [segmentId] }));
    const entry = (ordinal: number, answer: string) => ({ ordinal, answer,
      rubric: [{ title: "依据", description: "说明依据", weight: 100 }], pitfalls: [], followUps: [],
      evidence: [{ segmentId, quote: "依据" }] });
    const gateway = new QueueGateway([
      JSON.stringify({ items: drafts }),
      JSON.stringify({ items: [entry(0, "第一个答案简短准确。"), entry(1, "**第二题**\n1. 请先说明依据。")] }),
      JSON.stringify({ items: [entry(0, "我会先确认依据，再解释这个结论。")] }),
      JSON.stringify({ items: drafts.map((_, ordinal) => ({ ordinal, verdict: "supported", notes: [] })) }),
    ]);
    const result = await new KnowledgeGenerationWorkflow(gateway).generate({
      batchId: "answer-selective-repair", title: "选择性重写", targetRole: "工程师", difficulty: "basic", questionCount: 2,
      segments: [{ id: segmentId, sourceId: "source", sourceTitle: "资料", content: "依据：先确认条件。" }],
    }, new AbortController().signal, () => undefined);
    expect(result.candidates.map((candidate) => candidate.answer)).toEqual([
      "第一个答案简短准确。", "我会先确认依据，再解释这个结论。",
    ]);
    const answerRequests = gateway.requests.filter((request) => request.metadata.purpose === "question-generation.answers");
    expect(answerRequests.map((request) => JSON.parse(request.messages[1]!.content).drafts.length)).toEqual([2, 1]);
    expect(JSON.parse(answerRequests[1]!.messages[1]!.content).drafts[0].question).toBe("问题 1");
  });

  it("allows five additional network retries for an answer request", async () => {
    vi.useFakeTimers();
    try {
      const segmentId = "source:segment:0";
      const draft = JSON.stringify({ items: [{ ordinal: 0, competency: "可靠性", kind: "technical",
        difficulty: "basic", question: "如何处理超时？", evidenceSegmentIds: [segmentId] }] });
      const answer = JSON.stringify({ items: [{ ordinal: 0, answer: "先确认请求状态，再按规则重试。",
        rubric: [{ title: "重试", description: "说明重试条件", weight: 100 }], pitfalls: [], followUps: [],
        evidence: [{ segmentId, quote: "重试" }] }] });
      const review = JSON.stringify({ items: [{ ordinal: 0, verdict: "supported", notes: [] }] });
      const gateway = new QueueGateway([draft, ...Array.from({ length: 5 }, () => ({ timeout: true as const })), answer, review]);
      const progress = vi.fn();
      const generated = new KnowledgeGenerationWorkflow(gateway).generate({
        batchId: "answer-five-retries", title: "重试", targetRole: "工程师", difficulty: "basic", questionCount: 1,
        segments: [{ id: segmentId, sourceId: "source", sourceTitle: "资料", content: "超时后可以重试。" }],
      }, new AbortController().signal, progress);
      await vi.runAllTimersAsync();
      await expect(generated).resolves.toMatchObject({ candidates: [expect.any(Object)] });
      expect(gateway.requests.filter((request) => request.metadata.purpose === "question-generation.answers")).toHaveLength(6);
      expect(progress.mock.calls.some((call) => String(call[2]).includes("第 6/6 次尝试"))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rewrites an overlong outline answer and keeps rubric and evidence separate", async () => {
    const segmentId = "source:segment:0";
    const answer = (value: string) => JSON.stringify({ items: [{
      ordinal: 0, answer: value,
      rubric: [{ title: "权限边界", description: "说明授权与审计", weight: 100 }],
      pitfalls: ["跳过授权"], followUps: ["如何处理失败重试？"],
      evidence: [{ segmentId, quote: "调用前检查权限" }],
    }] });
    const gateway = new QueueGateway([
      JSON.stringify({ items: [{ ordinal: 0, competency: "工具安全", kind: "technical", difficulty: "basic", question: "Agent 调用工具前为什么要检查权限？", evidenceSegmentIds: [segmentId] }] }),
      answer(`**一、权限检查**\n1. ${"调用前检查权限。".repeat(42)}`),
      answer("我会先确认当前任务是否有权使用这个工具，再校验参数并记录调用结果。这样能限制工具的副作用，出了问题也容易追溯。"),
      JSON.stringify({ items: [{ ordinal: 0, verdict: "supported", notes: [] }] }),
    ]);
    const progress = vi.fn();

    const result = await new KnowledgeGenerationWorkflow(gateway).generate({
      batchId: "batch-style", title: "工具安全", targetRole: "Agent 工程师", difficulty: "basic", questionCount: 1,
      segments: [{ id: segmentId, sourceId: "source", sourceTitle: "资料", content: "调用前检查权限，并保留审计记录。" }],
    }, new AbortController().signal, progress);

    expect(result.candidates[0]?.answer).toBe("我会先确认当前任务是否有权使用这个工具，再校验参数并记录调用结果。这样能限制工具的副作用，出了问题也容易追溯。");
    expect(result.candidates[0]?.rubric).toHaveLength(1);
    expect(result.candidates[0]?.evidence).toHaveLength(1);
    expect(gateway.requests.map((request) => request.metadata.purpose)).toEqual([
      "question-generation.drafts", "question-generation.answers", "question-generation.answers", "question-generation.review",
    ]);
    expect(gateway.requests[2]?.messages[1]?.content).toContain("上一版参考答案未通过格式验收");
    expect(gateway.requests[2]?.messages[1]?.content).toContain("超过 300 字上限");
    expect(gateway.requests[1]?.messages[0]?.content).toContain("最多 300 个字符");
    expect(progress).toHaveBeenCalledWith("answering", expect.any(Number), expect.stringContaining("正在单独重写"), expect.objectContaining({ state: "running" }));
    expect(result.usage.totalTokens).toBe(60);
  });

  it("fails clearly after repeated answers violate the hard format rules", async () => {
    const segmentId = "source:segment:0";
    const outline = JSON.stringify({ items: [{
      ordinal: 0, answer: "一、权限边界\n二、调用审计",
      rubric: [{ title: "权限", description: "说明权限", weight: 100 }],
      pitfalls: [], followUps: [], evidence: [{ segmentId, quote: "检查权限" }],
    }] });
    const gateway = new QueueGateway([
      JSON.stringify({ items: [{ ordinal: 0, competency: "权限", kind: "technical", difficulty: "basic", question: "为什么要检查权限？", evidenceSegmentIds: [segmentId] }] }),
      outline, outline, outline,
    ]);

    await expect(new KnowledgeGenerationWorkflow(gateway).generate({
      batchId: "batch-invalid-style", title: "权限", targetRole: "Agent 工程师", difficulty: "basic", questionCount: 1,
      segments: [{ id: segmentId, sourceId: "source", sourceTitle: "资料", content: "调用工具前检查权限。" }],
    }, new AbortController().signal, () => undefined)).rejects.toThrow("答案连续 3 次未通过格式验收");
    expect(gateway.requests).toHaveLength(4);
  });
});
