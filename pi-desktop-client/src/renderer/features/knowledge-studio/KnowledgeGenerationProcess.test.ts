import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { KnowledgeGenerationBatch, KnowledgeGenerationEvent } from "../../../shared/contracts/knowledge-studio";
import { buildGenerationStory, KnowledgeGenerationProcess } from "./KnowledgeGenerationProcess";

function event(id: number, phase?: "request" | "prepared" | "stream" | "response" | "error", callId = "call-a"): KnowledgeGenerationEvent {
  return {
    id, batchId: "batch-1", stage: "extracting", state: phase === "error" ? "failed" : phase === "response" ? "completed" : "running",
    progress: 18, message: `事件 ${id}`, createdAt: "2026-09-23T00:00:00.000Z",
    ...(phase ? { details: { kind: "model-call" as const, callId, phase, purpose: "drafts" as const,
      promptVersion: "v1", systemPrompt: "prompt", userPayload: "{}", timeoutMs: 120000 } } : {}),
  };
}

describe("buildGenerationStory", () => {
  it("pairs each request with its response and keeps workflow activity in order", () => {
    const story = buildGenerationStory([event(1), event(2, "request"), event(3, "response"), event(4)]);
    expect(story.map((item) => item.kind)).toEqual(["activity", "call", "activity"]);
    expect(story[1]).toMatchObject({ kind: "call", request: { id: 2 }, result: { id: 3 } });
  });

  it("shows failed retries as separate calls instead of merging them", () => {
    const story = buildGenerationStory([event(1, "request", "first"), event(2, "error", "first"), event(3, "request", "retry"), event(4, "response", "retry")]);
    expect(story).toHaveLength(2);
    expect(story[0]).toMatchObject({ kind: "call", result: { id: 2 } });
    expect(story[1]).toMatchObject({ kind: "call", result: { id: 4 } });
  });

  it("updates one call during streaming and then replaces the snapshot with the final response", () => {
    const story = buildGenerationStory([event(1, "request"), event(2, "prepared"), event(3, "stream"), event(4, "response")]);
    expect(story).toHaveLength(1);
    expect(story[0]).toMatchObject({ kind: "call", request: { id: 1 }, prepared: { id: 2 }, result: { id: 4 }, events: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] });
  });

  it("renders one shared prompt area and a call transcript with input, thinking and output", () => {
    const request = event(1, "request");
    const result = { ...event(2, "response"), providerId: "test-provider", modelId: "test-model",
      details: { ...event(2, "response").details!, reasoningText: "先核对证据", responseText: '{"items":[{"question":"如何设计？"}]}' } };
    const batch = { id: "batch-1", title: "Agent 题包", targetRole: "Agent 工程师", requestedQuestionCount: 1,
      sourceIds: ["source-1"], status: "review", stage: "review", progress: 100,
      providerId: "test-provider", modelId: "test-model", events: [request, result] } as KnowledgeGenerationBatch;
    const html = renderToStaticMarkup(createElement(KnowledgeGenerationProcess, { batch, progress: null,
      sources: [], onBack: () => undefined }));
    expect(html).toContain("请求档案");
    expect(html).toContain("展开思考过程");
    expect(html).not.toContain("先核对证据");
    expect(html).toContain("如何设计？");
    expect(html.match(/应用系统提示词/g)).toHaveLength(3);
  });

  it("keeps failed retry details collapsed by default", () => {
    const request = event(1, "request");
    const failed = { ...event(2, "error"), details: { ...event(2, "error").details!, error: "请求超时" } };
    const batch: KnowledgeGenerationBatch = { id: "batch-1", title: "Agent 题包", targetRole: "Agent 工程师", requestedQuestionCount: 1,
      difficulty: "mixed", sourceIds: [], status: "failed", stage: "failed", progress: 0,
      candidateCount: 0, approvedCount: 0, rejectedCount: 0, candidates: [],
      createdAt: "2026-09-23T00:00:00.000Z", updatedAt: "2026-09-23T00:00:00.000Z", events: [request, failed] };
    const html = renderToStaticMarkup(createElement(KnowledgeGenerationProcess, { batch, progress: null,
      sources: [], onBack: () => undefined }));
    expect(html).toContain("请求超时");
    expect(html).toContain("查看失败调用详情");
    expect(html).toContain("实际输入 <strong>未返回</strong>");
    expect(html).not.toContain("查看完整用户 JSON");
  });

  it("shows source characters, estimated tokens, actual tokens including cache, and independent-call totals", () => {
    const request = event(1, "request");
    request.details = { ...request.details!, userPayload: JSON.stringify({ sources: [{ content: "中文 ABC" }] }) };
    const prepared = event(2, "prepared");
    prepared.details = { ...prepared.details!, inputTextCharacters: 125, estimatedInputTokens: 84, modelContextWindowTokens: 128_000 };
    const response = event(3, "response");
    response.usage = { inputTokens: 70, cachedInputTokens: 20, outputTokens: 10, reasoningTokens: 4, totalTokens: 100 };
    const batch = { id: "batch-1", title: "Agent 题包", targetRole: "Agent 工程师", requestedQuestionCount: 1,
      sourceIds: ["source-1"], status: "review", stage: "review", progress: 100,
      events: [request, prepared, response] } as KnowledgeGenerationBatch;
    const html = renderToStaticMarkup(createElement(KnowledgeGenerationProcess, { batch, progress: null,
      sources: [], onBack: () => undefined }));

    expect(html).toContain("资料正文 <strong>6 字符</strong>");
    expect(html).toContain("输入文本 <strong>125 字符</strong>");
    expect(html).toContain("预计输入 <strong>84 tokens</strong>");
    expect(html).toContain("实际输入 <strong>90 tokens</strong>");
    expect(html).toContain("实际输出 <strong>10 tokens</strong>");
    expect(html).toContain("缓存输入 20 tokens（已计入实际输入）");
    expect(html).toContain("模型上下文 128,000 tokens");
    expect(html).toContain("实际输入约占上下文 0.1%");
    expect(html).toContain("实际输入 90 / 输出 10 tokens（独立调用逐次相加）");
  });

  it("shows local selection, schema and gateway-effective request details without claiming delivery", () => {
    const selected: KnowledgeGenerationEvent = { ...event(1), details: { kind: "source-selection", selection: {
      maxContextChars: 72_000, order: "document_id、ordinal", availableSegments: 2, selectedSegments: 1,
      selectedCharacters: 12, sources: [{ sourceId: "source-1", title: "资料 A", available: 2, included: 1, includedCharacters: 12 }],
      segments: [{ id: "source-1:segment:0", sourceId: "source-1", originalCharacters: 20, includedCharacters: 12 }],
    } } };
    const request = event(2, "request");
    request.details = { ...request.details!, schemaName: "knowledge_studio_drafts_v1", jsonSchema: { type: "object", required: ["items"] } };
    const prepared = event(3, "prepared");
    prepared.details = { ...prepared.details!, effectiveSystemPrompt: "应用模板\n\nJSON contract name: knowledge_studio_drafts_v1.",
      estimatedInputTokens: 300, effectiveTimeoutMs: 20_000, temperatureApplied: false };
    const batch = { id: "batch-1", title: "Agent 题包", targetRole: "Agent 工程师", requestedQuestionCount: 1,
      sourceIds: ["source-1"], status: "running", stage: "extracting", progress: 18,
      events: [selected, request, prepared] } as KnowledgeGenerationBatch;
    const html = renderToStaticMarkup(createElement(KnowledgeGenerationProcess, { batch, progress: null,
      sources: [], onBack: () => undefined }));
    expect(html).toContain("资料选片");
    expect(html).toContain("已截断");
    expect(html).toContain("knowledge_studio_drafts_v1");
    expect(html).toContain("生效超时 20 秒");
    expect(html).toContain("应用层输出上限 未设置（仍受模型限制）");
    expect(html).toContain("温度 模型默认（未发送）");
    expect(html).toContain("网关最终组合的系统提示词");
    expect(html).toContain("不等于供应商已收到");
  });

  it("shows the stage name once for consecutive progress events and keeps their messages", () => {
    const batch: KnowledgeGenerationBatch = { id: "batch-1", title: "Agent 题包", targetRole: "Agent 工程师", requestedQuestionCount: 1,
      difficulty: "mixed", sourceIds: [], status: "running", stage: "extracting", progress: 18,
      candidateCount: 0, approvedCount: 0, rejectedCount: 0, candidates: [],
      createdAt: "2026-09-23T00:00:00.000Z", updatedAt: "2026-09-23T00:00:00.000Z",
      events: [event(1), event(2), event(3), event(4, "request"), event(5, "response"), event(6)] };
    const html = renderToStaticMarkup(createElement(KnowledgeGenerationProcess, { batch, progress: null,
      sources: [], onBack: () => undefined }));
    const feed = html.split('class="knowledge-story-stream"')[1]?.split('class="knowledge-story-sidebar"')[0] ?? "";
    expect(feed.match(/知识点与问题规划/g)).toHaveLength(1);
    expect(feed).toContain("事件 1");
    expect(feed).toContain("事件 2");
    expect(feed).toContain("事件 3");
    expect(feed).toContain("事件 6");
  });
});
