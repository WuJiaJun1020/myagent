import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InterviewSession } from "../../../shared/contracts/interview";
import { InterviewScoreCard } from "./InterviewScoreCard";

describe("InterviewScoreCard", () => {
  it("shows separate conversation and algorithm scores with answer evidence", () => {
    const session = {
      turns: [{ id: "candidate-1", role: "candidate", content: "我先定位慢查询。" }],
      algorithm: { status: "passed", passedMode: "acm", problem: { title: "两数之和", difficulty: "easy" } },
      scoreReports: [{ id: "report-1", version: 1, status: "succeeded", total: 77, coveredWeight: 100,
        model: { providerId: "openai-codex", modelId: "gpt-6-luna" }, reasoning: "medium", prompt: "评分规则",
        dimensions: [
          { key: "technical", score: 30, reason: "技术解释合理", evidence: [{ turnId: "candidate-1", quote: "我先定位慢查询" }] },
          { key: "practice", score: 35, reason: "有实践过程", evidence: [{ turnId: "candidate-1", quote: "我先定位慢查询" }] },
          { key: "communication", score: 12, reason: "清楚", evidence: [{ turnId: "candidate-1", quote: "我先定位慢查询" }] },
        ] }],
    } as InterviewSession;
    const html = renderToStaticMarkup(<InterviewScoreCard session={session} scoring={false} error={null}
      onRetry={() => undefined} />);
    expect(html).toContain("77 / 100");
    expect(html).toContain("100 / 100");
    expect(html).toContain("我先定位慢查询");
    expect(html).toContain("评分规则");
  });
});
