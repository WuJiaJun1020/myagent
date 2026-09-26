import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InterviewCallTrace, InterviewChatModelInfo, InterviewSession } from "../../../shared/contracts/interview";
import { InterviewAgentUsage, InterviewUsageSummary } from "./InterviewAgentUsage";

const models: InterviewChatModelInfo["availableModels"] = [
  { providerId: "openai-codex", modelId: "gpt-6-luna", name: "GPT-6 Luna",
    reasoningLevels: ["medium"], contextWindowTokens: 272_000 },
];

function trace(actor: "interviewer" | "candidate" | "director", input: number, cache: number): InterviewCallTrace {
  const now = "2026-09-25T00:00:00.000Z";
  return { actor, operationId: `${actor}-${input}`, status: "succeeded", startedAt: now, finishedAt: now,
    requestedModel: { providerId: "openai-codex", modelId: "gpt-6-luna" }, reasoning: "low", timeoutMs: 180_000,
    messages: [], attempts: [{ providerId: "openai-codex", modelId: "gpt-6-luna", startedAt: now,
      finishedAt: now, usage: { inputTokens: input, cachedInputTokens: cache } }] };
}

describe("InterviewAgentUsage", () => {
  it("keeps all three agents' actual context and cache usage separate", () => {
    const now = "2026-09-25T00:00:00.000Z";
    const session: InterviewSession = { interview: { id: "usage-panel", title: "测试面试", candidateName: "林澈",
      positionTitle: "Agent 工程师", status: "interviewing", currentQuestionIndex: 0, questionCount: 20,
      directorEnabled: true, competencies: [], createdAt: now, updatedAt: now, documents: [] },
    plan: null, currentQuestion: null, answeredCount: 1, preparationError: null,
    turns: [{ id: "question", ordinal: 0, role: "interviewer", content: "请介绍项目。", createdAt: now,
      trace: trace("interviewer", 300, 100) },
    { id: "question-2", ordinal: 2, role: "interviewer", content: "请谈谈设计。", createdAt: now,
      trace: trace("interviewer", 120, 80) }],
    debugEvents: [
      { id: "candidate", ordinal: 1, createdAt: now, trace: trace("candidate", 200, 0) },
      { id: "director", ordinal: 2, createdAt: now, trace: trace("director", 250, 50) },
    ] };
    const html = renderToStaticMarkup(<>
      <InterviewAgentUsage session={session} actor="interviewer" models={models} />
      <InterviewAgentUsage session={session} actor="director" models={models} />
      <InterviewAgentUsage session={session} actor="candidate" models={models} />
      <InterviewUsageSummary session={session} models={models} />
    </>);
    expect(html.match(/class="interview-agent-usage"/g)).toHaveLength(4);
    expect(html.match(/本场缓存命中率/g)).toHaveLength(3);
    expect(html).toContain("整场缓存命中率");
    expect(html).toContain("本场累计输入</span><strong>600<em> tokens</em>");
    expect(html).toContain("最新一轮完整上下文</span><strong>200<em> / 272,000</em>");
    expect(html).toContain("整场累计输入</span><strong>1,100<em> tokens</em>");
    expect(html).toContain("30.0%");
    expect(html).toContain("16.7%");
    expect(html).toContain("0.0%");
    expect(html).toContain("整场缓存命中率</span><strong>20.9%");
  });
});
