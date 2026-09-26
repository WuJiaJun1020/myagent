import { describe, expect, it } from "vitest";
import {
  aiSuccess,
  assertAiRequestMetadata,
  type AiRequestMetadata,
} from "./contracts";
import { RecordingEmbeddingGateway, RecordingModelGateway } from "./testing";

const metadata = (moduleId: string, purpose: string): AiRequestMetadata => ({
  moduleId,
  purpose,
  privacy: "confidential",
  budget: {
    timeoutMs: 30_000,
    maxInputTokens: 8_000,
    maxOutputTokens: 1_000,
    maxCostUsd: 0.25,
  },
});

describe("shared AI gateway contracts", () => {
  it("requires module, purpose, privacy, and a valid budget at runtime", () => {
    expect(() => assertAiRequestMetadata(metadata("interview", "prepare_questions"))).not.toThrow();
    expect(() => assertAiRequestMetadata(null)).toThrow("must be an object");
    expect(() => assertAiRequestMetadata({ moduleId: "interview", purpose: "prepare_questions", privacy: "confidential" }))
      .toThrow("budget is required");
    expect(() => assertAiRequestMetadata(metadata("", "prepare_questions"))).toThrow("moduleId is required");
    expect(() => assertAiRequestMetadata(metadata("reading", ""))).toThrow("purpose is required");
    expect(() => assertAiRequestMetadata(metadata(" Interview ", "prepare_questions"))).toThrow("canonical lowercase routing ID");
    expect(() => assertAiRequestMetadata(metadata("reading", "Prepare Questions"))).toThrow("canonical lowercase routing ID");
    expect(() => assertAiRequestMetadata({
      ...metadata("reading", "explain_chapter"),
      budget: { timeoutMs: 0 },
    })).toThrow("budget.timeoutMs");
    expect(() => assertAiRequestMetadata({
      ...metadata("reading", "explain_chapter"),
      budget: { timeoutMs: 1_000, maxCostUsd: -1 },
    })).toThrow("budget.maxCostUsd");
    expect(() => assertAiRequestMetadata({ ...metadata("interview", "interview_chat"),
      cacheSessionId: "interview:interviewer:stable" })).not.toThrow();
    expect(() => assertAiRequestMetadata({ ...metadata("interview", "interview_chat"),
      cacheSessionId: "contains a space" })).toThrow("cacheSessionId");
  });

  it("records model calls with module-owned metadata but no shared conversation state", async () => {
    const gateway = new RecordingModelGateway((request) => aiSuccess({
      requestId: `request-${request.metadata.moduleId}`,
      model: { providerId: "test", modelId: "test-model" },
      text: "generated text",
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
    }));

    const interviewRequest = {
      metadata: metadata("interview", "prepare_questions"),
      messages: [{ role: "user" as const, content: "Interview-owned prompt" }],
    };
    const readingRequest = {
      metadata: metadata("reading", "explain_chapter"),
      messages: [{ role: "user" as const, content: "Reading-owned prompt" }],
    };

    const interviewResult = await gateway.generate(interviewRequest);
    const readingResult = await gateway.generate(readingRequest);

    expect(interviewResult).toMatchObject({ ok: true, value: { requestId: "request-interview" } });
    expect(readingResult).toMatchObject({ ok: true, value: { requestId: "request-reading" } });
    expect(gateway.generateRequests).toEqual([interviewRequest, readingRequest]);
    expect(gateway.generateRequests[0]?.messages).not.toBe(gateway.generateRequests[1]?.messages);
  });

  it("provides a standardized failure when a test double has no provider response", async () => {
    const model = new RecordingModelGateway();
    const result = await model.generate({
      metadata: metadata("interview", "prepare_questions"),
      messages: [{ role: "user", content: "prompt" }],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "not_configured",
        message: "No model test response was configured",
        retryable: false,
      },
    });
  });

  it("returns a standardized invalid-request result at the ownership boundary", async () => {
    const model = new RecordingModelGateway();
    const result = await model.generate({
      metadata: { ...metadata("interview", "prepare_questions"), moduleId: "" },
      messages: [{ role: "user", content: "prompt" }],
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_request", retryable: false },
    });
    expect(model.generateRequests).toHaveLength(0);
  });

  it("preserves embedding input IDs and records the owning module", async () => {
    const gateway = new RecordingEmbeddingGateway((request) => aiSuccess({
      requestId: "embedding-request",
      model: { providerId: "test", modelId: "embedding-model" },
      dimensions: 3,
      embeddings: request.inputs.map((input) => ({ id: input.id, vector: [1, 2, 3] })),
      usage: { inputItems: request.inputs.length },
    }));
    const request = {
      metadata: metadata("reading", "index_chapter"),
      inputs: [
        { id: "paragraph-1", text: "First paragraph" },
        { id: "paragraph-2", text: "Second paragraph" },
      ],
    };

    const result = await gateway.embed(request);

    expect(result).toMatchObject({
      ok: true,
      value: {
        dimensions: 3,
        embeddings: [{ id: "paragraph-1" }, { id: "paragraph-2" }],
      },
    });
    expect(gateway.requests[0]?.metadata).toMatchObject({
      moduleId: "reading",
      purpose: "index_chapter",
      privacy: "confidential",
    });
  });
});
