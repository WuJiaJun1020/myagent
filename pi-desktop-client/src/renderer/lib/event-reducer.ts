import type {
  AgentEvent,
  AgentMessage,
  CompactionState,
  ExtensionWidget,
  InteractionRequest,
  RetryState,
  ToolOutputBlock,
} from "../../shared/contracts/agent-events";
import type { FileChange } from "../../shared/contracts/workspace";

export type TimelineEntry =
  | { type: "message"; id: string }
  | { type: "tool"; id: string };

export type ToolCallState = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  output: ToolOutputBlock[];
  status: "running" | "done" | "error";
  startedAt: number;
  completedAt?: number;
  fileChange?: FileChange;
};

export type AgentRuntimeState = {
  busy: boolean;
  runTiming: { startedAt: number; settledAt?: number } | null;
  messagesById: Record<string, AgentMessage>;
  toolCallsById: Record<string, ToolCallState>;
  timelineOrder: TimelineEntry[];
  queue: { steering: string[]; followUp: string[] };
  compaction: CompactionState;
  retry: RetryState;
  extensionNotices: Array<{ id: string; severity: "info" | "warning" | "error"; message: string }>;
  extensionStatuses: Record<string, string>;
  extensionWidgets: Record<string, ExtensionWidget>;
  interactionRequests: InteractionRequest[];
  error: string | null;
  activityRevision: number;
  activeSessionId: string | null;
  lastSequence: number;
};

export function createInitialAgentRuntimeState(): AgentRuntimeState {
  return {
    busy: false,
    runTiming: null,
    messagesById: {},
    toolCallsById: {},
    timelineOrder: [],
    queue: { steering: [], followUp: [] },
    compaction: { phase: "idle" },
    retry: { phase: "idle" },
    extensionNotices: [],
    extensionStatuses: {},
    extensionWidgets: {},
    interactionRequests: [],
    error: null,
    activityRevision: 0,
    activeSessionId: null,
    lastSequence: 0,
  };
}

function appendTimelineEntry(
  timeline: TimelineEntry[],
  entry: TimelineEntry,
): TimelineEntry[] {
  return timeline.some((item) => item.type === entry.type && item.id === entry.id)
    ? timeline
    : [...timeline, entry];
}

function createStreamingMessage(
  id: string,
  role: "user" | "assistant",
  timestamp: number,
): AgentMessage {
  return { id, role, content: [], timestamp, streaming: true };
}

export function reduceAgentEvent(state: AgentRuntimeState, event: AgentEvent): AgentRuntimeState {
  if (state.activeSessionId === event.meta.sessionId && event.meta.sequence <= state.lastSequence) {
    return state;
  }

  const sessionState = state.activeSessionId && state.activeSessionId !== event.meta.sessionId
    ? createInitialAgentRuntimeState()
    : state;
  const reduced = reduceCurrentSessionEvent(sessionState, event);
  return {
    ...reduced,
    activeSessionId: event.meta.sessionId,
    lastSequence: event.meta.sequence,
  };
}

