import type { AgentMessage, ToolOutputBlock } from "./agent-events";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type SessionMode = "work" | "chat";
export type ApprovalPolicy = "ask" | "auto";

export type ContextUsage = {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
};

export type SlashCommand = {
  name: string;
  description?: string;
  source: "extension" | "prompt" | "skill";
};

export type DesktopModel = {
  provider: string;
  id: string;
  name: string;
  api: string;
  reasoning: boolean;
  supportsImages: boolean;
  contextWindow: number;
  maxTokens: number;
};

export type AgentSessionState = {
  id: string;
  name?: string;
  mode: SessionMode;
  approvalPolicy: ApprovalPolicy;
  contextUsage?: ContextUsage;
  model?: DesktopModel;
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  messageCount: number;
  pendingMessageCount: number;
};

export type SessionListItem = {
  id: string;
  name?: string;
  mode: SessionMode;
  firstMessage: string;
  createdAt: number;
  modifiedAt: number;
  messageCount: number;
  current: boolean;
};

export type SnapshotToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  output: ToolOutputBlock[];
  status: "done" | "error";
  startedAt: number;
  completedAt?: number;
};

export type SnapshotTimelineEntry =
  | { type: "message"; id: string }
  | { type: "tool"; id: string };

export type AgentHistorySnapshot = {
  messages: AgentMessage[];
  toolCalls: SnapshotToolCall[];
  timeline: SnapshotTimelineEntry[];
};

export type AgentRuntimeSnapshot = {
  sequence: number;
  session: AgentSessionState;
  sessions: SessionListItem[];
  models: DesktopModel[];
  thinkingLevels: ThinkingLevel[];
  commands: SlashCommand[];
  history: AgentHistorySnapshot;
};
