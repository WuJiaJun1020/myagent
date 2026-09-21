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

  it("maps a Pi stream into exactly one terminal gateway event", async () => {
    const finalResponse = response({ content: [{ type: "text", text: "hello" }] });
    async function* events(): AsyncIterable<RuntimeStreamEvent> {
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
    for await (const event of gateway.stream(request())) received.push(event);

    expect(received).toMatchObject([
      { type: "started", requestId: "stream-1" },
      { type: "text_delta", delta: "hel" },
      { type: "text_delta", delta: "lo" },
      { type: "usage", usage: { inputTokens: 10, outputTokens: 3 } },
      { type: "completed", response: { requestId: "stream-1", text: "hello", finishReason: "stop" } },
    ]);
    expect(received.filter((event) => event.type === "completed" || event.type === "failed")).toHaveLength(1);
  });
});
