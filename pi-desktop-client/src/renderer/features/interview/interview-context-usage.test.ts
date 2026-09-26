import { describe, expect, it } from "vitest";
import type { InterviewCallTrace, InterviewChatModelInfo, InterviewSession } from "../../../shared/contracts/interview";
import { readInterviewCacheUsage, readInterviewContextUsage } from "./interview-context-usage";

const models: InterviewChatModelInfo["availableModels"] = [
  { providerId: "openai-codex", modelId: "gpt-6-luna", name: "GPT-6 Luna",
    reasoningLevels: ["medium"], contextWindowTokens: 272_000 },
  { providerId: "deepseek", modelId: "test-model", name: "Test Model",
    reasoningLevels: [], contextWindowTokens: 128_000 },
];

const trace: InterviewCallTrace = {
  operationId: "call-1", status: "succeeded", startedAt: "2026-09-23T00:00:00.000Z",
  finishedAt: "2026-09-23T00:00:01.000Z", requestedModel: { providerId: "openai-codex", modelId: "gpt-6-luna" },
  reasoning: "medium", timeoutMs: 180_000, messages: [], outputText: "你好。",
  attempts: [{ providerId: "openai-codex", modelId: "gpt-6-luna",
    startedAt: "2026-09-23T00:00:00.000Z", finishedAt: "2026-09-23T00:00:01.000Z",
    usage: { inputTokens: 834, cachedInputTokens: 100, cachedWriteTokens: 10, outputTokens: 25, totalTokens: 969 } }],
};

const session: InterviewSession = {
  interview: { id: "one", title: "测试", candidateName: "候选人", positionTitle: "工程师",
    status: "interviewing", currentQuestionIndex: 0, questionCount: 0, competencies: [],
    createdAt: trace.startedAt, updatedAt: trace.finishedAt, documents: [] },
  plan: null, currentQuestion: null, answeredCount: 0, preparationError: null,
  turns: [{ id: "turn-1", ordinal: 0, role: "interviewer", content: "你好。", createdAt: trace.finishedAt, trace }],
};

