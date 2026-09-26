import { describe, expect, it } from "vitest";
import type { InterviewSession } from "../../shared/contracts/interview";
import { candidateResponseModeInstruction, candidateResponseModeTrace, chooseCandidateResponseMode,
  readCandidateResponseMode } from "./candidate-response-mode";

describe("candidate response mode", () => {
  it("honors 0% and 100% and keeps one mode tied to the current question", () => {
    expect(chooseCandidateResponseMode("q1", 0, 0).mode).toBe("normal");
    expect(chooseCandidateResponseMode("q1", 100, 999_999).mode).toBe("mistake");
    expect(chooseCandidateResponseMode("q1", 20, 199_999).mode).toBe("mistake");
    expect(chooseCandidateResponseMode("q1", 20, 200_000).mode).toBe("normal");
    expect(() => chooseCandidateResponseMode("q1", 101, 0)).toThrow();
    const decision = chooseCandidateResponseMode("q1", 100, 42);
    const session = { turns: [{ id: "q1", role: "interviewer" }],
      debugEvents: [{ trace: candidateResponseModeTrace(decision) }] } as InterviewSession;
    expect(readCandidateResponseMode(session)).toEqual(decision);
    expect(candidateResponseModeInstruction(decision)).toContain('"mode":"mistake"');
    expect(readCandidateResponseMode({ ...session, turns: [{ id: "q2", role: "interviewer" }] } as InterviewSession)).toBeNull();
  });
});
