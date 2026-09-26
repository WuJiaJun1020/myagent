import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SCORE_CHAT_SETTINGS } from "../../../shared/contracts/interview";
import { DEFAULT_INTERVIEW_SCORE_PROMPT } from "../../../shared/interview-score";
import { clearInterviewScorePrompt, readInterviewScorePrompt, readInterviewScoreSettings,
  saveInterviewScorePrompt, saveInterviewScoreSettings } from "./interview-score-preferences";

afterEach(() => vi.unstubAllGlobals());

describe("interview score preferences", () => {
  it("keeps scoring model and prompt independent per interview and clears them on deletion", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } });
    expect(readInterviewScoreSettings("score-test")).toEqual(DEFAULT_SCORE_CHAT_SETTINGS);
    saveInterviewScoreSettings("score-test", { model: { providerId: "deepseek", modelId: "v4" }, reasoning: "low" });
    saveInterviewScorePrompt("score-test", "独立评分规则");
    expect(readInterviewScoreSettings("score-test")).toEqual({ model: { providerId: "deepseek", modelId: "v4" }, reasoning: "low" });
    expect(readInterviewScorePrompt("score-test")).toBe("独立评分规则");
    expect(readInterviewScoreSettings("another")).toEqual(DEFAULT_SCORE_CHAT_SETTINGS);
    clearInterviewScorePrompt("score-test");
    expect(readInterviewScoreSettings("score-test")).toEqual(DEFAULT_SCORE_CHAT_SETTINGS);
    expect(readInterviewScorePrompt("score-test")).toBe(DEFAULT_INTERVIEW_SCORE_PROMPT);
  });
});