describe("readInterviewContextUsage", () => {
  it("sums provider-reported input while showing the latest complete request against its model window", () => {
    expect(readInterviewContextUsage(session, models))
      .toEqual({ totalInputTokens: 944, latestInputTokens: 944, latestContextWindowTokens: 272_000,
        latestContextPercent: 944 / 272_000 * 100, measuredInputAttempts: 1, partialInputAttempts: 0,
        unmeasuredInputAttempts: 0 });
  });

  it("does not invent usage before any call and compares each model against its own window", () => {
    expect(readInterviewContextUsage({ ...session, turns: [] }, models))
      .toEqual({ totalInputTokens: null, latestInputTokens: null, latestContextWindowTokens: null,
        latestContextPercent: null, measuredInputAttempts: 0, partialInputAttempts: 0,
        unmeasuredInputAttempts: 0 });
    const otherModel: InterviewCallTrace = { ...trace, operationId: "deepseek-call",
      attempts: [{ ...trace.attempts[0], providerId: "deepseek", modelId: "test-model",
        usage: { inputTokens: 2000, cachedInputTokens: 0 } }] };
    const mixed: InterviewSession = { ...session, turns: [...session.turns,
      { ...session.turns[0], id: "turn-2", ordinal: 2, trace: otherModel }] };
    expect(readInterviewContextUsage(mixed, models)).toMatchObject({ totalInputTokens: 2944,
      latestInputTokens: 2000, latestContextWindowTokens: 128_000,
      latestContextPercent: 2000 / 128_000 * 100, measuredInputAttempts: 2 });
  });

  it("retains the last successful provider reading while a candidate reply awaits completion", () => {
    const awaiting: InterviewSession = { ...session, turns: [...session.turns,
      { id: "turn-2", ordinal: 1, role: "candidate", content: "回答", createdAt: trace.finishedAt }] };
    expect(readInterviewContextUsage(awaiting, models)).toMatchObject({ totalInputTokens: 944,
      latestInputTokens: 944 });
  });

  it("treats empty provider counters as unavailable rather than showing a fake zero", () => {
    const emptyUsage: InterviewSession = { ...session, turns: [{ ...session.turns[0],
      trace: { ...trace, attempts: [{ ...trace.attempts[0], usage: { inputTokens: 0, outputTokens: 0 } }] } }] };
    expect(readInterviewContextUsage(emptyUsage, models).totalInputTokens).toBeNull();
    expect(readInterviewContextUsage(emptyUsage, models).unmeasuredInputAttempts).toBe(1);
  });

  it("tracks each agent separately and shows no made-up cache rate when a provider omits cache data", () => {
    const candidateTrace: InterviewCallTrace = { ...trace, actor: "candidate", operationId: "candidate-call",
      attempts: [{ ...trace.attempts[0], usage: { inputTokens: 400, cachedInputTokens: 0 } }] };
    const directorTrace: InterviewCallTrace = { ...trace, actor: "director", operationId: "director-call",
      attempts: [{ ...trace.attempts[0], usage: { inputTokens: 350 } }] };
    const scoreTrace: InterviewCallTrace = { ...trace, actor: "score", operationId: "score-call",
      attempts: [{ ...trace.attempts[0], usage: { inputTokens: 700, cachedInputTokens: 200 } }] };
    const withDebug: InterviewSession = { ...session, debugEvents: [
      { id: "candidate", ordinal: 1, createdAt: trace.finishedAt, trace: candidateTrace },
      { id: "director", ordinal: 2, createdAt: trace.finishedAt, trace: directorTrace },
      { id: "score", ordinal: 3, createdAt: trace.finishedAt, trace: scoreTrace },
    ] };
    expect(readInterviewContextUsage(withDebug, models, "candidate"))
      .toMatchObject({ totalInputTokens: 400, latestInputTokens: 400 });
    expect(readInterviewContextUsage(withDebug, models, "director"))
      .toMatchObject({ totalInputTokens: 350, latestInputTokens: 350, partialInputAttempts: 1 });
    expect(readInterviewContextUsage(withDebug, models, "interviewer").totalInputTokens).toBe(944);
    expect(readInterviewContextUsage(withDebug, models, "score"))
      .toMatchObject({ totalInputTokens: 900, latestInputTokens: 900 });
    expect(readInterviewContextUsage(withDebug, models).totalInputTokens).toBe(2594);
  });

  it("weights all physical model attempts across rounds and agents, including repairs and discarded drafts", () => {
    const nextTrace: InterviewCallTrace = { ...trace, operationId: "call-2", attempts: [
      { ...trace.attempts[0], usage: { inputTokens: 100, cachedInputTokens: 300 } },
      { ...trace.attempts[0], usage: { inputTokens: 50, cachedInputTokens: 50 } },
    ] };
    const draftTrace: InterviewCallTrace = { ...trace, actor: "interviewer", operationId: "draft", status: "failed", attempts: [
      { ...trace.attempts[0], usage: { inputTokens: 200, cachedInputTokens: 0 } },
      { ...trace.attempts[0], usage: { inputTokens: 120 } },
    ] };
    const candidateTrace: InterviewCallTrace = { ...trace, actor: "candidate", operationId: "candidate",
      attempts: [{ ...trace.attempts[0], usage: { inputTokens: 200, cachedInputTokens: 200 } }] };
    const interview: InterviewSession = { ...session, turns: [...session.turns, { ...session.turns[0], id: "turn-2",
      ordinal: 2, trace: nextTrace }], debugEvents: [
      { id: "draft", ordinal: 3, createdAt: trace.finishedAt, trace: draftTrace },
      { id: "candidate", ordinal: 4, createdAt: trace.finishedAt, trace: candidateTrace },
    ] };
    expect(readInterviewCacheUsage(interview)).toEqual({ cachedInputTokens: 650,
      cacheTotalInputTokens: 2044, cacheHitRate: 650 / 2044, measuredAttempts: 5, unmeasuredAttempts: 1 });
    expect(readInterviewCacheUsage(interview, "interviewer")).toEqual({ cachedInputTokens: 450,
      cacheTotalInputTokens: 1644, cacheHitRate: 450 / 1644, measuredAttempts: 4, unmeasuredAttempts: 1 });
    expect(readInterviewContextUsage(interview, models, "interviewer"))
      .toMatchObject({ totalInputTokens: 1764, latestInputTokens: 100,
        latestContextWindowTokens: 272_000, measuredInputAttempts: 5, partialInputAttempts: 1 });
  });
});
