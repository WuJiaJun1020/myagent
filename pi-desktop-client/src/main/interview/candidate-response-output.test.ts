import { describe, expect, it } from "vitest";
import { chooseCandidateResponseMode } from "./candidate-response-mode";
import { parseCandidateAnswer } from "./candidate-response-output";

describe("candidate JSON outcome", () => {
  const normal = chooseCandidateResponseMode("q1", 0, 0);
  const mistake = chooseCandidateResponseMode("q1", 100, 0);

  it("distinguishes a drawn mistake from one actually included in the answer", () => {
    expect(parseCandidateAnswer(JSON.stringify({ answer: "这题我没有亲自做过。",
      mistakeMade: false, mistakeKind: "none", mistakeQuote: "" }), mistake))
      .toMatchObject({ mistakeMade: false, mistakeKind: "none" });
    expect(parseCandidateAnswer(JSON.stringify({ answer: "我认为这里不需要幂等性。",
      mistakeMade: true, mistakeKind: "misconception", mistakeQuote: "不需要幂等性" }), mistake))
      .toMatchObject({ mistakeMade: true, mistakeQuote: "不需要幂等性" });
  });

  it("rejects unsupported self-report instead of marking a normal answer", () => {
    const reported = JSON.stringify({ answer: "我会先核验请求。", mistakeMade: true,
      mistakeKind: "misconception", mistakeQuote: "不需要幂等性" });
    expect(() => parseCandidateAnswer(reported, mistake)).toThrow("不一致");
    expect(() => parseCandidateAnswer(reported, normal)).toThrow("不一致");
    expect(() => parseCandidateAnswer(JSON.stringify({ answer: "正常回答", mistakeMade: false,
      mistakeKind: "slip", mistakeQuote: "" }), normal)).toThrow("未实施误答");
  });
});
