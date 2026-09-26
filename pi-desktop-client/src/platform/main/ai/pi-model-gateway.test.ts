import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiRequestBudget } from "../../shared/ai/contracts";
import type { ModelRequest } from "../../shared/ai/model-gateway";
import {
  PiModelGateway,
  type PiModelRuntimePort,
  type PiModelSettingsPort,
} from "./pi-model-gateway";

type RuntimeModel = NonNullable<ReturnType<PiModelRuntimePort["getModel"]>>;
type RuntimeResponse = Awaited<ReturnType<PiModelRuntimePort["completeSimple"]>>;
type RuntimeContext = Parameters<PiModelRuntimePort["completeSimple"]>[1];
type RuntimeOptions = Parameters<PiModelRuntimePort["completeSimple"]>[2];
type RuntimeStreamEvent = ReturnType<PiModelRuntimePort["streamSimple"]> extends AsyncIterable<infer Event>
  ? Event
  : never;

const model = {
  id: "test-model",
  name: "Test Model",
  api: "openai-completions",
  provider: "test-provider",
  baseUrl: "https://provider.invalid/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 1 },
  contextWindow: 128_000,
  maxTokens: 8_000,
} as RuntimeModel;

function response(overrides: Partial<RuntimeResponse> = {}): RuntimeResponse {
  return {
    role: "assistant",
    content: [{ type: "text", text: "generated text" }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 10,
      output: 3,
      cacheRead: 2,
      cacheWrite: 0,
      reasoning: 1,
      totalTokens: 15,
      cost: { input: 0.01, output: 0.02, cacheRead: 0.001, cacheWrite: 0, total: 0.031 },
    },
    stopReason: "stop",
    timestamp: 1,
    ...overrides,
  } as RuntimeResponse;
}

function settings(overrides: Partial<PiModelSettingsPort> = {}): PiModelSettingsPort {
  return {
    getDefaultProvider: () => "test-provider",
    getDefaultModel: () => "test-model",
    reload: vi.fn(async () => undefined),
    getProviderRetrySettings: () => ({ timeoutMs: 20_000, maxRetries: 1, maxRetryDelayMs: 500 }),
    getWebSocketConnectTimeoutMs: () => 2_000,
    ...overrides,
  };
}

function request(
  overrides: Partial<ModelRequest> = {},
  budget: Partial<AiRequestBudget> = {},
): ModelRequest {
  return {
    metadata: {
      moduleId: "reading",
      purpose: "explain_chapter",
      privacy: "confidential",
      budget: {
        timeoutMs: 10_000,
        maxInputTokens: 8_000,
        maxOutputTokens: 1_000,
        maxCostUsd: 1,
        ...budget,
      },
    },
    messages: [
      { role: "system", content: "Follow the response contract." },
      { role: "user", content: "Explain this section." },
      { role: "assistant", content: "Earlier answer." },
      { role: "user", content: "Make it shorter." },
    ],
    temperature: 0.2,
    topP: 0.9,
    stopSequences: ["<END>"],
    ...overrides,
  };
}

