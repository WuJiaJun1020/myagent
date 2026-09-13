import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../../../shared/contracts/agent-events";
import type { ToolCallState } from "../../lib/event-reducer";
import { buildTaskRows, captureChatScroll, shouldShowEmptyChatState } from "./ChatPanel";

function message(id: string, role: "user" | "assistant", timestamp: number, content: AgentMessage["content"]): AgentMessage {
  return { id, role, timestamp, content, streaming: false };
}

describe("buildTaskRows", () => {
  it("folds every intermediate thought and tool call while keeping only the final answer visible", () => {
    const messagesById = {
      user: message("user", "user", 1_000, [{ type: "text", contentIndex: 0, text: "完成任务" }]),
      a1: message("a1", "assistant", 2_000, [{ type: "thinking", contentIndex: 0, text: "先读取" }]),
      a2: message("a2", "assistant", 4_000, [
        { type: "thinking", contentIndex: 0, text: "继续检查" },
        { type: "text", contentIndex: 1, text: "我再检查一个文件。" },
      ]),
      final: message("final", "assistant", 7_000, [
        { type: "thinking", contentIndex: 0, text: "汇总结论" },
        { type: "text", contentIndex: 1, text: "任务已经完成。" },
      ]),
    };
    const toolCallsById: Record<string, ToolCallState> = {
      t1: { id: "t1", name: "read", args: {}, output: [], status: "done", startedAt: 3_000, completedAt: 3_500 },
      t2: { id: "t2", name: "read", args: {}, output: [], status: "done", startedAt: 5_000, completedAt: 6_000 },
    };

    const rows = buildTaskRows({
      timeline: [
        { type: "message", id: "user" },
        { type: "message", id: "a1" },
        { type: "tool", id: "t1" },
        { type: "message", id: "a2" },
        { type: "tool", id: "t2" },
        { type: "message", id: "final" },
      ],
      messagesById,
      toolCallsById,
      busy: false,
      runTiming: { startedAt: 900, settledAt: 8_000 },
    });

    expect(rows).toEqual([
      { type: "message", id: "user" },
      {
        type: "task-activity",
        id: "activity:user",
        items: [
          { type: "assistant", messageId: "a1" },
          { type: "tool", toolId: "t1" },
          { type: "assistant", messageId: "a2" },
          { type: "tool", toolId: "t2" },
          { type: "final-thinking", messageId: "final" },
        ],
        startedAt: 900,
        endedAt: 8_000,
        settled: true,
      },
      { type: "message", id: "final", hideThinking: true },
    ]);
  });

  it("keeps the latest task activity expanded while the run is active", () => {
    const messagesById = {
      user: message("user", "user", 1_000, [{ type: "text", contentIndex: 0, text: "检查" }]),
      assistant: { ...message("assistant", "assistant", 2_000, [{ type: "thinking", contentIndex: 0, text: "分析中" }]), streaming: true },
    };
    const rows = buildTaskRows({
      timeline: [{ type: "message", id: "user" }, { type: "message", id: "assistant" }],
      messagesById,
      toolCallsById: {},
      busy: true,
      runTiming: { startedAt: 900 },
    });

    expect(rows[1]).toMatchObject({ type: "task-activity", settled: false, endedAt: undefined });
  });
});

describe("empty chat presentation", () => {
  it("only shows the welcome state for a settled, genuinely empty session", () => {
    expect(shouldShowEmptyChatState(0, null, 0)).toBe(true);
    expect(shouldShowEmptyChatState(0, "session", 0)).toBe(false);
    expect(shouldShowEmptyChatState(0, "initializing", 0)).toBe(false);
    expect(shouldShowEmptyChatState(0, null, 3)).toBe(false);
    expect(shouldShowEmptyChatState(1, null, 0)).toBe(false);
  });
});

describe("chat scroll position", () => {
  it("captures a stable row anchor instead of only an absolute offset", () => {
    const rows = [
      { type: "message", id: "first" },
      { type: "message", id: "second" },
    ] satisfies ReturnType<typeof buildTaskRows>;

    expect(captureChatScroll(245, 1_000, 400, rows, [
      { index: 0, start: 0, size: 180 },
      { index: 1, start: 180, size: 220 },
    ])).toEqual({
      scrollTop: 245,
      pinned: false,
      anchorId: "second",
      anchorOffset: 35,
    });
  });
});
