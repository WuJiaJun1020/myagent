import { describe, expect, it } from "vitest";
import { aiFailure, aiSuccess, type AiCallOptions } from "../../platform/shared/ai/contracts";
import { RecordingModelGateway } from "../../platform/shared/ai/testing";
import {
  GatewayInterviewModelProvider,
  INTERVIEW_PREPARED_QUESTION_LIMITS,
  INTERVIEW_PREPARE_QUESTIONS_BUDGET,
  INTERVIEW_PREPARE_QUESTIONS_PROMPT_VERSION,
  type PrepareInterviewQuestionsInput,
} from "./interview-model-provider";

const input: PrepareInterviewQuestionsInput = {
  positionTitle: "高级后端工程师",
  jobDescription: "SECRET-JD：负责高并发订单系统并保护 sk-live-not-a-real-key。",
  resumeText: "SECRET-RESUME：候选人负责过订单服务拆分。",
  questionCount: 2,
  competencies: ["技术基础", "项目经验"],
};

type WireQuestion = {
  ordinal: number;
  competency: string;
  kind: string;
  difficulty: string;
  prompt: string;
  rubric: unknown[];
  [key: string]: unknown;
};

function validQuestions(): WireQuestion[] {
  return [
    {
      ordinal: 0,
      competency: "技术基础",
      kind: "technical",
      difficulty: "intermediate",
      prompt: "请说明如何设计订单接口的幂等机制，并分析关键取舍。",
      rubric: ["说明幂等键的生成与持久化", "覆盖并发、重试与过期策略"],
    },
    {
      ordinal: 1,
      competency: "项目经验",
      kind: "project",
      difficulty: "advanced",
      prompt: "请结合真实项目说明一次服务拆分决策、结果和复盘过程。",
      rubric: ["给出候选人本人承担的职责", "使用可核验指标说明结果"],
    },
  ];
}

function modelResponse(text: string) {
  return aiSuccess({
    requestId: "request-1",
    model: { providerId: "test-provider", modelId: "test-model" },
    text,
    finishReason: "stop" as const,
    usage: {
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      costUsd: 0.01,
    },
  });
}

