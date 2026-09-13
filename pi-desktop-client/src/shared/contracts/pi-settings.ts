import type { ThinkingLevel } from "./agent-session";

export type ProjectTrustPolicy = "ask" | "always" | "never";

export type PiHostSettings = {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: ThinkingLevel;
  modelThinkingLevels?: Record<string, ThinkingLevel>;
  enabledModels?: string[];
  shellPath?: string;
  defaultProjectTrust?: ProjectTrustPolicy;
  compaction?: {
    enabled?: boolean;
    reserveTokens?: number;
    keepRecentTokens?: number;
  };
  retry?: {
    enabled?: boolean;
    maxRetries?: number;
  };
  defaultTools?: string[];
};

export type PiHostSettingsState = {
  global: PiHostSettings;
  project: PiHostSettings;
  effective: PiHostSettings;
  projectTrusted: boolean;
};

export type ProjectTrustState = {
  cwd: string;
  requiresTrust: boolean;
  effectiveTrusted: boolean;
  savedDecision: boolean | null;
  savedPath?: string;
  defaultPolicy: ProjectTrustPolicy;
};

export type PiSettingsPatch = PiHostSettings;
