import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InterviewCallTrace, InterviewSession } from "../../../shared/contracts/interview";
import { InterviewConversation } from "./InterviewConversation";
import { buildInterviewCallGroups } from "./interview-call-groups";

const session: InterviewSession = {
  interview: {
    id: "interview-1", title: "后端工程师面试", candidateName: "测试候选人", positionTitle: "后端工程师",
    status: "draft", currentQuestionIndex: 0, questionCount: 3, competencies: ["系统设计", "项目经验"],
    createdAt: "2026-09-23T00:00:00.000Z", updatedAt: "2026-09-23T00:00:00.000Z",
    documents: [],
  },
  plan: null,
  currentQuestion: null,
  answeredCount: 0,
  preparationError: null,
  turns: [],
};

describe("InterviewConversation", () => {
  it("keeps the composer focused on answering and candidate-agent actions", () => {
    const html = renderToStaticMarkup(<InterviewConversation session={session} />);
    expect(html).not.toContain("interview-conversation-model-tag");
    expect(html).not.toContain("composer-model-trigger");
    expect(html).not.toContain("模拟候选人 · GPT-6 Luna");
    expect(html).not.toContain("Enter 发送 · Shift + Enter 换行");
    expect(html).not.toContain("interview-conversation-disclaimer");
    expect(html).not.toContain("interview-context-usage");
    expect(html).not.toContain("composer-thinking-label");
    expect(html).not.toContain("有效上限 96,000 tokens");
    expect(html).not.toContain("根据简历自然追问");
    expect(html).not.toContain("对话保存在本机；岗位资料、简历与对话会发送给模型");
    expect(html).not.toContain("同意将本场简历与对话发送给当前模型 Provider");
    expect(html).toContain("结束面试");
    expect(html).not.toContain("允许通过 Bing 搜索公开技术信息");
    expect(html).not.toContain("查看题库");
    expect(html).toContain("重试开场");
    expect(html).toContain("代答一轮");
    expect(html).toContain("连续代答");
    expect(html).toContain("导出会话");
  });

  it("shows a saved simulated answer and a retry action while interviewer reply is pending", () => {
    const html = renderToStaticMarkup(<InterviewConversation session={{ ...session,
      interview: { ...session.interview, status: "interviewing" }, answeredCount: 1,
      turns: [
        { id: "question", ordinal: 0, role: "interviewer", content: "介绍项目。",
          createdAt: "2026-09-23T00:00:00.000Z" },
        { id: "answer", ordinal: 1, role: "candidate", source: "agent", content: "我负责状态管理。",
          createdAt: "2026-09-23T00:00:01.000Z" },
      ],
    }} />);
    expect(html).toContain("我负责状态管理。");
    expect(html).toContain("重试面试官回复");
    expect(html).not.toContain("连续代答");
  });

  it("keeps the default transcript focused on dialogue while retaining trace access", () => {
    const trace: InterviewCallTrace = {
      operationId: "test-call", status: "succeeded", startedAt: "2026-09-23T00:00:00.000Z",
      finishedAt: "2026-09-23T00:00:01.000Z", requestedModel: { providerId: "openai-codex", modelId: "gpt-6-luna" },
      reasoning: "medium", timeoutMs: 180000,
      messages: [{ kind: "system_prompt", role: "system", content: "请根据简历提问" },
        { kind: "job_description", role: "user", content: "目标岗位：后端工程师" },
        { kind: "resume", role: "user", content: "虚构测试简历" },
        { kind: "instruction", role: "user", content: "请开始面试" }],
      attempts: [{ providerId: "openai-codex", modelId: "gpt-6-luna", startedAt: "2026-09-23T00:00:00.000Z",
        finishedAt: "2026-09-23T00:00:01.000Z", requestId: "provider-request-1" }],
      outputText: "请介绍项目。",
    };
    const withCalls: InterviewSession = { ...session,
      turns: [{ id: "turn-1", ordinal: 0, role: "interviewer", content: "请介绍项目。",
        createdAt: trace.finishedAt, trace }],
      debugEvents: [{ id: "failure-1", ordinal: 1, createdAt: trace.finishedAt,
        trace: { ...trace, operationId: "failed-call", status: "failed", outputText: undefined,
          error: { code: "timeout", message: "调用超时" } } }],
    };
    const html = renderToStaticMarkup(<InterviewConversation session={withCalls} />);
    expect(html).toContain("请介绍项目。");
    expect(html).toContain("查看第 1 轮（待回答）调用详情");
    expect(html).toContain("有未完成的调用失败记录");
    expect(html).not.toContain("interview-debug-event");
    expect(html).not.toContain("interview-call-trace");
    expect(html).not.toContain("请根据简历提问");
    expect(html).not.toContain("虚构测试简历");
    expect(buildInterviewCallGroups(withCalls)[0].entries[0].trace.messages[0].content).toBe("请根据简历提问");
  });

  it("keeps completed transcripts readable without an active composer", () => {
    const html = renderToStaticMarkup(<InterviewConversation session={{ ...session,
      interview: { ...session.interview, status: "completed" },
      turns: [{ id: "turn-1", ordinal: 0, role: "interviewer", content: "介绍你的项目。",
        createdAt: "2026-09-23T00:00:00.000Z" }],
    }} />);
    expect(html).toContain("介绍你的项目。");
    expect(html).toContain("本场面试已结束");
    expect(html).not.toContain("<form class=\"interview-conversation-composer\"");
    expect(html).not.toContain("结束面试</button>");
    expect(html).toContain("导出会话");
  });

  it("shows accepted message types without treating legacy turns as other", () => {
    const html = renderToStaticMarkup(<InterviewConversation session={{ ...session, turns: [
      { id: "resume", ordinal: 0, role: "interviewer", questionType: "resume", content: "介绍你的项目。",
        createdAt: "2026-09-23T00:00:00.000Z" },
      { id: "role", ordinal: 1, role: "interviewer", questionType: "role", content: "如果岗位需要呢？",
        createdAt: "2026-09-23T00:00:01.000Z" },
      { id: "other", ordinal: 2, role: "interviewer", questionType: "other", content: "感谢你的分享。",
        createdAt: "2026-09-23T00:00:02.000Z" },
      { id: "legacy", ordinal: 3, role: "interviewer", content: "旧问题", createdAt: "2026-09-23T00:00:03.000Z" },
    ] }} />);
    expect(html).toContain("经历 1 · 岗位 1 · 知识 0 · 其他 1 · 旧记录未分类 1");
    expect(html.match(/interview-question-type-badge/g)).toHaveLength(3);
  });

  it("marks only a simulated answer that actually reports an error in its visible text", () => {
    const html = renderToStaticMarkup(<InterviewConversation session={{ ...session, turns: [
      { id: "candidate-1", ordinal: 0, role: "candidate", source: "agent", content: "我会先核验请求。",
        createdAt: "2026-09-23T00:00:00.000Z", candidateOutcome: {
          requestedMode: "mistake", mistakeMade: false, mistakeKind: "none", mistakeQuote: "" } },
      { id: "candidate-2", ordinal: 1, role: "candidate", source: "agent", content: "这里不需要幂等保护。",
        createdAt: "2026-09-23T00:00:00.000Z", candidateOutcome: {
          requestedMode: "mistake", mistakeMade: true, mistakeKind: "misconception", mistakeQuote: "不需要幂等保护" } },
    ] }} />);
    expect(html.match(/interview-candidate-mistake-badge/g)).toHaveLength(1);
    expect(html).toContain("故意误答");
    expect(html).toContain("模型自报故意误答");
  });

  it("keeps scoring calls in the debug drawer without interrupting the dialogue", () => {
    const withScore: InterviewSession = { ...session,
      interview: { ...session.interview, status: "completed" },
      turns: [{ id: "candidate-1", ordinal: 0, role: "candidate", content: "我做过 Agent 服务。",
        createdAt: "2026-09-23T00:00:00.000Z" }],
      debugEvents: [{ id: "score-1", ordinal: 1, createdAt: "2026-09-23T00:00:01.000Z",
        trace: { actor: "score", operationId: "score-call", status: "succeeded",
          startedAt: "2026-09-23T00:00:00.000Z", finishedAt: "2026-09-23T00:00:01.000Z",
          requestedModel: { providerId: "openai-codex", modelId: "gpt-6-luna" }, reasoning: "medium",
          timeoutMs: 180000, messages: [{ kind: "system_prompt", role: "system", content: "独立评分规则" },
            { kind: "score_material", role: "user", content: '{"turns":[]}' }],
          attempts: [{ providerId: "openai-codex", modelId: "gpt-6-luna",
            startedAt: "2026-09-23T00:00:00.000Z", finishedAt: "2026-09-23T00:00:01.000Z" }],
          outputText: '{"dimensions":[]}', } }],
      scoreReports: [],
    };
    const html = renderToStaticMarkup(<InterviewConversation session={withScore} />);
    expect(html).toContain("调试记录");
    expect(html).toContain("我做过 Agent 服务。");
    expect(html).not.toContain("独立评分规则");
    expect(html).not.toContain("评分输入（岗位、简历与对话 JSON）");
    expect(buildInterviewCallGroups(withScore).at(-1)?.entries[0].trace.actor).toBe("score");
  });
});
