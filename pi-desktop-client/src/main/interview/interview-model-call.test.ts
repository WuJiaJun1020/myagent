import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PiModelGateway, type PiModelRuntimePort } from "../../platform/main/ai/pi-model-gateway";
import type { ModelRequest } from "../../platform/shared/ai/model-gateway";
import type { InterviewCallTrace } from "../../shared/contracts/interview";
import { CANDIDATE_ANSWER_SCHEMA, parseCandidateAnswer } from "./candidate-response-output";
import { chooseCandidateResponseMode } from "./candidate-response-mode";
import { InterviewDatabase } from "./interview-database";
import { generateInterviewJson } from "./interview-json-agent-retry";
import { invokeInterviewModel } from "./interview-model-call";
import { INTERVIEWER_MESSAGE_SCHEMA, INTERVIEW_DIRECTOR_SCHEMA, INTERVIEW_SCORE_SCHEMA } from "./interview-output-schema";

type RuntimeResponse = Awaited<ReturnType<PiModelRuntimePort["completeSimple"]>>;
const model: NonNullable<ReturnType<PiModelRuntimePort["getModel"]>> = {
  id: "test-model", provider: "test-provider", api: "openai-completions", name: "Test",
  baseUrl: "https://provider.invalid", reasoning: false, input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 8_000,
};
const valid = JSON.stringify({ answer: "我先核验请求。", mistakeMade: false, mistakeKind: "none", mistakeQuote: "" });
function response(text: string, stopReason: RuntimeResponse["stopReason"] = "stop"): RuntimeResponse {
  return { role: "assistant", content: [{ type: "text", text }], api: model.api,
    provider: model.provider, model: model.id, stopReason, timestamp: 1,
    usage: { input: 20, output: 10, totalTokens: 30, cacheRead: 0, cacheWrite: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
}
function setup(values: RuntimeResponse[] = [response(valid)], thrown?: Error) {
  let index = 0;
  const runtime: PiModelRuntimePort = {
    getModel: () => model,
    completeSimple: vi.fn(async () => {
      if (thrown) throw thrown;
      return values[Math.min(index++, values.length - 1)];
    }),
    streamSimple: () => { throw new Error("unused"); },
  };
  const gateway = new PiModelGateway(runtime, {
    getDefaultProvider: () => model.provider, getDefaultModel: () => model.id,
  }, { createRequestId: () => `local-${index}` });
  const request: ModelRequest = {
    model: { providerId: model.provider, modelId: model.id },
    metadata: { moduleId: "interview", purpose: "candidate_simulation", privacy: "confidential",
      budget: { timeoutMs: 10_000 } },
    messages: [{ role: "system", content: "保持原协议" }, { role: "user", content: "回答问题" }],
    responseFormat: { type: "json", schemaName: "candidate_v1", jsonSchema: CANDIDATE_ANSWER_SCHEMA },
  };
  const trace: InterviewCallTrace = {
    actor: "candidate", operationId: "op", status: "failed", startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(), requestedModel: { providerId: model.provider, modelId: model.id },
    reasoning: "default", timeoutMs: 10_000, messages: [], attempts: [],
  };
  return { gateway, runtime, request, trace };
}
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("interview diagnostics through the real model gateway", () => {
  it("classifies a settings deadline as request preparation rather than a model service failure", async () => {
    vi.useFakeTimers();
    try {
      const { runtime, request, trace } = setup();
      const gateway = new PiModelGateway(runtime, {
        getDefaultProvider: () => model.provider, getDefaultModel: () => model.id,
        reload: () => new Promise(() => undefined),
      });
      request.metadata.budget.timeoutMs = 50;
      const pending = invokeInterviewModel(gateway, request, trace);
      await vi.advanceTimersByTimeAsync(50);
      await pending;
      expect(trace.attempts[0]).toMatchObject({ error: { stage: "request", code: "timeout" },
        diagnostics: { phase: "settings", timeoutSource: "local_deadline" } });
      expect(runtime.completeSimple).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("retains early request identity and phase on timeout without attempting JSON repair", async () => {
    vi.useFakeTimers();
    try {
      const { gateway, runtime, request, trace } = setup();
      request.metadata.budget.timeoutMs = 50;
      vi.mocked(runtime.completeSimple).mockImplementation(() => new Promise(() => undefined));
      const pending = expect(generateInterviewJson({ gateway, request, trace, parse: JSON.parse })).rejects.toThrow("timeout");
      await vi.advanceTimersByTimeAsync(50);
      await pending;
      expect(runtime.completeSimple).toHaveBeenCalledTimes(1);
      expect(trace.attempts).toHaveLength(1);
      expect(trace.attempts[0]).toMatchObject({ requestId: "local-0", error: { code: "timeout", diagnosticCode: "LOCAL_DEADLINE" },
        diagnostics: { phase: "runtime_call", timeoutSource: "local_deadline", elapsedMs: 50,
          runtimeResponseReceived: false, outcome: "failed" } });
      expect(trace.attempts[0].outputText).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });

  it("retains four rejected raw responses and metadata without exposing them in generic errors or changing retries", async () => {
    const raw = "private response marker: 这不是 JSON";
    const { gateway, runtime, request, trace } = setup([response(raw)]);
    const parse = vi.fn((text: string) => JSON.parse(text));
    await expect(generateInterviewJson({ gateway, request, trace, parse }))
      .rejects.toThrow("invalid_provider_response");
    expect(runtime.completeSimple).toHaveBeenCalledTimes(4);
    expect(parse).not.toHaveBeenCalled();
    expect(trace.attempts).toHaveLength(4);
    for (const attempt of trace.attempts) {
      expect(attempt).toMatchObject({ outputText: raw, finishReason: "stop", providerStopReason: "stop",
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, durationMs: expect.any(Number) },
        requestId: expect.stringMatching(/^local-/), error: { stage: "json_syntax",
          code: "invalid_provider_response", validationIssues: ["$: 不是合法 JSON"] } });
      expect(JSON.stringify(attempt.error)).not.toContain(raw);
    }
    const contexts = vi.mocked(runtime.completeSimple).mock.calls.map((call) => call[1]);
    expect(new Set(contexts.map((context) => context.systemPrompt)).size).toBe(1);
    expect(contexts[1].systemPrompt).not.toContain(raw);
    expect(JSON.stringify(contexts[1].messages)).toContain(raw);
    expect(trace.attempts[1].retryInstruction).toContain("$: 不是合法 JSON");
    expect(trace.attempts[1].retryInstruction).toContain("第 1/3 次重试");
    expect(trace.attempts[3].retryInstruction).toContain("第 3/3 次重试");
    expect(trace.outputText).toBeUndefined();
  });

  it("distinguishes schema failures and retains them after a successful repair", async () => {
    const { gateway, request, trace } = setup([response('{}'), response(valid)]);
    const result = await generateInterviewJson({ gateway, request, trace,
      parse: (text) => parseCandidateAnswer(text, chooseCandidateResponseMode("q", 0, 0)) });
    expect(result.value.answer).toBe("我先核验请求。");
    expect(trace.attempts[0]).toMatchObject({ outputText: "{}", error: {
      stage: "json_schema", validationIssues: expect.arrayContaining(["$.answer: 缺少必填字段"]),
    } });
    expect(trace.attempts[1].error).toBeUndefined();
    expect(trace.attempts[1].retryInstruction).toContain("$.answer: 缺少必填字段");
    expect(trace.outputText).toBe(valid);
  });

  it.each([
    ["interviewer", INTERVIEWER_MESSAGE_SCHEMA, { message: "请介绍项目。", questionType: "resume" }],
    ["director", INTERVIEW_DIRECTOR_SCHEMA, { action: "pass", reason: "可以继续了解", guidance: "", flow: {
      answeredTopic: { source: "resume", anchor: "项目", objective: "核实贡献" }, answerEvidence: "new",
      answerCoverage: [], roleGaps: [], foundationNeed: "unknown",
      draft: { move: "continue", source: "resume", anchor: "项目", objective: "核实贡献", targetBlockId: "",
        bridge: "not_needed", switchReason: "none" },
    } }],
    ["score", INTERVIEW_SCORE_SCHEMA, { dimensions: ["technical", "practice", "communication"].map((key) => ({
      key, score: null, reason: "缺乏证据", evidence: [],
    })) }],
  ])("enforces the %s schema through the real gateway", async (_actor, schema, output) => {
    const { gateway, request } = setup([response("{}"), response(JSON.stringify(output))]);
    request.responseFormat = { type: "json", schemaName: "protocol_test", jsonSchema: schema as Record<string, unknown> };
    expect(await gateway.generate(request)).toMatchObject({ ok: false, error: { validationStage: "json_schema" } });
    expect(await gateway.generate(request)).toMatchObject({ ok: true, value: { text: JSON.stringify(output) } });
  });

  it("identifies business-rule rejection after a schema-valid candidate answer", async () => {
    const raw = JSON.stringify({ answer: "正常回答", mistakeMade: true, mistakeKind: "slip", mistakeQuote: "不存在的引用" });
    const { gateway, request, trace } = setup([response(raw)]);
    await expect(generateInterviewJson({ gateway, request, trace,
      parse: (text) => parseCandidateAnswer(text, chooseCandidateResponseMode("q", 0, 0)) }))
      .rejects.toThrow("误答标记");
    expect(trace.attempts[0]).toMatchObject({ outputText: raw,
      error: { code: "invalid_json_output", stage: "business_validation" } });
  });

  it("records truncation and empty outputs explicitly", async () => {
    const truncated = setup([response('{"answer":', "length")]);
    await invokeInterviewModel(truncated.gateway, truncated.request, truncated.trace);
    expect(truncated.trace.attempts[0]).toMatchObject({ finishReason: "length", providerStopReason: "length",
      outputText: '{"answer":', error: { stage: "output_length", validationIssues: ["$: 不是合法 JSON"] } });
    const empty = setup([response("")]);
    await invokeInterviewModel(empty.gateway, empty.request, empty.trace);
    expect(empty.trace.attempts[0].outputText).toBe("");
  });

  it("keeps network diagnostics without inventing a response or using JSON repair retries", async () => {
    const { gateway, runtime, request, trace } = setup([], Object.assign(new Error("fetch failed ECONNRESET"), { status: 503 }));
    await expect(generateInterviewJson({ gateway, request, trace, parse: JSON.parse })).rejects.toThrow("provider_unavailable");
    expect(runtime.completeSimple).toHaveBeenCalledTimes(1);
    expect(trace.attempts[0]).toMatchObject({ error: { stage: "provider", statusCode: 503,
      diagnosticCode: "CONNECTION_RESET", retryable: true } });
    expect(trace.attempts[0].outputText).toBeUndefined();
    expect(trace.attempts[0].usage).toBeUndefined();
  });

  it("only exposes rejected text via the opted-in diagnostic callback and isolates observer failures", async () => {
    const { gateway, request } = setup([response("private rejected text")]);
    const observer = vi.fn(() => { throw new Error("observer failure"); });
    const result = await gateway.generate(request, { onResponseDiagnostics: observer });
    expect(observer).toHaveBeenCalledWith(expect.objectContaining({ text: "private rejected text" }));
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_provider_response", validationStage: "json_syntax" } });
    expect(JSON.stringify(result)).not.toContain("private rejected text");
    const success = setup();
    await expect(success.gateway.generate(success.request, { onResponseDiagnostics: observer }))
      .resolves.toMatchObject({ ok: true });
  });

  it("retains partial provider error responses separately from sanitized errors", async () => {
    const value = { ...response("partial model text", "error"), errorMessage: "HTTP 503 private provider body" };
    const { gateway, request, trace } = setup([value]);
    await invokeInterviewModel(gateway, request, trace);
    expect(trace.attempts[0]).toMatchObject({ outputText: "partial model text", providerStopReason: "error" });
    expect(JSON.stringify(trace.attempts[0].error)).not.toContain("private provider body");
  });

  it("persists rejected responses in debug history across database reopen without creating candidate turns", async () => {
    const { gateway, request, trace } = setup([response("invalid raw output")]);
    await invokeInterviewModel(gateway, request, trace);
    const directory = await mkdtemp(join(tmpdir(), "pi-diagnostic-test-"));
    directories.push(directory);
    const path = join(directory, "interview.db");
    const db = new InterviewDatabase(path);
    let id: string;
    try {
      id = db.createInterview({ candidateName: "测试", positionTitle: "工程师", jobDescription: "岗位资料",
        resumeText: "简历资料", questionCount: 3, competencies: ["技术基础"] }).id;
      db.appendInterviewDebugTrace(id, trace);
    } finally { db.close(); }
    const reopened = new InterviewDatabase(path);
    try {
      const session = reopened.getInterviewSession(id)!;
      expect(session.turns).toHaveLength(0);
      expect(session.interview.status).toBe("draft");
      expect(session.debugEvents![0].trace.attempts).toEqual(trace.attempts);
    } finally { reopened.close(); }
  });
});