function runtimeWithResponse(value: RuntimeResponse = response()) {
  let capturedContext: RuntimeContext | undefined;
  let capturedOptions: RuntimeOptions;
  const runtime: PiModelRuntimePort = {
    getModel: vi.fn((providerId, modelId) => (
      providerId === model.provider && modelId === model.id ? model : undefined
    )),
    completeSimple: vi.fn(async (_model, context, options) => {
      capturedContext = context;
      capturedOptions = options;
      return value;
    }),
    streamSimple: vi.fn(() => {
      throw new Error("stream not configured");
    }),
  };
  return {
    runtime,
    context: () => capturedContext,
    options: () => capturedOptions,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("PiModelGateway", () => {
  it("records a local deadline during settings loading without claiming a provider call", async () => {
    vi.useFakeTimers();
    const harness = runtimeWithResponse();
    let finishReload!: () => void;
    const observer = vi.fn();
    const gateway = new PiModelGateway(harness.runtime, settings({ reload: () => new Promise<void>((resolve) => {
      finishReload = resolve;
    }) }), { createRequestId: () => "before-response" });
    const pending = gateway.generate(request({}, { timeoutMs: 50 }), { onCallDiagnostics: observer });
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toMatchObject({ ok: false, error: { code: "timeout", diagnosticCode: "LOCAL_DEADLINE" } });
    expect(observer.mock.lastCall?.[0]).toMatchObject({ requestId: "before-response", phase: "settings",
      outcome: "failed", timeoutSource: "local_deadline", elapsedMs: 50, runtimeResponseReceived: false });
    expect(harness.runtime.completeSimple).not.toHaveBeenCalled();
    const count = observer.mock.calls.length;
    finishReload();
    await vi.advanceTimersByTimeAsync(1);
    expect(observer).toHaveBeenCalledTimes(count);
    expect(harness.runtime.completeSimple).not.toHaveBeenCalled();
  });

  it("records effective runtime parameters on deadline and keeps snapshots independent", async () => {
    vi.useFakeTimers();
    const harness = runtimeWithResponse();
    vi.mocked(harness.runtime.completeSimple).mockImplementation(() => new Promise(() => undefined));
    const observer = vi.fn();
    const pending = new PiModelGateway(harness.runtime, settings()).generate(request({}, { timeoutMs: 50 }),
      { onCallDiagnostics: observer });
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toMatchObject({ ok: false, error: { diagnosticCode: "LOCAL_DEADLINE" } });
    const last = observer.mock.lastCall?.[0];
    expect(last).toMatchObject({ phase: "runtime_call", elapsedMs: 50, timeoutSource: "local_deadline",
      runtimeResponseReceived: false, totalTimeoutMs: 50, runtimeTimeoutMs: 50, providerMaxRetries: 1,
      websocketConnectTimeoutMs: 2000, maxRetryDelayMs: 500, estimatedInputTokens: expect.any(Number) });
    expect(observer.mock.calls[0][0].timeline).toHaveLength(1);
    expect(last.timeline.at(-1).phase).toBe("runtime_call");
  });

  it.each([
    [Object.assign(new Error("upstream timeout sk-private"), { status: 504 }), "UPSTREAM_TIMEOUT", "timeout"],
    [Object.assign(new Error("private"), { code: "UND_ERR_HEADERS_TIMEOUT" }), "HEADER_TIMEOUT", "timeout"],
    [Object.assign(new Error("private"), { code: "UND_ERR_CONNECT_TIMEOUT" }), "CONNECT_TIMEOUT", "timeout"],
    [Object.assign(new Error("private"), { code: "UND_ERR_BODY_TIMEOUT" }), "BODY_TIMEOUT", "timeout"],
    [Object.assign(new Error("private"), { code: "CERT_HAS_EXPIRED" }), "TLS_FAILURE", "provider_unavailable"],
  ])("preserves safe transport evidence for %s", async (error, diagnosticCode, code) => {
    const harness = runtimeWithResponse();
    vi.mocked(harness.runtime.completeSimple).mockRejectedValueOnce(error);
    const observer = vi.fn();
    const result = await new PiModelGateway(harness.runtime, settings()).generate(request(), { onCallDiagnostics: observer });
    expect(result).toMatchObject({ ok: false, error: { code, diagnosticCode } });
    expect(observer.mock.lastCall?.[0]).toMatchObject({ phase: "runtime_call", outcome: "failed",
      ...(code === "timeout" ? { timeoutSource: "upstream" } : {}), runtimeResponseReceived: false });
    expect(JSON.stringify([result, observer.mock.calls])).not.toContain("private");
  });

  it("records response validation failures and isolates lifecycle observers", async () => {
    const harness = runtimeWithResponse();
    const observer = vi.fn();
    const result = await new PiModelGateway(harness.runtime, settings()).generate(
      request({ responseFormat: { type: "json" } }), { onCallDiagnostics: observer });
    expect(result).toMatchObject({ ok: false, error: { validationStage: "json_syntax" } });
    expect(observer.mock.lastCall?.[0]).toMatchObject({ phase: "response_validation", outcome: "failed", runtimeResponseReceived: true });
    await expect(new PiModelGateway(harness.runtime, settings()).generate(request(), {
      onCallDiagnostics: () => { throw new Error("observer failure"); },
    })).resolves.toMatchObject({ ok: true });
  });

  it("does not classify caller cancellation as a deadline", async () => {
    const controller = new AbortController();
    controller.abort();
    const observer = vi.fn();
    const harness = runtimeWithResponse();
    expect(await new PiModelGateway(harness.runtime, settings()).generate(request(), {
      signal: controller.signal, onCallDiagnostics: observer,
    })).toMatchObject({ ok: false, error: { code: "cancelled" } });
    expect(observer.mock.lastCall?.[0].timeoutSource).toBeUndefined();
    expect(harness.runtime.completeSimple).not.toHaveBeenCalled();
  });

  it("preserves provider-visible thinking when the runtime returns it", async () => {
    const harness = runtimeWithResponse(response({ content: [
      { type: "thinking", thinking: "先核对资料。" },
      { type: "text", text: "generated text" },
    ] }));
    const result = await new PiModelGateway(harness.runtime, settings()).generate(request());
    expect(result).toMatchObject({ ok: true, value: { text: "generated text", reasoningText: "先核对资料。" } });
  });

  it("reports the configured default route without sending a model request", async () => {
    const harness = runtimeWithResponse();
    const piSettings = settings();
    const gateway = new PiModelGateway(harness.runtime, piSettings);

    await expect(gateway.getConfiguredModel()).resolves.toEqual({
      providerId: "test-provider",
      modelId: "test-model",
    });
    expect(harness.runtime.completeSimple).not.toHaveBeenCalled();
  });

  it("lists locally available models with their supported reasoning levels", async () => {
    const reasoningModel = {
      ...model, id: "reasoning-model", name: "Reasoning Model", reasoning: true,
      thinkingLevelMap: { xhigh: "extra", max: null, high: null },
    } as RuntimeModel;
    const runtime: PiModelRuntimePort = {
      getModel: vi.fn((providerId, modelId) => providerId === model.provider && modelId === model.id ? model : undefined),
      getAvailableSnapshot: () => [reasoningModel],
      completeSimple: vi.fn(async () => response()),
      streamSimple: vi.fn(() => { throw new Error("unused"); }),
    };
    const gateway = new PiModelGateway(runtime, settings());

    await expect(gateway.getAvailableModels()).resolves.toEqual([
      { providerId: "test-provider", modelId: "reasoning-model", name: "Reasoning Model", reasoningLevels: ["minimal", "low", "medium", "xhigh"], contextWindowTokens: 128_000, maxOutputTokens: 8_000 },
      { providerId: "test-provider", modelId: "test-model", name: "Test Model", reasoningLevels: [], contextWindowTokens: 128_000, maxOutputTokens: 8_000 },
    ]);
    expect(runtime.completeSimple).not.toHaveBeenCalled();
  });

  it("uses Pi defaults and maps messages, options, text, usage, and stop reason", async () => {
    const harness = runtimeWithResponse();
    const piSettings = settings();
    const gateway = new PiModelGateway(harness.runtime, piSettings, {
      now: (() => {
        let value = 1_000;
        return () => value += 25;
      })(),
      createRequestId: () => "gateway-request-1",
    });

    const result = await gateway.generate(request());

    expect(result).toEqual({
      ok: true,
      value: {
        requestId: "gateway-request-1",
        model: { providerId: "test-provider", modelId: "test-model" },
        text: "generated text",
        finishReason: "stop",
        usage: {
          inputTokens: 10,
          outputTokens: 3,
          totalTokens: 15,
          cachedInputTokens: 2,
          cachedWriteTokens: 0,
          reasoningTokens: 1,
          costUsd: 0.031,
          durationMs: 50,
        },
      },
    });
    expect(piSettings.reload).toHaveBeenCalledOnce();
    expect(harness.context()?.systemPrompt).toBe("Follow the response contract.");
    expect(harness.context()?.messages).toMatchObject([
      { role: "user", content: "Explain this section." },
      { role: "assistant", content: [{ type: "text", text: "Earlier answer." }] },
      { role: "user", content: "Make it shorter." },
    ]);
    expect(harness.options()).toMatchObject({
      temperature: 0.2,
      maxTokens: 1_000,
      timeoutMs: 10_000,
      maxRetries: 1,
      maxRetryDelayMs: 500,
      websocketConnectTimeoutMs: 2_000,
      samplingParams: { top_p: 0.9, stop: ["<END>"] },
    });
    expect(harness.options()?.signal).toBeInstanceOf(AbortSignal);
  });

  it("passes a stable cache session ID to Pi independently of the request trace ID", async () => {
    const harness = runtimeWithResponse();
    const gateway = new PiModelGateway(harness.runtime, settings());
    const first = request({ metadata: { ...request().metadata, traceId: "round-1",
      cacheSessionId: "interview:interviewer:stable" } });
    expect((await gateway.generate(first)).ok).toBe(true);
    expect(harness.options()?.sessionId).toBe("interview:interviewer:stable");
    expect((await gateway.generate({ ...first, metadata: { ...first.metadata, traceId: "round-2" } })).ok).toBe(true);
    expect(harness.options()?.sessionId).toBe("interview:interviewer:stable");
  });

  it("honors an explicit model selector instead of the settings default", async () => {
    const selectedModel = { ...model, id: "selected-model", provider: "selected-provider" } as RuntimeModel;
    const runtime: PiModelRuntimePort = {
      getModel: vi.fn((providerId, modelId) => (
        providerId === selectedModel.provider && modelId === selectedModel.id ? selectedModel : undefined
      )),
      completeSimple: vi.fn(async () => response({ provider: selectedModel.provider, model: selectedModel.id })),
      streamSimple: vi.fn(() => { throw new Error("unused"); }),
    };
    const gateway = new PiModelGateway(runtime, settings(), { createRequestId: () => "selected" });

    const result = await gateway.generate(request({
      model: { providerId: "selected-provider", modelId: "selected-model" },
    }));

    expect(runtime.getModel).toHaveBeenCalledWith("selected-provider", "selected-model");
    expect(result).toMatchObject({
      ok: true,
      value: { model: { providerId: "selected-provider", modelId: "selected-model" } },
    });
  });

  it("passes the selected reasoning effort to Pi and rejects unsupported levels", async () => {
    const reasoningModel = { ...model, reasoning: true, thinkingLevelMap: { xhigh: null, max: null } } as RuntimeModel;
    let options: RuntimeOptions;
    const runtime: PiModelRuntimePort = {
      getModel: () => reasoningModel,
      completeSimple: vi.fn(async (_model, _context, value) => { options = value; return response(); }),
      streamSimple: vi.fn(() => { throw new Error("unused"); }),
    };
    const gateway = new PiModelGateway(runtime, settings());

    expect((await gateway.generate(request({ reasoning: "high" }))).ok).toBe(true);
    expect(options).toMatchObject({ reasoning: "high" });
    const unsupported = await gateway.generate(request({ reasoning: "max" }));
    expect(unsupported).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(runtime.completeSimple).toHaveBeenCalledTimes(1);
  });

  it("omits unsupported sampling parameters for GPT-6 reasoning requests", async () => {
    const gpt6 = { ...model, provider: "openai-codex", id: "gpt-6-luna", reasoning: true } as RuntimeModel;
    let options: RuntimeOptions;
    const runtime: PiModelRuntimePort = {
      getModel: () => gpt6,
      completeSimple: vi.fn(async (_model, _context, value) => { options = value; return response(); }),
      streamSimple: vi.fn(() => { throw new Error("unused"); }),
    };
    const gateway = new PiModelGateway(runtime, settings());

    expect((await gateway.generate(request({
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" }, reasoning: "medium",
    }))).ok).toBe(true);
    expect(options).toMatchObject({ reasoning: "medium", samplingParams: { stop: ["<END>"] } });
    expect(options).not.toHaveProperty("temperature");
    expect(options?.samplingParams).not.toHaveProperty("top_p");
  });

  it("classifies a provider's unsupported-parameter response as an invalid request", async () => {
    const harness = runtimeWithResponse();
    vi.mocked(harness.runtime.completeSimple).mockRejectedValueOnce(new Error("Unsupported parameter: temperature"));

    expect(await new PiModelGateway(harness.runtime, settings()).generate(request())).toMatchObject({
      ok: false, error: { code: "invalid_request", diagnosticCode: "UNSUPPORTED_PARAMETER", retryable: false },
    });
  });

  it("classifies a provider context-window rejection without leaking its raw message", async () => {
    const harness = runtimeWithResponse();
    vi.mocked(harness.runtime.completeSimple).mockRejectedValueOnce(new Error("maximum context length exceeded; private input marker"));
    const result = await new PiModelGateway(harness.runtime, settings()).generate(request());
    expect(result).toMatchObject({ ok: false, error: { code: "budget_exceeded", diagnosticCode: "CONTEXT_LIMIT", retryable: false } });
    expect(JSON.stringify(result)).not.toContain("private input marker");
  });

  it("adds and enforces a bounded JSON response contract", async () => {
    const harness = runtimeWithResponse(response({
      content: [{ type: "text", text: "{\"questions\":[\"one\",\"two\"]}" }],
    }));
    const gateway = new PiModelGateway(harness.runtime, settings(), { createRequestId: () => "json" });
    const jsonRequest = request({
      responseFormat: {
        type: "json",
        schemaName: "questions_v1",
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["questions"],
          properties: {
            questions: {
              type: "array",
              minItems: 2,
              maxItems: 2,
              uniqueItems: true,
              items: { type: "string", minLength: 1 },
            },
          },
        },
      },
    });

    const result = await gateway.generate(jsonRequest);

    expect(result.ok).toBe(true);
    expect(harness.context()?.systemPrompt).toContain("JSON contract name: questions_v1");
    expect(harness.context()?.systemPrompt).toContain('"additionalProperties":false');

    const invalidHarness = runtimeWithResponse(response({
      content: [{ type: "text", text: "{\"questions\":[\"duplicate\",\"duplicate\"]}" }],
    }));
    const invalid = await new PiModelGateway(invalidHarness.runtime, settings()).generate(jsonRequest);
    expect(invalid).toMatchObject({
      ok: false,
      error: { code: "invalid_provider_response", retryable: true, providerId: "test-provider" },
    });

    const missingHarness = runtimeWithResponse(response({ content: [{ type: "text", text: "{}" }] }));
    const missing = await new PiModelGateway(missingHarness.runtime, settings()).generate(jsonRequest);
    expect(missing).toMatchObject({ ok: false, error: {
      code: "invalid_provider_response", validationIssues: ["$.questions: 缺少必填字段"],
    } });
  });

  it("returns not_configured when settings do not select a model", async () => {
    const harness = runtimeWithResponse();
    const gateway = new PiModelGateway(harness.runtime, settings({
      getDefaultProvider: () => undefined,
      getDefaultModel: () => undefined,
    }));

    const result = await gateway.generate(request());

    expect(result).toEqual({
      ok: false,
      error: {
        code: "not_configured",
        message: "The selected AI provider or model is not configured",
        retryable: false,
      },
    });
    expect(harness.runtime.completeSimple).not.toHaveBeenCalled();
  });

  it("enforces cancellation and the hard wall-clock deadline", async () => {
    const cancelledHarness = runtimeWithResponse();
    const controller = new AbortController();
    controller.abort();
    const cancelled = await new PiModelGateway(cancelledHarness.runtime, settings()).generate(
      request(),
      { signal: controller.signal },
    );
    expect(cancelled).toMatchObject({ ok: false, error: { code: "cancelled", retryable: false } });
    expect(cancelledHarness.runtime.completeSimple).not.toHaveBeenCalled();

    vi.useFakeTimers();
    let providerSignal: AbortSignal | undefined;
    const timeoutRuntime: PiModelRuntimePort = {
      getModel: () => model,
      completeSimple: vi.fn(async (_model, _context, options) => {
        providerSignal = options?.signal;
        return new Promise<RuntimeResponse>(() => undefined);
      }),
      streamSimple: vi.fn(() => { throw new Error("unused"); }),
    };
    const pending = new PiModelGateway(timeoutRuntime, settings()).generate(
      request({}, { timeoutMs: 50 }),
    );
    await vi.advanceTimersByTimeAsync(50);
    const timedOut = await pending;
    expect(timedOut).toMatchObject({ ok: false, error: { code: "timeout", retryable: true } });
    expect(providerSignal?.aborted).toBe(true);
  });

  it("sanitizes provider errors without returning prompts or credentials", async () => {
    const unsafe = Object.assign(
      new Error("401 request contained private prompt and api key sk-secret-value"),
      { status: 401 },
    );
    const harness = runtimeWithResponse();
    vi.mocked(harness.runtime.completeSimple).mockRejectedValueOnce(unsafe);
    const result = await new PiModelGateway(harness.runtime, settings()).generate(request());

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "authentication_failed",
        message: "AI provider authentication failed",
        retryable: false,
        providerId: "test-provider",
        statusCode: 401,
      },
    });
    expect(JSON.stringify(result)).not.toContain("private prompt");
    expect(JSON.stringify(result)).not.toContain("sk-secret-value");
  });

  it("retains a safe transport diagnosis without leaking the provider message", async () => {
    const unsafe = new Error("fetch failed while sending private prompt sk-secret-value", {
      cause: Object.assign(new Error("socket closed"), { code: "ECONNRESET" }),
    });
    const harness = runtimeWithResponse();
    vi.mocked(harness.runtime.completeSimple).mockRejectedValueOnce(unsafe);

    const result = await new PiModelGateway(harness.runtime, settings()).generate(request());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "provider_unavailable", diagnosticCode: "CONNECTION_RESET", retryable: true },
    });
    expect(JSON.stringify(result)).not.toContain("private prompt");
    expect(JSON.stringify(result)).not.toContain("sk-secret-value");
  });

  it("maps a Pi stream into exactly one terminal gateway event", async () => {
    const finalResponse = response({ content: [{ type: "thinking", thinking: "先检查输入" }, { type: "text", text: "hello" }] });
    async function* events(): AsyncIterable<RuntimeStreamEvent> {
      yield { type: "thinking_delta", delta: "先检查输入" } as RuntimeStreamEvent;
      yield { type: "text_delta", delta: "hel" } as RuntimeStreamEvent;
      yield { type: "text_delta", delta: "lo" } as RuntimeStreamEvent;
      yield { type: "done", reason: "stop", message: finalResponse } as RuntimeStreamEvent;
    }
    const runtime: PiModelRuntimePort = {
      getModel: () => model,
      completeSimple: vi.fn(async () => finalResponse),
      streamSimple: vi.fn(() => events()),
    };
    const gateway = new PiModelGateway(runtime, settings(), { createRequestId: () => "stream-1" });

    const received = [];
    const streamedRequest = request();
    for await (const event of gateway.stream(streamedRequest)) received.push(event);

    const expectedInputCharacters = streamedRequest.messages.reduce((total, message) => total + message.content.length, 0);

    expect(received).toMatchObject([
      { type: "started", requestId: "stream-1", diagnostics: { effectiveSystemPrompt: "Follow the response contract.",
        estimatedInputTokens: expect.any(Number), inputTextCharacters: expectedInputCharacters,
        modelContextWindowTokens: 128_000, effectiveTimeoutMs: 10_000, maxOutputTokens: 1_000, temperatureApplied: true } },
      { type: "reasoning_delta", delta: "先检查输入" },
      { type: "text_delta", delta: "hel" },
      { type: "text_delta", delta: "lo" },
      { type: "usage", usage: { inputTokens: 10, outputTokens: 3 } },
      { type: "completed", response: { requestId: "stream-1", text: "hello", reasoningText: "先检查输入", finishReason: "stop" } },
    ]);
    expect(received.filter((event) => event.type === "completed" || event.type === "failed")).toHaveLength(1);
  });

  it("counts the final system text including the JSON contract in stream diagnostics", async () => {
    const finalResponse = response({ content: [{ type: "text", text: '{"ok":true}' }] });
    async function* events(): AsyncIterable<RuntimeStreamEvent> {
      yield { type: "done", reason: "stop", message: finalResponse } as RuntimeStreamEvent;
    }
    const runtime: PiModelRuntimePort = {
      getModel: () => model,
      completeSimple: vi.fn(async () => finalResponse),
      streamSimple: vi.fn(() => events()),
    };
    const gateway = new PiModelGateway(runtime, settings());
    const received = [];
    for await (const event of gateway.stream(request({
      messages: [{ role: "system", content: "规则" }, { role: "user", content: "资料正文" }],
      responseFormat: { type: "json", schemaName: "test_contract", jsonSchema: {
        type: "object", required: ["ok"], properties: { ok: { type: "boolean" } },
      } },
    }))) received.push(event);

    const started = received[0];
    expect(started?.type).toBe("started");
    if (started?.type !== "started") return;
    expect(started.diagnostics?.effectiveSystemPrompt).toContain("JSON contract name: test_contract.");
    expect(started.diagnostics?.inputTextCharacters).toBe(
      (started.diagnostics?.effectiveSystemPrompt?.length ?? 0) + "资料正文".length,
    );
  });
});
