import type { FileChange } from "./workspace";

export type AgentEventMeta = {
  eventId: string;
  sequence: number;
  timestamp: number;
  sessionId: string;
  runId?: string;
};

export type AgentContentBlock =
  | { type: "text"; contentIndex: number; text: string }
  | { type: "thinking"; contentIndex: number; text: string; redacted?: boolean };

export type AgentUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
};

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: AgentContentBlock[];
  timestamp: number;
  streaming: boolean;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  usage?: AgentUsage;
};

export type ToolOutputBlock =
  | { type: "text"; text: string }
  | { type: "media"; mediaType: string; label: string };

export type ToolResult = {
  output: ToolOutputBlock[];
};

export type InteractionRequest =
  | { id: string; method: "select"; title: string; options: string[]; timeout?: number }
  | { id: string; method: "confirm"; title: string; message: string; timeout?: number }
  | { id: string; method: "input"; title: string; placeholder?: string; timeout?: number }
  | { id: string; method: "editor"; title: string; prefill?: string };

export type CompactionState = {
  phase: "idle" | "running" | "failed";
  reason?: "manual" | "threshold" | "overflow";
  message?: string;
};

export type RetryState = {
  phase: "idle" | "waiting" | "running" | "failed";
  attempt?: number;
  maxAttempts?: number;
  delayMs?: number;
  message?: string;
};

export type AgentEvent =
  | { type: "run.started"; meta: AgentEventMeta }
  | { type: "run.settled"; meta: AgentEventMeta; outcome: "completed" | "aborted" | "failed" }
  | {
      type: "message.started";
      meta: AgentEventMeta;
      messageId: string;
      role: "user" | "assistant";
      timestamp: number;
    }
  | {
      type: "message.delta";
      meta: AgentEventMeta;
      messageId: string;
      channel: "text" | "thinking";
      contentIndex: number;
      delta: string;
    }
  | { type: "message.completed"; meta: AgentEventMeta; message: AgentMessage }
  | {
      type: "tool.started";
      meta: AgentEventMeta;
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | { type: "tool.output"; meta: AgentEventMeta; toolCallId: string; output: ToolOutputBlock[] }
  | {
      type: "tool.completed";
      meta: AgentEventMeta;
      toolCallId: string;
      result: ToolResult;
      isError: boolean;
    }
  | { type: "file.changed"; meta: AgentEventMeta; change: FileChange }
  | { type: "terminal.output"; meta: AgentEventMeta; terminalId: string; delta: string }
  | { type: "queue.changed"; meta: AgentEventMeta; steering: string[]; followUp: string[] }
  | { type: "compaction.changed"; meta: AgentEventMeta; state: CompactionState }
  | { type: "retry.changed"; meta: AgentEventMeta; state: RetryState }
  | { type: "interaction.requested"; meta: AgentEventMeta; request: InteractionRequest }
  | { type: "error.raised"; meta: AgentEventMeta; message: string };
