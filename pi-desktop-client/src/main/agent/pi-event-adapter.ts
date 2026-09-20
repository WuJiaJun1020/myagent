import { randomUUID } from "node:crypto";
import type {
  AgentContentBlock,
  AgentEvent,
  AgentEventMeta,
  AgentMessage,
  AgentUsage,
  InteractionRequest,
  ToolOutputBlock,
} from "../../shared/contracts/agent-events";
import type { RpcMessage } from "../../shared/rpc";
import type { FileChange } from "../../shared/contracts/workspace";

type UnknownRecord = Record<string, unknown>;
const MAX_TOOL_OUTPUT_LENGTH = 200_000;
const MAX_MEDIA_BASE64_LENGTH = 5 * 1024 * 1024;

function limitToolOutput(text: string): string {
  if (text.length <= MAX_TOOL_OUTPUT_LENGTH) return text;
  return `${text.slice(0, MAX_TOOL_OUTPUT_LENGTH)}\n\n[输出过长，已截断]`;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : { value };
}

function serializeUnknown(value: unknown): string {
  if (typeof value === "string") return limitToolOutput(value);
  try {
    return limitToolOutput(JSON.stringify(value, null, 2) ?? String(value));
  } catch {
    return limitToolOutput(String(value));
  }
}

function toOutputBlocks(value: unknown): ToolOutputBlock[] {
  if (!isRecord(value)) {
    return value === undefined ? [] : [{ type: "text", text: serializeUnknown(value) }];
  }

  if (!Array.isArray(value.content)) {
    return [{ type: "text", text: serializeUnknown(value) }];
  }

  const blocks: ToolOutputBlock[] = [];
  for (const item of value.content) {
    if (!isRecord(item)) continue;
    const type = readString(item.type);
    const text = readString(item.text);
    if (text !== undefined) {
      blocks.push({ type: "text", text: limitToolOutput(text) });
      continue;
    }
    if (type === "image" || type === "audio") {
      const mimeType = readString(item.mimeType) ?? type;
      const data = readString(item.data);
      blocks.push({
        type: "media",
        mediaType: mimeType,
        label: type === "image" ? "图片结果" : "音频结果",
        ...(data && data.length <= MAX_MEDIA_BASE64_LENGTH ? { src: `data:${mimeType};base64,${data}` } : {}),
      });
    }
  }

  return blocks.length > 0 ? blocks : [{ type: "text", text: serializeUnknown(value) }];
}

function toUsage(value: unknown): AgentUsage | undefined {
  if (!isRecord(value)) return undefined;
  const input = readNumber(value.input);
  const output = readNumber(value.output);
  const cacheRead = readNumber(value.cacheRead);
  const cacheWrite = readNumber(value.cacheWrite);
  const totalTokens = readNumber(value.totalTokens);
  if ([input, output, cacheRead, cacheWrite, totalTokens].some((item) => item === undefined)) return undefined;
  return {
    input: input!,
    output: output!,
    cacheRead: cacheRead!,
    cacheWrite: cacheWrite!,
    totalTokens: totalTokens!,
  };
}

function toMessageContent(value: unknown): AgentContentBlock[] {
  if (typeof value === "string") return [{ type: "text", contentIndex: 0, text: value }];
  if (!Array.isArray(value)) return [];

  const result: AgentContentBlock[] = [];
  value.forEach((block, contentIndex) => {
    if (!isRecord(block)) return;
    if (block.type === "text" && typeof block.text === "string") {
      result.push({ type: "text", contentIndex, text: block.text });
    }
    if (block.type === "thinking" && typeof block.thinking === "string") {
      result.push({
        type: "thinking",
        contentIndex,
        text: block.thinking,
        redacted: readBoolean(block.redacted),
      });
    }
  });
  return result;
}

function toInteractionRequest(event: RpcMessage): InteractionRequest | undefined {
  const id = readString(event.id);
  const method = readString(event.method);
  const title = readString(event.title);
  if (!id || !title) return undefined;

  const timeout = readNumber(event.timeout);
  if (method === "select") {
    return { id, method, title, options: readStringArray(event.options), timeout };
  }
  if (method === "confirm") {
    return { id, method, title, message: readString(event.message) ?? "", timeout };
  }
  if (method === "input") {
    return { id, method, title, placeholder: readString(event.placeholder), timeout };
  }
  if (method === "editor") {
    return { id, method, title, prefill: readString(event.prefill) };
  }
  return undefined;
}

