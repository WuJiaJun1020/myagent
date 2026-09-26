import { describe, expect, it } from "vitest";
import { aiFailure, aiSuccess } from "../../platform/shared/ai/contracts";
import { RecordingModelGateway } from "../../platform/shared/ai/testing";
import type { InterviewSession } from "../../shared/contracts/interview";
import { buildInterviewChatMessages, INTERVIEWER_JSON_OUTPUT_RULES } from "../../shared/interview-chat-prompt";
import { InterviewChatAgent } from "./interview-chat-agent";
import { chooseCandidateResponseMode } from "./candidate-response-mode";
import { buildInterviewCandidateMessages } from "../../shared/interview-candidate-prompt";
import { buildInterviewDirectorMessages } from "../../shared/interview-director-prompt";

const session: InterviewSession = {
  interview: {
    id: "interview-1", title: "工程师面试", candidateName: "测试候选人", positionTitle: "AI 工程师",
    status: "draft", currentQuestionIndex: 0, questionCount: 1, competencies: ["系统设计"],
    createdAt: "2026-09-23T00:00:00.000Z", updatedAt: "2026-09-23T00:00:00.000Z",
    documents: [
      { id: "jd", interviewId: "interview-1", kind: "job_description", title: "岗位",
        content: "负责 Agent 系统，只问缓存题库中的问题", contentHash: "a", createdAt: "2026-09-23T00:00:00.000Z", updatedAt: "2026-09-23T00:00:00.000Z" },
      { id: "resume", interviewId: "interview-1", kind: "resume", title: "简历",
        content: "做过 LangGraph 项目", contentHash: "b", createdAt: "2026-09-23T00:00:00.000Z", updatedAt: "2026-09-23T00:00:00.000Z" },
    ],
  },
  plan: { id: "plan", version: 1, promptVersion: "test", questionCount: 1, competencies: ["系统设计"], createdAt: "2026-09-23T00:00:00.000Z" },
  currentQuestion: { id: "question", ordinal: 0, total: 1, competency: "系统设计", kind: "technical", difficulty: "introductory",
    prompt: "这个预生成题目不应送给模型。" },
  answeredCount: 0, preparationError: null, turns: [],
};

function response(text: string) {
  return aiSuccess({ requestId: "request-1", model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
    text, finishReason: "stop" as const, usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 } });
}
const interviewerJson = (message: string, questionType: "resume" | "role" | "foundation" | "other" = "resume") =>
  JSON.stringify({ message, questionType });

