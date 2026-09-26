import { describe, expect, it } from "vitest";
import type { InterviewCallTrace, InterviewSession } from "../../../shared/contracts/interview";
import { formatInterviewTranscript } from "./interview-text-export";

describe("formatInterviewTranscript", () => {
  it("exports only dialogue in order, excluding documents and model call details", () => {
    const session: InterviewSession = {
      interview: {
        id: "i", title: "测试面试", candidateName: "林澈", positionTitle: "Agent 工程师",
        status: "interviewing", currentQuestionIndex: 0, questionCount: 10, competencies: [],
        createdAt: "2026-09-24T00:00:00Z", updatedAt: "2026-09-24T00:01:00Z",
        documents: [{ id: "d", interviewId: "i", kind: "resume", title: "简历", content: "项目经历原文", contentHash: "x",
          createdAt: "2026-09-24T00:00:00Z", updatedAt: "2026-09-24T00:00:00Z" }],
      },
      plan: null, currentQuestion: null, answeredCount: 1, preparationError: null,
      turns: [
        { id: "t2", ordinal: 2, role: "candidate", source: "agent", content: "我做了工作流。", createdAt: "2026-09-24T00:01:00Z" },
        { id: "t1", ordinal: 0, role: "interviewer", content: "请介绍你的项目。", createdAt: "2026-09-24T00:00:00Z" },
      ],
      debugEvents: [{ id: "e", ordinal: 1, createdAt: "2026-09-24T00:00:30Z", trace: {
        actor: "candidate", operationId: "op", status: "succeeded", startedAt: "2026-09-24T00:00:29Z",
        finishedAt: "2026-09-24T00:00:30Z", requestedModel: { providerId: "openai-codex", modelId: "gpt-6-luna" },
        reasoning: "low", timeoutMs: 180000, messages: [{ role: "system", kind: "system_prompt", content: "候选人规则" }],
        attempts: [], outputText: "我做了工作流。",
      } }],
    };
    const text = formatInterviewTranscript(session);
    expect(text).toBe("面试官：请介绍你的项目。\n\n模拟候选人：我做了工作流。\n");
    expect(text).not.toContain("项目经历原文");
    expect(text).not.toContain("候选人规则");
  });

  it("interleaves concise director decisions with the dialogue, but excludes other agent traces", () => {
    const now = "2026-09-24T00:00:00Z";
    const directorTrace = (operationId: string, outputText: string): InterviewCallTrace => ({
      actor: "director", operationId, status: "succeeded", startedAt: now, finishedAt: now,
      requestedModel: { providerId: "openai-codex", modelId: "gpt-6-luna" }, reasoning: "medium",
      timeoutMs: 180_000, messages: [{ role: "system", kind: "system_prompt", content: "导演内部提示词" }],
      attempts: [], outputText,
    });
    const session: InterviewSession = {
      interview: { id: "i", title: "测试面试", candidateName: "林澈", positionTitle: "Agent 工程师",
        status: "interviewing", currentQuestionIndex: 0, questionCount: 20, competencies: [],
        createdAt: now, updatedAt: now, documents: [] },
      plan: null, currentQuestion: null, answeredCount: 2, preparationError: null,
      turns: [
        { id: "t1", ordinal: 0, role: "interviewer", content: "请介绍项目。", createdAt: now },
        { id: "t2", ordinal: 1, role: "candidate", content: "我负责工作流。", createdAt: now },
        { id: "t3", ordinal: 3, role: "interviewer", content: "工作流如何恢复？", createdAt: now },
        { id: "t4", ordinal: 4, role: "candidate", content: "用检查点恢复。", createdAt: now },
        { id: "t5", ordinal: 7, role: "interviewer", content: "换到另一个项目。", createdAt: now },
      ],
      debugEvents: [
        { id: "candidate", ordinal: 2, createdAt: now, trace: { ...directorTrace("candidate", "不应导出"), actor: "candidate" } },
        { id: "pass", ordinal: 2, createdAt: now, trace: directorTrace("pass",
          JSON.stringify({ action: "pass", reason: "首次追问恢复机制", guidance: "" })) },
        { id: "redirect", ordinal: 5, createdAt: now, trace: directorTrace("redirect",
          JSON.stringify({ action: "redirect", reason: "同一项目已连续追问四轮", guidance: "转向另一项经历" })) },
        { id: "verify", ordinal: 6, createdAt: now, trace: directorTrace("reply:director-verify-1",
          JSON.stringify({ action: "pass", reason: "改写已转到另一项经历", guidance: "" })) },
      ],
    };
    const text = formatInterviewTranscript(session);
    expect(text).toBe("面试官：请介绍项目。\n\n候选人：我负责工作流。\n\n面试导演（放行）：首次追问恢复机制\n\n面试官：工作流如何恢复？\n\n候选人：用检查点恢复。\n\n面试导演（建议换话题）：同一项目已连续追问四轮\n引导：转向另一项经历\n\n面试导演复核（放行）：改写已转到另一项经历\n\n面试官：换到另一个项目。\n");
    expect(text).not.toContain("导演内部提示词");
    expect(text).not.toContain("不应导出");
  });
});
