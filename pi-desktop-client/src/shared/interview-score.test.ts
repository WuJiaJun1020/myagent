import { describe, expect, it } from "vitest";
import type { InterviewAlgorithmExam } from "./contracts/interview";
import { interviewAlgorithmScore } from "./interview-score";

describe("interviewAlgorithmScore", () => {
  it("keeps the optional algorithm exam separate and binary", () => {
    expect(interviewAlgorithmScore(null)).toBeNull();
    expect(interviewAlgorithmScore({ status: "unavailable" } as InterviewAlgorithmExam)).toBeNull();
    expect(interviewAlgorithmScore({ status: "pending" } as InterviewAlgorithmExam)).toBeNull();
    expect(interviewAlgorithmScore({ status: "passed" } as InterviewAlgorithmExam)).toBe(100);
    expect(interviewAlgorithmScore({ status: "timed_out" } as InterviewAlgorithmExam)).toBe(0);
    expect(interviewAlgorithmScore({ status: "abandoned" } as InterviewAlgorithmExam)).toBe(0);
  });
});