export class PiEventAdapter {
  private sequence = 0;
  private sessionId: string = randomUUID();
  private runId: string | undefined;
  private activeAssistantMessageId: string | undefined;

  beginSession(sessionId: string = randomUUID()): void {
    this.sessionId = sessionId;
    this.runId = undefined;
    this.activeAssistantMessageId = undefined;
  }

  getSequence(): number {
    return this.sequence;
  }

  synchronizeSession(sessionId: string): void {
    if (this.sessionId !== sessionId) this.beginSession(sessionId);
  }

  adapt(event: RpcMessage, fileChanges: FileChange[] = []): AgentEvent[] {
    switch (event.type) {
      case "agent_start": {
        this.runId = randomUUID();
        return [{ type: "run.started", meta: this.createMeta() }];
      }
      case "agent_settled": {
        const events: AgentEvent[] = [];
        if (fileChanges.length > 0) {
          events.push({
            type: "turn.diff.updated",
            meta: this.createMeta(),
            changes: fileChanges,
          });
        }
        events.push({
          type: "run.settled",
          meta: this.createMeta(),
          outcome: "completed",
        });
        this.runId = undefined;
        this.activeAssistantMessageId = undefined;
        return events;
      }
      case "message_start":
        return this.adaptMessageStart(event.message);
      case "message_update":
        return this.adaptMessageUpdate(event.assistantMessageEvent);
      case "message_end":
        return this.adaptMessageEnd(event.message);
      case "tool_execution_start": {
        const toolCallId = readString(event.toolCallId);
        if (!toolCallId) return [];
        return [{
          type: "tool.started",
          meta: this.createMeta(),
          toolCallId,
          toolName: readString(event.toolName) ?? "tool",
          args: asRecord(event.args),
        }];
      }
      case "tool_execution_update": {
        const toolCallId = readString(event.toolCallId);
        if (!toolCallId) return [];
        return [{
          type: "tool.output",
          meta: this.createMeta(),
          toolCallId,
          output: toOutputBlocks(event.partialResult),
        }];
      }
      case "tool_execution_end": {
        const toolCallId = readString(event.toolCallId);
        if (!toolCallId) return [];
        return [{
          type: "tool.completed",
          meta: this.createMeta(),
          toolCallId,
          result: { output: toOutputBlocks(event.result) },
          isError: readBoolean(event.isError) ?? false,
        }];
      }
      case "queue_update":
        return [{
          type: "queue.changed",
          meta: this.createMeta(),
          steering: readStringArray(event.steering),
          followUp: readStringArray(event.followUp),
        }];
      case "compaction_start":
        return [{
          type: "compaction.changed",
          meta: this.createMeta(),
          state: {
            phase: "running",
            reason: this.readCompactionReason(event.reason),
          },
        }];
      case "compaction_end": {
        const aborted = readBoolean(event.aborted) ?? false;
        const errorMessage = readString(event.errorMessage);
        return [{
          type: "compaction.changed",
          meta: this.createMeta(),
          state: {
            phase: errorMessage && !aborted ? "failed" : "idle",
            reason: this.readCompactionReason(event.reason),
            message: errorMessage,
          },
        }];
      }
      case "auto_retry_start":
        return [{
          type: "retry.changed",
          meta: this.createMeta(),
          state: {
            phase: "waiting",
            attempt: readNumber(event.attempt),
            maxAttempts: readNumber(event.maxAttempts),
            delayMs: readNumber(event.delayMs),
            message: readString(event.errorMessage),
          },
        }];
      case "auto_retry_end": {
        const success = readBoolean(event.success) ?? false;
        return [{
          type: "retry.changed",
          meta: this.createMeta(),
          state: {
            phase: success ? "idle" : "failed",
            attempt: readNumber(event.attempt),
            message: readString(event.finalError),
          },
        }];
      }
      case "extension_ui_request": {
        const method = readString(event.method);
        if (method === "notify") {
          const severity = event.notifyType === "warning" || event.notifyType === "error" ? event.notifyType : "info";
          const message = readString(event.message);
          return message ? [{ type: "extension.notice", meta: this.createMeta(), severity, message }] : [];
        }
        if (method === "setStatus") {
          const key = readString(event.statusKey);
          return key ? [{ type: "extension.status", meta: this.createMeta(), key, text: readString(event.statusText) }] : [];
        }
        if (method === "setWidget") {
          const key = readString(event.widgetKey);
          if (!key) return [];
          const lines = readStringArray(event.widgetLines);
          const placement = event.widgetPlacement === "aboveEditor" ? "aboveEditor" : "belowEditor";
          return [{
            type: "extension.widget",
            meta: this.createMeta(),
            key,
            widget: lines.length > 0 ? { key, lines, placement } : undefined,
          }];
        }
        if (method === "setTitle") {
          const title = readString(event.title);
          return title === undefined ? [] : [{ type: "extension.title", meta: this.createMeta(), title }];
        }
        if (method === "set_editor_text") {
          const text = readString(event.text);
          return text === undefined ? [] : [{ type: "composer.draft", meta: this.createMeta(), text }];
        }
        const request = toInteractionRequest(event);
        return request ? [{ type: "interaction.requested", meta: this.createMeta(), request }] : [];
      }
      case "extension_ui_close": {
        const requestId = readString(event.id);
        const reason = event.reason === "timeout" ? "timeout" : event.reason === "cancelled" ? "cancelled" : undefined;
        return requestId && reason
          ? [{ type: "interaction.dismissed", meta: this.createMeta(), requestId, reason }]
          : [];
      }
      default:
        return [];
    }
  }