describe("GatewayInterviewModelProvider", () => {
  it("generates a validated plan with interview-owned metadata and a safe invocation summary", async () => {
    const rawResponse = JSON.stringify({ questions: validQuestions() });
    let receivedOptions: AiCallOptions | undefined;
    const gateway = new RecordingModelGateway((_, options) => {
      receivedOptions = options;
      return modelResponse(rawResponse);
    });
    const clock = [1_000, 1_037];
    const provider = new GatewayInterviewModelProvider(gateway, {
      model: { providerId: "configured-provider", modelId: "configured-model" },
      now: () => clock.shift() ?? 1_037,
    });
    const controller = new AbortController();

    const result = await provider.prepareQuestions(input, {
      signal: controller.signal,
      traceId: "prepare-operation-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected a successful result");
    expect(result.value).toEqual({
      promptVersion: INTERVIEW_PREPARE_QUESTIONS_PROMPT_VERSION,
      questions: validQuestions(),
    });
    expect(result.invocation).toMatchObject({
      status: "succeeded",
      purpose: "prepare_questions",
      promptVersion: INTERVIEW_PREPARE_QUESTIONS_PROMPT_VERSION,
      providerId: "test-provider",
      modelId: "test-model",
      usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200, costUsd: 0.01 },
      durationMs: 37,
    });
    expect(result.invocation.requestHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.invocation.responseHash).toMatch(/^[a-f0-9]{64}$/u);

    expect(gateway.generateRequests).toHaveLength(1);
    const request = gateway.generateRequests[0]!;
    expect(request.metadata).toEqual({
      moduleId: "interview",
      purpose: "prepare_questions",
      privacy: "confidential",
      budget: INTERVIEW_PREPARE_QUESTIONS_BUDGET,
      traceId: "prepare-operation-1",
    });
    expect(request.model).toEqual({ providerId: "configured-provider", modelId: "configured-model" });
    expect(request.responseFormat).toMatchObject({ type: "json", schemaName: "interview_prepare_questions_v1" });
    expect(request.messages[0]?.content).toContain(INTERVIEW_PREPARE_QUESTIONS_PROMPT_VERSION);
    expect(request.messages[1]?.content).toContain(input.jobDescription);
    expect(request.messages[1]?.content).toContain(input.resumeText);
    expect(receivedOptions?.signal).toBe(controller.signal);

    const safeSummary = JSON.stringify(result.invocation);
    expect(safeSummary).not.toContain(input.jobDescription);
    expect(safeSummary).not.toContain(input.resumeText);
    expect(safeSummary).not.toContain(rawResponse);
    expect(safeSummary).not.toContain("sk-live-not-a-real-key");
  });

  it.each([
    ["non-JSON", () => "not valid JSON", "不是合法 JSON"],
    ["wrong question count", () => JSON.stringify({ questions: validQuestions().slice(0, 1) }), "数量不匹配"],
    ["non-contiguous ordinal", () => {
      const questions = validQuestions();
      questions[1]!.ordinal = 2;
      return JSON.stringify({ questions });
    }, "ordinal"],
    ["unknown competency", () => {
      const questions = validQuestions();
      questions[0]!.competency = "领导力";
      return JSON.stringify({ questions });
    }, "能力维度"],
    ["unknown kind", () => {
      const questions = validQuestions();
      questions[0]!.kind = "puzzle";
      return JSON.stringify({ questions });
    }, "类型"],
    ["unknown difficulty", () => {
      const questions = validQuestions();
      questions[0]!.difficulty = "expert";
      return JSON.stringify({ questions });
    }, "难度"],
    ["blank prompt", () => {
      const questions = validQuestions();
      questions[0]!.prompt = "   ";
      return JSON.stringify({ questions });
    }, "题目内容"],
    ["oversized prompt", () => {
      const questions = validQuestions();
      questions[0]!.prompt = "问".repeat(INTERVIEW_PREPARED_QUESTION_LIMITS.maximumPromptLength + 1);
      return JSON.stringify({ questions });
    }, "题目内容"],
    ["empty rubric", () => {
      const questions = validQuestions();
      questions[0]!.rubric = [];
      return JSON.stringify({ questions });
    }, "评分量表数量"],
    ["oversized rubric item", () => {
      const questions = validQuestions();
      questions[0]!.rubric = ["量".repeat(INTERVIEW_PREPARED_QUESTION_LIMITS.maximumRubricItemLength + 1)];
      return JSON.stringify({ questions });
    }, "评分量表项"],
    ["duplicate prompt", () => {
      const questions = validQuestions();
      questions[1]!.prompt = `${questions[0]!.prompt}？`;
      return JSON.stringify({ questions });
    }, "重复题目"],
    ["extra question field", () => {
      const questions = validQuestions();
      questions[0]!.answer = "raw answer";
      return JSON.stringify({ questions });
    }, "题目结构"],
  ])("rejects an invalid structured response: %s", async (_name, response, message) => {
    const rawResponse = response();
    const gateway = new RecordingModelGateway(() => modelResponse(rawResponse));
    const provider = new GatewayInterviewModelProvider(gateway);

    const result = await provider.prepareQuestions(input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failed result");
    expect(result.error).toMatchObject({ code: "invalid_provider_response", retryable: true });
    expect(result.error.message).toContain(message);
    expect(result.invocation).toMatchObject({
      status: "failed",
      errorCode: "invalid_provider_response",
      providerId: "test-provider",
      modelId: "test-model",
      usage: { totalTokens: 200 },
    });
    expect(result.invocation.responseHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(result.invocation)).not.toContain(rawResponse);
    expect(JSON.stringify(result.invocation)).not.toContain(input.jobDescription);
    expect(JSON.stringify(result.invocation)).not.toContain(input.resumeText);
  });

  it("preserves a gateway failure code while replacing an unsafe provider message", async () => {
    const gateway = new RecordingModelGateway(() => aiFailure({
      code: "rate_limited",
      message: `provider leaked ${input.jobDescription} ${input.resumeText} API key sk-secret`,
      retryable: true,
      providerId: "test-provider",
      retryAfterMs: 500,
    }));
    const provider = new GatewayInterviewModelProvider(gateway);

    const result = await provider.prepareQuestions(input);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "rate_limited", message: "模型服务请求过于频繁", retryable: true },
      invocation: {
        status: "failed",
        providerId: "test-provider",
        errorCode: "rate_limited",
        errorMessage: "模型服务请求过于频繁",
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(input.jobDescription);
    expect(serialized).not.toContain(input.resumeText);
    expect(serialized).not.toContain("sk-secret");
  });

  it("sanitizes unexpected thrown errors from a gateway", async () => {
    const gateway = new RecordingModelGateway(() => {
      throw new Error(`transport included ${input.resumeText} and sk-secret`);
    });
    const provider = new GatewayInterviewModelProvider(gateway);

    const result = await provider.prepareQuestions(input);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "unknown", message: "模型调用失败", retryable: true },
      invocation: { status: "failed", errorCode: "unknown", errorMessage: "模型调用失败" },
    });
    expect(JSON.stringify(result)).not.toContain(input.resumeText);
    expect(JSON.stringify(result)).not.toContain("sk-secret");
  });

  it("does not mistake a credential-shaped gateway identifier for a model ID", async () => {
    const gateway = new RecordingModelGateway(() => aiFailure({
      code: "authentication_failed",
      message: "authentication failed",
      retryable: false,
      providerId: "sk-secret-provider-value",
    }));
    const provider = new GatewayInterviewModelProvider(gateway);

    const result = await provider.prepareQuestions(input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failed result");
    expect(result.invocation.providerId).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("sk-secret-provider-value");
  });

  it("returns cancellation without invoking the gateway when the signal is already aborted", async () => {
    const gateway = new RecordingModelGateway();
    const provider = new GatewayInterviewModelProvider(gateway);
    const controller = new AbortController();
    controller.abort(new Error(`do not expose ${input.jobDescription}`));

    const result = await provider.prepareQuestions(input, { signal: controller.signal });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "cancelled", message: "模型调用已取消", retryable: false },
      invocation: { status: "failed", errorCode: "cancelled", errorMessage: "模型调用已取消" },
    });
    expect(gateway.generateRequests).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain(input.jobDescription);
  });

  it("rejects invalid preparation input before invoking the gateway", async () => {
    const gateway = new RecordingModelGateway();
    const provider = new GatewayInterviewModelProvider(gateway);

    const result = await provider.prepareQuestions({ ...input, competencies: ["技术基础", "技术基础"] });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_request", message: "能力维度不能重复", retryable: false },
    });
    expect(gateway.generateRequests).toHaveLength(0);
  });

  it("rejects oversized combined JD and resume input instead of silently truncating it", async () => {
    const gateway = new RecordingModelGateway();
    const provider = new GatewayInterviewModelProvider(gateway);
    const maximum = INTERVIEW_PREPARED_QUESTION_LIMITS.maximumCombinedInputCharacters;

    const result = await provider.prepareQuestions({
      ...input,
      jobDescription: "岗".repeat(Math.floor(maximum / 2) + 1),
      resumeText: "历".repeat(Math.ceil(maximum / 2)),
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_request",
        message: "岗位描述与简历合计过长，请精简后重试",
        retryable: false,
      },
      invocation: {
        status: "failed",
        errorCode: "invalid_request",
        errorMessage: "岗位描述与简历合计过长，请精简后重试",
      },
    });
    expect(gateway.generateRequests).toHaveLength(0);
  });
});