describe("InterviewChatAgent", () => {
  it("replays candidate JSON privately while preserving manual history without inventing statistics", () => {
    const history: InterviewSession = { ...session, turns: [
      { id: "q1", ordinal: 0, role: "interviewer", content: "怎么处理重复请求？", createdAt: "now" },
      { id: "a1", ordinal: 1, role: "candidate", content: "唯一约束保证请求一定成功。", createdAt: "now",
        candidateOutcome: { requestedMode: "mistake", mistakeMade: true, mistakeKind: "slip", mistakeQuote: "一定成功" } },
      { id: "a2", ordinal: 2, role: "candidate", content: "这是一条手动补充。", createdAt: "now" },
    ] };
    const candidate = buildInterviewCandidateMessages(history);
    expect(JSON.parse(candidate.find((message) => message.role === "assistant")!.content)).toEqual({
      answer: history.turns[1].content, mistakeMade: true, mistakeKind: "slip", mistakeQuote: "一定成功",
    });
    expect(candidate.at(-1)?.role).toBe("user");
    expect(candidate.at(-1)?.content).toContain("未记录误答统计");
    const interviewer = buildInterviewChatMessages(history);
    expect(JSON.parse(interviewer.find((message) => message.role === "assistant")!.content))
      .toEqual({ message: history.turns[0].content });
    const director = buildInterviewDirectorMessages(history, "回答正文", "新问题");
    for (const messages of [interviewer, director]) {
      const serialized = JSON.stringify(messages);
      expect(serialized).toContain(history.turns[1].content);
      expect(serialized).not.toMatch(/mistakeMade|mistakeKind|mistakeQuote|requestedMode/);
    }
  });

  it("repairs prose into interviewer JSON and exposes only message as the visible reply", async () => {
    const outputs = ["请讲一个项目。", interviewerJson("请讲一个项目。")];
    const gateway = new RecordingModelGateway(() => response(outputs.shift()!));
    const result = await new InterviewChatAgent(gateway).respond(session, undefined, "repair-interviewer");
    expect(result.text).toBe("请讲一个项目。");
    expect(JSON.parse(result.trace.outputText!)).toEqual({ message: result.text, questionType: "resume" });
    expect(result.questionType).toBe("resume");
    expect(gateway.generateRequests[0].responseFormat).toMatchObject({ schemaName: "interview_message_v2" });
    expect(gateway.generateRequests[1].messages[0]).toEqual(gateway.generateRequests[0].messages[0]);
    expect(gateway.generateRequests[1].messages.at(-1)?.content).toContain('"previousOutput":"请讲一个项目。"');
  });

  it("accepts other for a message without a new question and repairs unknown types", async () => {
    const outputs = [JSON.stringify({ message: "感谢你的分享。", questionType: "misc" }),
      interviewerJson("感谢你的分享。", "other")];
    const gateway = new RecordingModelGateway(() => response(outputs.shift()!));
    const result = await new InterviewChatAgent(gateway).respond(session, undefined, "other-message");
    expect(result).toMatchObject({ text: "感谢你的分享。", questionType: "other" });
    expect(gateway.generateRequests).toHaveLength(2);
    expect(result.trace.attempts[0].error?.code).toBe("invalid_json_output");
  });

  it("tells the candidate the exact conflicting mistake kind on repair", async () => {
    const decision = { mode: "mistake", errorKind: "slip" } as const;
    let calls = 0;
    const gateway = new RecordingModelGateway(() => response(JSON.stringify({
      answer: "唯一约束保证一定成功。", mistakeMade: true,
      mistakeKind: ++calls === 1 ? "misconception" : "slip", mistakeQuote: "一定成功",
    })));
    const result = await new InterviewChatAgent(gateway).respondAsCandidate(session, "repair-kind", {
      decision: { ...chooseCandidateResponseMode("q", 100, 0), ...decision },
    });
    expect(result.report.mistakeKind).toBe("slip");
    expect(gateway.generateRequests[1].messages.at(-1)?.content).toContain("mistakeKind 必须为 slip");
    expect(gateway.generateRequests[1].messages.at(-1)?.content).toContain("previousOutput");
  });

  it("builds complete messages without truncating the resume or conversation", () => {
    const messages = buildInterviewChatMessages(session);
    expect(messages.map((message) => message.role)).toEqual(["system", "user", "user"]);
    expect(buildInterviewChatMessages(session, "候选人回答").at(-1))
      .toEqual({ role: "user", content: "候选人回答" });
    const longResume = "简历内容".repeat(7_000);
    const longHistory = "回答内容".repeat(1_000);
    const history: InterviewSession = { ...session,
      interview: { ...session.interview, documents: session.interview.documents.map((document) =>
        document.kind === "resume" ? { ...document, content: longResume } : document) },
      turns: Array.from({ length: 20 }, (_, index) => ({ id: `turn-${index}`, ordinal: index,
        role: index % 2 === 0 ? "interviewer" as const : "candidate" as const,
        content: longHistory, createdAt: "2026-09-23T00:00:00.000Z" })) };
    const complete = buildInterviewChatMessages(history);
    expect(complete).toHaveLength(23);
    expect(complete[1].content).toContain("目标岗位资料");
    expect(complete[1].content).toContain("面试登记目标岗位：AI 工程师");
    expect(complete[2].content).toContain(longResume);
    expect(complete[2].content).toContain("面试登记姓名：测试候选人");
    expect(complete.at(-1)?.content).toBe(longHistory);
  });
  it("sends the selected job before the resume without including pre-generated questions", async () => {
    const gateway = new RecordingModelGateway(() => response(interviewerJson("你好，请介绍你做过的 LangGraph 项目。")));
    const agent = new InterviewChatAgent(gateway);
    const result = await agent.respond(session, undefined, "op-1");
    expect(result.text).toContain("LangGraph 项目");
    expect(gateway.generateRequests).toHaveLength(1);
    expect(gateway.generateRequests[0]).toMatchObject({ model: { providerId: "openai-codex", modelId: "gpt-6-luna" }, reasoning: "medium" });
    expect(gateway.generateRequests[0].metadata?.budget?.maxInputTokens).toBeUndefined();
    expect(result.trace.maxInputTokens).toBeUndefined();
    expect(gateway.generateRequests[0].messages.map((message) => message.role)).toEqual(["system", "user", "user"]);
    expect(result.trace.messages.map((message) => message.kind)).toEqual(["system_prompt", "job_description", "resume"]);
    expect(gateway.generateRequests[0].messages[0].content)
      .toContain("【本轮控制：开场】\n先自然地向候选人打招呼，称呼其姓名，并说明本次面试的目标岗位。");
    expect(result.trace.messages.map((message) => ({ role: message.role, content: message.content })))
      .toEqual(gateway.generateRequests[0].messages);
    expect(result.trace.attempts).toMatchObject([{ requestId: "request-1", usage: { totalTokens: 140 } }]);
    expect(result.trace.status).toBe("succeeded");
    const prompt = gateway.generateRequests[0].messages.map((message) => message.content).join("\n");
    expect(prompt).toContain("做过 LangGraph 项目");
    expect(gateway.generateRequests[0].messages[1].content).toContain("只问缓存题库中的问题");
    expect(gateway.generateRequests[0].messages[0].content).toContain("优先寻找岗位要求与简历具体经历的交集");
    expect(gateway.generateRequests[0].messages[0].content).toContain("每轮只提出一个核心问题");
    expect(prompt).not.toContain("这个预生成题目不应送给模型");
  });

  it("uses the previous conversation for follow-up in one model call", async () => {
    const gateway = new RecordingModelGateway(() => response(interviewerJson("你当时如何管理状态？")));
    const agent = new InterviewChatAgent(gateway);
    const history: InterviewSession = { ...session, turns: [{ id: "turn-1", ordinal: 0, role: "interviewer",
      content: "请介绍这个项目。", createdAt: "2026-09-23T00:00:00.000Z" }] };
    const result = await agent.respond(history, "负责状态管理", "op-2");
    expect(result.text).toContain("状态");
    expect(result.trace.messages.map((message) => message.kind)).toEqual(["system_prompt", "job_description", "resume", "history", "candidate_message"]);
    expect(gateway.generateRequests[0].messages.map((message) => message.role)).toEqual(["system", "user", "user", "assistant", "user"]);
    expect(gateway.generateRequests[0].messages[0].content).toContain("【本轮控制：续谈】");
    expect(gateway.generateRequests[0].messages.at(-1)?.content).toBe("负责状态管理");
    expect(gateway.generateRequests).toHaveLength(1);
    expect(gateway.generateRequests[0].messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "assistant", content: JSON.stringify({ message: "请介绍这个项目。" }) }),
    ]));
  });

  it("keeps the system prefix stable and appends changing topic guidance after the candidate answer", () => {
    const withDirector: InterviewSession = { ...session, interview: { ...session.interview, directorEnabled: true },
      answeredCount: 1, topicFlow: { version: 1, foundationNeed: "needed", coverage: [],
        pendingRoleAbilities: [{ label: "可靠性" }],
        blocks: [{ id: "block-1", source: "resume", anchor: "LangGraph 项目", objective: "厘清个人贡献",
          questionRounds: [1, 2], evidenceCount: 1, noNewEvidenceStreak: 0, status: "active" }] } };
    const messages = buildInterviewChatMessages(withDirector, "候选人本轮回答", {
      systemPrompt: "用户自定义面试官规则", startInstruction: "自定义开场", replyInstruction: "自定义续谈" });
    expect(messages[0]).toMatchObject({ role: "system" });
    expect(messages[0].content).toContain("用户自定义面试官规则\n\n自定义续谈");
    expect(messages[0].content).not.toContain("话题：LangGraph 项目");
    expect(messages[0].content).toContain("【程序记录的使用规则】");
    expect(messages.at(-2)).toEqual({ role: "user", content: "候选人本轮回答" });
    expect(messages.at(-1)?.content).toContain("话题：LangGraph 项目");
    expect(messages.at(-1)?.content).toContain("待考察方向（此前记录）：可靠性");
    expect(messages.at(-1)?.content).toContain("历史问答：已完成第 2 轮");
    expect(messages.at(-1)?.content).toContain("话题与考察记录：已更新至第 1 轮回答");
    expect(messages.at(-1)?.content).toContain("生成第 3 轮的面试官发言");
    const opening = buildInterviewChatMessages({ ...withDirector, answeredCount: 0, topicFlow: undefined });
    expect(opening.at(-1)?.content).toContain("历史问答：尚无完整问答");
    expect(opening.at(-1)?.content).toContain("生成第 1 轮的面试官发言");
    const closing = buildInterviewChatMessages({ ...withDirector, answeredCount: 19 }, "最后一轮回答");
    expect(closing.at(-1)?.content).toContain("生成面试收尾发言");
    expect(closing.at(-1)?.content).not.toContain("第 21 轮");
    const later = buildInterviewChatMessages({ ...withDirector, answeredCount: 2,
      topicFlow: { ...withDirector.topicFlow!, blocks: [{ ...withDirector.topicFlow!.blocks[0],
        anchor: "另一项目" }] } }, "另一轮回答", {
      systemPrompt: "用户自定义面试官规则", startInstruction: "自定义开场", replyInstruction: "自定义续谈" });
    expect(later.slice(0, 3)).toEqual(messages.slice(0, 3));
    expect(later.at(-1)?.content).toContain("另一项目");
    expect(later.at(-1)?.content).not.toEqual(messages.at(-1)?.content);
  });

  it("labels trailing topic and rewrite controls separately in the call trace", async () => {
    const gateway = new RecordingModelGateway(() => response(interviewerJson("请继续介绍。")));
    const withDirector: InterviewSession = { ...session,
      interview: { ...session.interview, directorEnabled: true }, answeredCount: 1 };
    const result = await new InterviewChatAgent(gateway).respond(withDirector, "我负责状态管理。", "rewrite", {
      additionalControl: "【面试导演控制：换方向】请改问新话题。",
    });
    expect(result.trace.messages.map((message) => message.kind)).toEqual([
      "system_prompt", "job_description", "resume", "candidate_message", "topic_control", "instruction",
    ]);
    expect(result.trace.messages[0].content).not.toContain("面试导演控制");
    expect(result.trace.messages.at(-1)?.content).toContain("面试导演控制");
    expect(gateway.generateRequests[0].metadata.cacheSessionId).toMatch(/^interview:interviewer:[a-f0-9]{24}$/u);
  });

  it("runs the simulated candidate with an independent prompt and reversed conversation roles", async () => {
    const gateway = new RecordingModelGateway(() => response(JSON.stringify({ answer: "我负责工作流中的权限校验。",
      mistakeMade: false, mistakeKind: "none", mistakeQuote: "" })));
    const agent = new InterviewChatAgent(gateway);
    const history: InterviewSession = { ...session, turns: [
      { id: "turn-1", ordinal: 1, role: "interviewer", content: "你负责什么？", createdAt: "2026-09-23T00:00:00.000Z" },
      { id: "turn-2", ordinal: 2, role: "candidate", content: "负责后端。", createdAt: "2026-09-23T00:00:00.000Z" },
      { id: "turn-3", ordinal: 3, role: "interviewer", content: "具体做了什么？", createdAt: "2026-09-23T00:00:00.000Z" },
    ] };
    const result = await agent.respondAsCandidate(history, "candidate-op", { prompt: "只按简历回答。", settings: { reasoning: "low" },
      decision: chooseCandidateResponseMode("turn-3", 0, 0) });
    expect(result.trace.actor).toBe("candidate");
    expect(result.trace.messages.map((message) => message.role)).toEqual(["system", "user", "user", "user", "user", "user", "user"]);
    expect(result.trace.messages[0].content).toContain("只按简历回答。");
    expect(result.trace.messages[0].content).toContain("【固定输出协议】");
    expect(result.trace.messages.at(-2)?.content).toBe("具体做了什么？");
    expect(result.trace.messages.at(-1)?.kind).toBe("candidate_control");
    expect(result.trace.messages.at(-1)?.content).toContain('"mode":"normal"');
    expect(gateway.generateRequests[0].reasoning).toBe("low");
    expect(result.text).toContain("权限校验");
    expect(result.report.mistakeMade).toBe(false);
    expect(result.trace.outputText).toContain('"answer"');
    expect(gateway.generateRequests[0].responseFormat).toMatchObject({ type: "json", schemaName: "interview_candidate_answer_v1" });
  });

  it("keeps the candidate system prefix stable across normal and mistake modes", async () => {
    const gateway = new RecordingModelGateway((request) => response(JSON.stringify(request.messages.at(-1)?.content.includes('"mode":"mistake"')
      ? { answer: "我认为重复提交不需要幂等保护。", mistakeMade: true,
        mistakeKind: "misconception", mistakeQuote: "不需要幂等保护" }
      : { answer: "我会先核验请求。", mistakeMade: false, mistakeKind: "none", mistakeQuote: "" })));
    const agent = new InterviewChatAgent(gateway);
    const history: InterviewSession = { ...session, turns: [{ id: "q1", ordinal: 0, role: "interviewer",
      content: "重复提交怎么处理？", createdAt: "2026-09-23T00:00:00.000Z" }] };
    const normal = await agent.respondAsCandidate(history, "normal", { prompt: "自定义候选人规则", decision: chooseCandidateResponseMode("q1", 0, 0) });
    const mistake = await agent.respondAsCandidate(history, "mistake", { prompt: "自定义候选人规则", decision: chooseCandidateResponseMode("q1", 100, 0) });
    expect(gateway.generateRequests[0].messages[0].content).toBe(gateway.generateRequests[1].messages[0].content);
    expect(gateway.generateRequests[0].messages.slice(0, -1)).toEqual(gateway.generateRequests[1].messages.slice(0, -1));
    expect(gateway.generateRequests[0].messages.at(-1)?.content).not.toBe(gateway.generateRequests[1].messages.at(-1)?.content);
    expect(normal.report.mistakeMade).toBe(false);
    expect(mistake.report.mistakeMade).toBe(true);
    expect(mistake.trace.candidateOutcome).toMatchObject({ requestedMode: "mistake", mistakeMade: true });
  });

  it("repairs invalid candidate JSON without changing the system prompt", async () => {
    let calls = 0;
    const gateway = new RecordingModelGateway(() => response(++calls === 1 ? "not json"
      : JSON.stringify({ answer: "我会先核验请求。", mistakeMade: false, mistakeKind: "none", mistakeQuote: "" })));
    const agent = new InterviewChatAgent(gateway);
    const history: InterviewSession = { ...session, turns: [{ id: "q1", ordinal: 0, role: "interviewer",
      content: "重复提交怎么处理？", createdAt: "2026-09-23T00:00:00.000Z" }] };
    const result = await agent.respondAsCandidate(history, "candidate-repair", { decision: chooseCandidateResponseMode("q1", 0, 0) });
    expect(result.text).toBe("我会先核验请求。");
    expect(gateway.generateRequests).toHaveLength(2);
    expect(gateway.generateRequests[0].messages[0].content).toBe(gateway.generateRequests[1].messages[0].content);
    expect(gateway.generateRequests[1].messages.at(-1)?.content).toContain("程序格式修复");
    expect(result.trace.attempts[0].error?.code).toBe("invalid_json_output");
  });

  it("falls back to the OpenAI API route only when the default Codex route is not configured", async () => {
    const gateway = new RecordingModelGateway((request) => request.model?.providerId === "openai-codex"
      ? aiFailure({ code: "not_configured", message: "missing", retryable: false })
      : aiSuccess({ requestId: "request-1", model: { providerId: "openai", modelId: "gpt-6-luna" },
        text: interviewerJson("你好。", "other"), finishReason: "stop", usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 } }));
    const agent = new InterviewChatAgent(gateway);
    const result = await agent.respond(session, undefined, "op-3");
    expect(result.text).toBe("你好。");
    expect(gateway.generateRequests.map((request) => request.model?.providerId)).toEqual(["openai-codex", "openai"]);
    expect(result.trace.attempts).toMatchObject([
      { providerId: "openai-codex", error: { code: "not_configured" } },
      { providerId: "openai", requestId: "request-1" },
    ]);
  });

  it("passes the selected Pi model and reasoning level through without changing routes", async () => {
    const gateway = Object.assign(new RecordingModelGateway(() => response(interviewerJson("请介绍你的项目。"))), {
      getAvailableModels: async () => [{ providerId: "deepseek", modelId: "deepseek-reasoner", name: "DeepSeek Reasoner",
        reasoningLevels: ["high" as const] }],
    });
    const agent = new InterviewChatAgent(gateway);
    await agent.respond(session, undefined, "op-custom", {
      settings: { model: { providerId: "deepseek", modelId: "deepseek-reasoner" }, reasoning: "high" },
    });
    expect(gateway.generateRequests[0]).toMatchObject({ model: { providerId: "deepseek", modelId: "deepseek-reasoner" }, reasoning: "high" });
  });

  it("sends edited prompts as the effective system message and records the same text in the trace", async () => {
    const gateway = new RecordingModelGateway(() => response(interviewerJson("请介绍项目中的一次技术取舍。")));
    const agent = new InterviewChatAgent(gateway);
    const prompts = {
      systemPrompt: "自定义面试官规则第一条。\n自定义面试官规则第二条。",
      startInstruction: "请先问项目取舍。",
      replyInstruction: "请根据回答继续追问。",
    };
    const opening = await agent.respond(session, undefined, "op-edited-start", { prompts });
    expect(gateway.generateRequests[0].messages[0].content)
      .toBe(`自定义面试官规则第一条。\n自定义面试官规则第二条。\n\n请先问项目取舍。\n\n${INTERVIEWER_JSON_OUTPUT_RULES}`);
    expect(opening.trace.messages[0].content).toBe(gateway.generateRequests[0].messages[0].content);

    const reply = await agent.respond(session, "我选择了状态图。", "op-edited-reply", { prompts });
    expect(gateway.generateRequests[1].messages[0].content)
      .toBe(`自定义面试官规则第一条。\n自定义面试官规则第二条。\n\n请根据回答继续追问。\n\n${INTERVIEWER_JSON_OUTPUT_RULES}`);
    expect(reply.trace.messages[0].content).toBe(gateway.generateRequests[1].messages[0].content);
  });

  it("rejects an unsupported reasoning level before sending the resume", async () => {
    const gateway = Object.assign(new RecordingModelGateway(), {
      getAvailableModels: async () => [{ providerId: "test", modelId: "plain", name: "Plain", reasoningLevels: [] }],
    });
    await expect(new InterviewChatAgent(gateway).respond(session, undefined, "op-invalid", {
      settings: { model: { providerId: "test", modelId: "plain" }, reasoning: "high" },
    })).rejects.toThrow("不支持该思考程度");
    expect(gateway.generateRequests).toHaveLength(0);
  });

  it("does not substitute another provider for an explicitly selected model", async () => {
    const gateway = new RecordingModelGateway(() => aiFailure({ code: "not_configured", message: "missing", retryable: false }));
    const traces: Array<{ status: string; attempts: unknown[] }> = [];
    await expect(new InterviewChatAgent(gateway).respond(session, undefined, "op-no-fallback", {
      settings: { model: { providerId: "openai-codex", modelId: "gpt-6-luna" }, reasoning: "default" },
      onTrace: (trace) => traces.push(trace),
    })).rejects.toThrow("模型调用失败");
    expect(gateway.generateRequests).toHaveLength(1);
    expect(gateway.generateRequests[0].reasoning).toBeUndefined();
    expect(traces).toMatchObject([{ status: "failed", attempts: [{ error: { code: "not_configured" } }] }]);
  });
});
