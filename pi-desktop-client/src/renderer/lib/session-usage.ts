import type { SessionStatistics } from "../../shared/contracts/agent-session";

export type PromptCacheSummary = {
  reported: boolean;
  promptTokens: number;
  hitRate: number | null;
};

export function summarizePromptCache(tokens: SessionStatistics["tokens"]): PromptCacheSummary {
  const input = Math.max(0, tokens.input);
  const cacheRead = Math.max(0, tokens.cacheRead);
  const cacheWrite = Math.max(0, tokens.cacheWrite);
  const promptTokens = input + cacheRead + cacheWrite;
  const reported = cacheRead > 0 || cacheWrite > 0;

  return {
    reported,
    promptTokens,
    hitRate: reported && promptTokens > 0
      ? Math.min(100, Math.max(0, (cacheRead / promptTokens) * 100))
      : null,
  };
}
