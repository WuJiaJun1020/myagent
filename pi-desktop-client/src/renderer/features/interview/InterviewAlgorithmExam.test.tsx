import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InterviewSession } from "../../../shared/contracts/interview";
import { InterviewAlgorithmExam } from "./InterviewAlgorithmExam";

const session: InterviewSession = {
  interview: { id: "exam-1", title: "测试面试", candidateName: "测试者", positionTitle: "开发",
    status: "interviewing", currentQuestionIndex: 0, questionCount: 10, competencies: ["项目经验"],
    createdAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-24T00:00:00.000Z", documents: [] },
  plan: null, currentQuestion: null, answeredCount: 0, preparationError: null, turns: [],
  algorithm: { status: "active", startedAt: "2026-09-24T00:00:00.000Z",
    deadlineAt: "2026-09-24T00:10:00.000Z", completedAt: null, passedMode: null,
    drafts: { leetcode: "class Solution: pass", acm: "print(1)" }, attempts: [],
    problem: { slug: "two_sum", title: "两数之和", difficulty: "easy", description: "寻找两个数。",
      constraints: [], examples: [{ leetcodeInput: "[2,7], 9", output: "[0,1]", acmStdin: "2 7 9",
        acmStdout: "0 1", explanation: "" }],
      leetcode: { className: "Solution", parameters: [] },
      acm: { inputFields: [], outputType: "string", description: "" },
      templates: { leetcode: "class Solution: pass", acm: "print(1)" } } },
};

describe("InterviewAlgorithmExam", () => {
  it("shows one question and both coding modes without exposing a solution or judge cases", () => {
    const html = renderToStaticMarkup(<InterviewAlgorithmExam session={session} />);
    expect(html).toContain("两数之和");
    expect(html).toContain("LeetCode");
    expect(html).toContain("ACM");
    expect(html).toContain("运行并提交");
    expect(html).not.toContain("参考答案");
    expect(html).not.toContain("完整测试用例</");
  });
});
