import { describe, expect, it } from "vitest";
import type { InterviewCallTrace, InterviewSession } from "../../shared/contracts/interview";
import { aiSuccess } from "../../platform/shared/ai/contracts";
import { RecordingModelGateway } from "../../platform/shared/ai/testing";
import { InterviewScoreAgent, parseInterviewScore } from "./interview-score-agent";

const session = { turns: [
  { id: "answer-1", role: "candidate", content: "我先定位慢查询，再增加索引，并用压测确认延迟下降。",
    candidateOutcome: { requestedMode: "mistake", mistakeMade: false, mistakeKind: "none", mistakeQuote: "" } },
  { id: "question-2", role: "interviewer", content: "系统性能如何？" },
] } as InterviewSession;

function output(score: number | null = 30, quote = "我先定位慢查询"): string {
  return JSON.stringify({ dimensions: [
    { key: "technical", score, reason: "能够解释技术选择", evidence: score === null ? [] : [{ turnId: "answer-1", quote }] },
    { key: "practice", score: 35, reason: "说明了定位和验证过程", evidence: [{ turnId: "answer-1", quote: "并用压测确认延迟下降" }] },
    { key: "communication", score: 12, reason: "回答清晰", evidence: [{ turnId: "answer-1", quote: "我先定位慢查询" }] },
  ] });
}

describe("parseInterviewScore", () => {
  it("accepts in-range scores backed by exact candidate-answer excerpts", () => {
    expect(parseInterviewScore(output(), session)).toMatchObject([
      { key: "technical", score: 30, evidence: [{ turnId: "answer-1", quote: "我先定位慢查询" }] },
      { key: "practice", score: 35 }, { key: "communication", score: 12 },
    ]);
    expect(parseInterviewScore(output(null), session)[0]).toMatchObject({ score: null, evidence: [] });
  });

  it("rejects out-of-range scores and invented or interviewer-only quotations", () => {
    expect(() => parseInterviewScore(output(41), session)).toThrow("超出范围");
    expect(() => parseInterviewScore(output(30, "我优化了整个系统"), session)).toThrow("不匹配");
    expect(() => parseInterviewScore(output(30, "系统性能如何？"), session)).toThrow("不匹配");
  });

  it("rejects duplicate dimensions or missing evidence for a numeric score", () => {
    const noEvidence = JSON.parse(output()) as { dimensions: Array<{ key: string; evidence: unknown[] }> };
    noEvidence.dimensions[0]!.evidence = [];
    expect(() => parseInterviewScore(JSON.stringify(noEvidence), session)).toThrow("引用数量无效");
    const duplicate = JSON.parse(output()) as { dimensions: Array<{ key: string }> };
    duplicate.dimensions[0]!.key = "practice";
    expect(() => parseInterviewScore(JSON.stringify(duplicate), session)).toThrow("重复或未知");
  });
});

describe("InterviewScoreAgent", () => {
  it("records the exact request and provider output even when JSON validation fails", async () => {
    const gateway = new RecordingModelGateway(() => aiSuccess({ requestId: "invalid-score",
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" }, text: "not JSON",
      finishReason: "stop", usage: { inputTokens: 55, outputTokens: 3, totalTokens: 58 } }));
    const agent = new InterviewScoreAgent(gateway);
    const fullSession = { ...session, interview: { positionTitle: "Agent 工程师", documents: [
      { kind: "job_description", content: "开发 Agent" }, { kind: "resume", content: "维护过 Agent" },
    ] } } as InterviewSession;
    let trace: InterviewCallTrace | undefined;
    await expect(agent.score(fullSession, "score-invalid", { reasoning: "medium" }, "评分规则", undefined,
      (value) => { trace = value; })).rejects.toThrow();
    expect(trace).toMatchObject({ actor: "score", status: "failed", outputText: "not JSON",
      messages: [{ kind: "system_prompt", content: "评分规则" }, { kind: "score_material" }],
      attempts: expect.arrayContaining([expect.objectContaining({ requestId: "invalid-score",
        usage: expect.objectContaining({ inputTokens: 55, outputTokens: 3 }),
        error: expect.objectContaining({ code: "invalid_json_output" }) })]) });
    expect(trace?.attempts).toHaveLength(4);
    expect(gateway.generateRequests[1]?.messages.at(-1)?.content).toContain("程序格式修复");
    expect(trace?.messages[1].content).toContain("开发 Agent");
    expect(trace?.messages[1].content).toContain("维护过 Agent");
  });

  it("accepts the first valid repaired JSON and preserves the failed attempt", async () => {
    let calls = 0;
    const gateway = new RecordingModelGateway(() => aiSuccess({ requestId: `score-${++calls}`,
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" }, text: calls === 1 ? `${output()} {}` : output(),
      finishReason: "stop", usage: { inputTokens: 55, outputTokens: 70, totalTokens: 125 } }));
    const agent = new InterviewScoreAgent(gateway);
    const fullSession = { ...session, interview: { positionTitle: "Agent 工程师", documents: [] } } as unknown as InterviewSession;
    let trace: InterviewCallTrace | undefined;
    const result = await agent.score(fullSession, "score-repaired", { reasoning: "medium" }, "评分规则", undefined,
      (value) => { trace = value; });
    expect(result.dimensions).toHaveLength(3);
    expect(gateway.generateRequests).toHaveLength(2);
    expect(gateway.generateRequests[0].responseFormat).toMatchObject({ type: "json", schemaName: "interview_score_v1" });
    expect(gateway.generateRequests[0].messages[1].content).not.toMatch(/mistakeMade|mistakeKind|mistakeQuote|requestedMode/);
    expect(trace?.attempts[0]).toMatchObject({ outputText: `${output()} {}`, error: { code: "invalid_json_output" } });
    expect(trace?.attempts[1]).toMatchObject({ requestId: "score-2", retryInstruction: expect.stringContaining("第 1/3 次重试") });
  });
});
