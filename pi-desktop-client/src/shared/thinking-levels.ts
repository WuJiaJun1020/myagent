import type { ThinkingLevel } from "./contracts/agent-session";

export const THINKING_LEVEL_ORDER: readonly ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export function normalizeThinkingLevels(
  levels: readonly ThinkingLevel[],
  current?: ThinkingLevel,
): ThinkingLevel[] {
  const available = new Set(levels);
  if (current) available.add(current);
  const normalized = THINKING_LEVEL_ORDER.filter((level) => available.has(level));
  return normalized.length > 0 ? normalized : ["off"];
}
