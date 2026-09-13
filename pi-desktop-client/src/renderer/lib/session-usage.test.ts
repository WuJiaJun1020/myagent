import { describe, expect, it } from "vitest";
import { summarizePromptCache } from "./session-usage";

describe("summarizePromptCache", () => {
  it("calculates the token-weighted prompt cache hit rate", () => {
    expect(summarizePromptCache({
      input: 2_000,
      output: 500,
      cacheRead: 8_000,
      cacheWrite: 0,
      total: 10_500,
    })).toEqual({ reported: true, promptTokens: 10_000, hitRate: 80 });
  });

  it("shows a reported miss when the provider reports cache writes only", () => {
    expect(summarizePromptCache({
      input: 2_000,
      output: 500,
      cacheRead: 0,
      cacheWrite: 8_000,
      total: 10_500,
    })).toEqual({ reported: true, promptTokens: 10_000, hitRate: 0 });
  });

  it("keeps missing provider cache usage distinct from a zero-percent hit rate", () => {
    expect(summarizePromptCache({
      input: 2_000,
      output: 500,
      cacheRead: 0,
      cacheWrite: 0,
      total: 2_500,
    })).toEqual({ reported: false, promptTokens: 2_000, hitRate: null });
  });
});