function reduceCurrentSessionEvent(state: AgentRuntimeState, event: AgentEvent): AgentRuntimeState {
  const revision = state.activityRevision + 1;

  switch (event.type) {
    case "run.started":
      return {
        ...state,
        busy: true,
        runTiming: { startedAt: event.meta.timestamp },
        error: null,
        activityRevision: revision,
      };
    case "run.settled":
      return {
        ...state,
        busy: false,
        runTiming: {
          startedAt: state.runTiming?.startedAt ?? event.meta.timestamp,
          settledAt: event.meta.timestamp,
        },
        activityRevision: revision,
      };
    case "message.started": {
      const message = state.messagesById[event.messageId]
        ?? createStreamingMessage(event.messageId, event.role, event.timestamp);
      return {
        ...state,
        messagesById: { ...state.messagesById, [event.messageId]: message },
        timelineOrder: appendTimelineEntry(state.timelineOrder, { type: "message", id: event.messageId }),
        activityRevision: revision,
      };
    }
    case "message.delta": {
      const current = state.messagesById[event.messageId]
        ?? createStreamingMessage(event.messageId, "assistant", event.meta.timestamp);
      const blockIndex = current.content.findIndex(
        (block) => block.type === event.channel && block.contentIndex === event.contentIndex,
      );
      const content = [...current.content];
      if (blockIndex >= 0) {
        const block = content[blockIndex];
        content[blockIndex] = { ...block, text: block.text + event.delta };
      } else {
        content.push({ type: event.channel, contentIndex: event.contentIndex, text: event.delta });
        content.sort((left, right) => left.contentIndex - right.contentIndex);
      }
      return {
        ...state,
        messagesById: {
          ...state.messagesById,
          [event.messageId]: { ...current, content, streaming: true },
        },
        timelineOrder: appendTimelineEntry(state.timelineOrder, { type: "message", id: event.messageId }),
        activityRevision: revision,
      };
    }
    case "message.completed":
      return {
        ...state,
        messagesById: {
          ...state.messagesById,
          [event.message.id]: { ...event.message, streaming: false },
        },
        timelineOrder: appendTimelineEntry(state.timelineOrder, { type: "message", id: event.message.id }),
        activityRevision: revision,
      };
    case "tool.started": {
      const current = state.toolCallsById[event.toolCallId];
      const tool: ToolCallState = {
        id: event.toolCallId,
        name: event.toolName,
        args: event.args,
        output: current?.output ?? [],
        status: "running",
        startedAt: current?.startedAt ?? event.meta.timestamp,
      };
      return {
        ...state,
        toolCallsById: { ...state.toolCallsById, [event.toolCallId]: tool },
        timelineOrder: appendTimelineEntry(state.timelineOrder, { type: "tool", id: event.toolCallId }),
        activityRevision: revision,
      };
    }
    case "tool.output": {
      const current = state.toolCallsById[event.toolCallId] ?? {
        id: event.toolCallId,
        name: "tool",
        args: {},
        output: [],
        status: "running" as const,
        startedAt: event.meta.timestamp,
      };
      return {
        ...state,
        toolCallsById: {
          ...state.toolCallsById,
          [event.toolCallId]: { ...current, output: event.output },
        },
        timelineOrder: appendTimelineEntry(state.timelineOrder, { type: "tool", id: event.toolCallId }),
        activityRevision: revision,
      };
    }
    case "tool.completed": {
      const current = state.toolCallsById[event.toolCallId] ?? {
        id: event.toolCallId,
        name: "tool",
        args: {},
        output: [],
        status: "running" as const,
        startedAt: event.meta.timestamp,
      };
      return {
        ...state,
        toolCallsById: {
          ...state.toolCallsById,
          [event.toolCallId]: {
            ...current,
            output: event.result.output.length > 0 ? event.result.output : current.output,
            status: event.isError ? "error" : "done",
            completedAt: event.meta.timestamp,
          },
        },
        timelineOrder: appendTimelineEntry(state.timelineOrder, { type: "tool", id: event.toolCallId }),
        activityRevision: revision,
      };
    }
    case "file.changed": {
      const current = state.toolCallsById[event.change.toolCallId];
      if (!current) return { ...state, activityRevision: revision };
      return {
        ...state,
        toolCallsById: {
          ...state.toolCallsById,
          [event.change.toolCallId]: { ...current, fileChange: event.change },
        },
        activityRevision: revision,
      };
    }
    case "queue.changed":
      return {
        ...state,
        queue: { steering: event.steering, followUp: event.followUp },
        activityRevision: revision,
      };
    case "compaction.changed":
      return { ...state, compaction: event.state, activityRevision: revision };
    case "retry.changed":
      return { ...state, retry: event.state, activityRevision: revision };
    case "extension.notice":
      return {
        ...state,
        extensionNotices: [...state.extensionNotices, {
          id: event.meta.eventId,
          severity: event.severity,
          message: event.message,
        }].slice(-4),
        activityRevision: revision,
      };
    case "extension.status": {
      const extensionStatuses = { ...state.extensionStatuses };
      if (event.text) extensionStatuses[event.key] = event.text;
      else delete extensionStatuses[event.key];
      return { ...state, extensionStatuses, activityRevision: revision };
    }
    case "extension.widget": {
      const extensionWidgets = { ...state.extensionWidgets };
      if (event.widget) extensionWidgets[event.widget.key] = event.widget;
      else delete extensionWidgets[event.key];
      return { ...state, extensionWidgets, activityRevision: revision };
    }
    case "composer.draft":
      return { ...state, activityRevision: revision };
    case "interaction.requested":
      return {
        ...state,
        interactionRequests: state.interactionRequests.some((request) => request.id === event.request.id)
          ? state.interactionRequests
          : [...state.interactionRequests, event.request],
        activityRevision: revision,
      };
    case "error.raised":
      return { ...state, error: event.message, activityRevision: revision };
  }
}
