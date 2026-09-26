import { afterEach, describe, expect, it, vi } from "vitest";
import { clearInterviewChatSettings, readInterviewChatSettings, saveInterviewChatSettings } from "./interview-chat-preferences";

afterEach(() => vi.unstubAllGlobals());

describe("interview chat preferences", () => {
  it("remembers model and reasoning per interview without mixing interviews", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } });
    expect(readInterviewChatSettings("first")).toEqual({ reasoning: "medium" });
    saveInterviewChatSettings("first", { model: { providerId: "deepseek", modelId: "deepseek-reasoner" }, reasoning: "high" });
    expect(readInterviewChatSettings("first")).toEqual({
      model: { providerId: "deepseek", modelId: "deepseek-reasoner" }, reasoning: "high",
    });
    expect(readInterviewChatSettings("second")).toEqual({ reasoning: "medium" });
    clearInterviewChatSettings("first");
    expect(readInterviewChatSettings("first")).toEqual({ reasoning: "medium" });
  });

  it("ignores malformed stored values", () => {
    vi.stubGlobal("window", { localStorage: {
      getItem: () => '{"reasoning":"invalid","model":{"providerId":10,"modelId":"x"}}',
    } });
    expect(readInterviewChatSettings("malformed")).toEqual({ reasoning: "medium" });
  });
});
