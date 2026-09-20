import type { AgentMessage, ToolOutputBlock } from "./agent-events";
import type { FileChange } from "./workspace";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type SessionMode = "work" | "chat";
export type SessionScope = "workspace" | "global";
export type ApprovalPolicy = "ask" | "auto";
export type QueueProcessingMode = "all" | "one-at-a-time";

export type ContextUsage = {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
};

export type SlashCommand = {
  name: string;
  description?: string;
  argumentHint?: string;
  source: "extension" | "prompt" | "skill";
  sourceLabel?: string;
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
  isRetrying: boolean;
  steeringMode: QueueProcessingMode;
  followUpMode: QueueProcessingMode;
  autoCompactionEnabled: boolean;
  autoRetryEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
};

export type SessionListItem = {
  id: string;
  name?: string;
  mode: SessionMode;
  scope: SessionScope;
  firstMessage: string;
  createdAt: number;
  modifiedAt: number;
  messageCount: number;
  current: boolean;
  workspace?: {
    name: string;
    current: boolean;
    available: boolean;
  };
};

export type SessionStatistics = {
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
};

export type SessionTreeNode = {
  id: string;
  type: string;
  label?: string;
  preview: string;
  children: SessionTreeNode[];
};

export type SessionForkTarget = {
  entryId: string;
  text: string;
};

export type SessionOverview = {
  stats: SessionStatistics;
  tree: SessionTreeNode[];
  leafId: string | null;
  forkTargets: SessionForkTarget[];
};

export type SessionTreeNavigation = {
  snapshot: AgentRuntimeSnapshot;
  editorText?: string;
};

export type SessionTreeNavigationOptions = {
  summarize: boolean;
  customInstructions?: string;
  replaceInstructions?: boolean;
  label?: string;
};

export type ImageAttachment = {
  id: string;
  name: string;
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  size: number;
  previewDataUrl: string;
};

export type SnapshotToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  output: ToolOutputBlock[];
  status: "done" | "error";
  startedAt: number;
  completedAt?: number;
  /** Client-side metadata. Pi history does not persist this, so session caches merge it back by tool id. */
  fileChange?: FileChange;
  fileChanges?: FileChange[];
};

export type SnapshotTimelineEntry =
  | { type: "message"; id: string }
  | { type: "tool"; id: string };

export type SnapshotTurnFileChanges = {
  /** Zero-based index among the user messages in this session. */
  turnIndex: number;
  changes: FileChange[];
};

export type AgentHistorySnapshot = {
  messages: AgentMessage[];
  toolCalls: SnapshotToolCall[];
  timeline: SnapshotTimelineEntry[];
  /** Client-side turn snapshots; Pi history currently does not persist this metadata. */
  turnFileChanges?: SnapshotTurnFileChanges[];
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

export type AgentSessionConfiguration = {
  session: AgentSessionState;
  thinkingLevels: ThinkingLevel[];
};