  private adaptMessageStart(value: unknown): AgentEvent[] {
    if (!isRecord(value)) return [];
    const role = readString(value.role);
    if (role === "assistant") {
      const messageId = randomUUID();
      this.activeAssistantMessageId = messageId;
      return [{
        type: "message.started",
        meta: this.createMeta(),
        messageId,
        role,
        timestamp: readNumber(value.timestamp) ?? Date.now(),
      }];
    }
    if (role === "user") {
      const message = this.toAgentMessage(value, randomUUID(), false);
      return message ? [{ type: "message.completed", meta: this.createMeta(), message }] : [];
    }
    return [];
  }

  private adaptMessageUpdate(value: unknown): AgentEvent[] {
    if (!isRecord(value)) return [];
    const updateType = readString(value.type);
    const channel = updateType === "text_delta" ? "text" : updateType === "thinking_delta" ? "thinking" : undefined;
    const delta = readString(value.delta);
    if (!channel || delta === undefined) return [];

    const events: AgentEvent[] = [];
    if (!this.activeAssistantMessageId) {
      this.activeAssistantMessageId = randomUUID();
      events.push({
        type: "message.started",
        meta: this.createMeta(),
        messageId: this.activeAssistantMessageId,
        role: "assistant",
        timestamp: Date.now(),
      });
    }
    events.push({
      type: "message.delta",
      meta: this.createMeta(),
      messageId: this.activeAssistantMessageId,
      channel,
      contentIndex: readNumber(value.contentIndex) ?? 0,
      delta,
    });
    return events;
  }

  private adaptMessageEnd(value: unknown): AgentEvent[] {
    if (!isRecord(value) || value.role !== "assistant") return [];
    const messageId = this.activeAssistantMessageId ?? randomUUID();
    const message = this.toAgentMessage(value, messageId, false);
    this.activeAssistantMessageId = undefined;
    return message ? [{ type: "message.completed", meta: this.createMeta(), message }] : [];
  }

  private toAgentMessage(value: UnknownRecord, id: string, streaming: boolean): AgentMessage | undefined {
    const role = readString(value.role);
    if (role !== "user" && role !== "assistant") return undefined;
    return {
      id,
      role,
      content: toMessageContent(value.content),
      timestamp: readNumber(value.timestamp) ?? Date.now(),
      streaming,
      model: readString(value.model),
      stopReason: readString(value.stopReason),
      errorMessage: readString(value.errorMessage),
      usage: toUsage(value.usage),
    };
  }

  private createMeta(): AgentEventMeta {
    return {
      eventId: randomUUID(),
      sequence: ++this.sequence,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      runId: this.runId,
    };
  }

  private readCompactionReason(value: unknown): "manual" | "threshold" | "overflow" | undefined {
    return value === "manual" || value === "threshold" || value === "overflow" ? value : undefined;
  }
}
