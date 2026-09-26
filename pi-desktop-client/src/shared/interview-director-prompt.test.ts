import { describe, expect, it } from "vitest";
import type { InterviewSession } from "./contracts/interview";
import { buildInterviewDirectorMessages, DEFAULT_INTERVIEW_DIRECTOR_PROMPT } from "./interview-director-prompt";

describe("buildInterviewDirectorMessages", () => {
  it("numbers actual question-answer rounds instead of individual messages", () => {
    const now = "2026-09-25T00:00:00.000Z";
    const session: InterviewSession = {
      interview: { id: "one", title: "测试", candidateName: "候选人", positionTitle: "工程师",
        status: "interviewing", currentQuestionIndex: 0, questionCount: 20, competencies: [],
        createdAt: now, updatedAt: now, documents: [] },
      plan: null, currentQuestion: null, answeredCount: 1, preparationError: null,
      turns: [
        { id: "q1", ordinal: 0, role: "interviewer", content: "请介绍项目。", createdAt: now },
        { id: "a1", ordinal: 1, role: "candidate", content: "我设计了工作流。", createdAt: now },
        { id: "q2", ordinal: 2, role: "interviewer", content: "如何处理失败？", createdAt: now },
      ],
    };
    const messages = buildInterviewDirectorMessages(session, "失败时重试。", "你如何设置重试次数？");
    expect(messages).toHaveLength(5);
    expect(messages[3].content).toContain("第 1 轮（问题 ID：q1）\n面试官：请介绍项目。\n候选人：我设计了工作流。");
    expect(messages[3].content).toContain("第 2 轮（问题 ID：q2）\n面试官：如何处理失败？\n候选人：失败时重试。");
    expect(messages[3].content).not.toContain("3. 面试官");
    expect(messages[3].content).not.toContain("本轮回答见下一条消息");
    expect(messages[4].content).toContain("待审对象：第 3 轮面试官发言草稿；尚未发送给候选人");
    expect(messages[4].content).toContain("历史问答：已完成第 2 轮");
    expect(messages[4].content).toContain("最新候选人回答：见历史会话第 2 轮");
    expect(messages[4].content).toContain("【待审草稿原文】\n你如何设置重试次数？");
    expect(messages[4].content).not.toContain("失败时重试。");
    expect(messages[0].content).toContain("【程序记录的使用规则】");
    expect(DEFAULT_INTERVIEW_DIRECTOR_PROMPT).toContain("不得仅因同一项目被连续提及两三轮就要求换题");
    const custom = buildInterviewDirectorMessages(session, "失败时重试。", "换到数据库事务？", "自定义导演提示词");
    expect(custom[0].content).toContain("自定义导演提示词\n\n【程序输出协议：话题段落】");
    expect(custom[0].content).toContain("roleGaps");
  });
});
