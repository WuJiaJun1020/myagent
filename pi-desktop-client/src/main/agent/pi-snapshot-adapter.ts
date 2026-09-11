import type {
  AgentHistorySnapshot,
  DesktopModel,
  SnapshotTimelineEntry,
  SnapshotToolCall,
  ThinkingLevel,
} from "../../shared/contracts/agent-session";
import type {
  AgentContentBlock,
  AgentMessage,
  AgentUsage,
  ToolOutputBlock,
} from "../../shared/contracts/agent-events";

type UnknownRecord = Record<string, unknown>;
const MAX_HISTORY_TEXT = 200_000;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function limitText(text: string): string {
  return text.length <= MAX_HISTORY_TEXT
    ? text
    : `${text.slice(0, MAX_HISTORY_TEXT)}\n\n[历史内容过长，已截断]`;
}

function toUsage(value: unknown): AgentUsage | undefined {
  if (!isRecord(value)) return undefined;
  const input = readNumber(value.input);
  const output = readNumber(value.output);
  const cacheRead = readNumber(value.cacheRead);
  const cacheWrite = readNumber(value.cacheWrite);
  const totalTokens = readNumber(value.totalTokens);
  if (input === undefined || output === undefined || cacheRead === undefined || cacheWrite === undefined || totalTokens === undefined) {
    return undefined;
  }
  return { input, output, cacheRead, cacheWrite, totalTokens };
}

function toMessageContent(value: unknown, role: "user" | "assistant"): AgentContentBlock[] {
  if (typeof value === "string") return [{ type: "text", contentIndex: 0, text: limitText(value) }];
  if (!Array.isArray(value)) return [];
  const result: AgentContentBlock[] = [];
  value.forEach((item, contentIndex) => {
    if (!isRecord(item)) return;
    if (item.type === "text" && typeof item.text === "string") {
      result.push({ type: "text", contentIndex, text: limitText(item.text) });
    }
    if (role === "assistant" && item.type === "thinking" && typeof item.thinking === "string") {
      result.push({ type: "thinking", contentIndex, text: limitText(item.thinking) });
    }
  });
  return result;
}

function toOutputBlocks(value: unknown): ToolOutputBlock[] {
  if (!Array.isArray(value)) return [];
  const output: ToolOutputBlock[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (typeof item.text === "string") {
      output.push({ type: "text", text: limitText(item.text) });
    } else if (item.type === "image" || item.type === "audio") {
      output.push({
        type: "media",
        mediaType: readString(item.mimeType) ?? String(item.type),
        label: item.type === "image" ? "图片结果" : "音频结果",
      });
    }
  }
  return output;
}

function appendTimeline(timeline: SnapshotTimelineEntry[], entry: SnapshotTimelineEntry): void {
  if (!timeline.some((item) => item.type === entry.type && item.id === entry.id)) timeline.push(entry);
}

export function adaptRpcHistory(sessionId: string, value: unknown): AgentHistorySnapshot {
  const rawMessages = Array.isArray(value) ? value : [];
  const messages: AgentMessage[] = [];
  const tools = new Map<string, SnapshotToolCall>();
  const timeline: SnapshotTimelineEntry[] = [];

  rawMessages.forEach((rawMessage, index) => {
    if (!isRecord(rawMessage)) return;
    const role = readString(rawMessage.role);
    const timestamp = readNumber(rawMessage.timestamp) ?? index;

    if (role === "user" || role === "assistant") {
      const id = `${sessionId}:message:${index}`;
      const content = toMessageContent(rawMessage.content, role);
      const toolBlocks = role === "assistant" && Array.isArray(rawMessage.content)
        ? rawMessage.content.filter((item): item is UnknownRecord => isRecord(item) && item.type === "toolCall")
        : [];
      if (content.length > 0 || toolBlocks.length === 0) {
        messages.push({
          id,
          role,
          content,
          timestamp,
          streaming: false,
          model: readString(rawMessage.model),
          stopReason: readString(rawMessage.stopReason),
          errorMessage: readString(rawMessage.errorMessage),
          usage: toUsage(rawMessage.usage),
        });
        appendTimeline(timeline, { type: "message", id });
      }

      for (const toolBlock of toolBlocks) {
        const toolId = readString(toolBlock.id);
        if (!toolId) continue;
        const args = isRecord(toolBlock.arguments) ? toolBlock.arguments : {};
        tools.set(toolId, {
          id: toolId,
          name: readString(toolBlock.name) ?? "tool",
          args,
          output: [],
          status: "done",
          startedAt: timestamp,
        });
        appendTimeline(timeline, { type: "tool", id: toolId });
      }
      return;
    }

    if (role === "toolResult") {
      const toolId = readString(rawMessage.toolCallId);
      if (!toolId) return;
      const current = tools.get(toolId);
      tools.set(toolId, {
        id: toolId,
        name: readString(rawMessage.toolName) ?? current?.name ?? "tool",
        args: current?.args ?? {},
        output: toOutputBlocks(rawMessage.content),
        status: rawMessage.isError === true ? "error" : "done",
        startedAt: current?.startedAt ?? timestamp,
        completedAt: timestamp,
      });
      appendTimeline(timeline, { type: "tool", id: toolId });
      return;
    }

    if (role === "bashExecution") {
      const toolId = `${sessionId}:bash:${index}`;
      tools.set(toolId, {
        id: toolId,
        name: "bash",
        args: { command: readString(rawMessage.command) ?? "" },
        output: [{ type: "text", text: limitText(readString(rawMessage.output) ?? "") }],
        status: rawMessage.cancelled === true || (readNumber(rawMessage.exitCode) ?? 0) !== 0 ? "error" : "done",
        startedAt: timestamp,
        completedAt: timestamp,
      });
      appendTimeline(timeline, { type: "tool", id: toolId });
    }
  });

  return { messages, toolCalls: [...tools.values()], timeline };
}

export function toDesktopModel(value: unknown): DesktopModel | undefined {
  if (!isRecord(value)) return undefined;
  const provider = readString(value.provider);
  const id = readString(value.id);
  const name = readString(value.name);
  const api = readString(value.api);
  if (!provider || !id || !name || !api) return undefined;
  return {
    provider,
    id,
    name,
    api,
    reasoning: value.reasoning === true,
    supportsImages: Array.isArray(value.input) && value.input.includes("image"),
    contextWindow: readNumber(value.contextWindow) ?? 0,
    maxTokens: readNumber(value.maxTokens) ?? 0,
  };
}

export function toThinkingLevel(value: unknown): ThinkingLevel | undefined {
  return value === "off" || value === "minimal" || value === "low" || value === "medium"
    || value === "high" || value === "xhigh" || value === "max" ? value : undefined;
}
