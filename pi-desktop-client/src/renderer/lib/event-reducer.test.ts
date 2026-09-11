import { describe, expect, it } from "vitest";
import type { AgentEventMeta } from "../../shared/contracts/agent-events";
import { createInitialAgentRuntimeState, reduceAgentEvent } from "./event-reducer";

function meta(sequence: number): AgentEventMeta {
  return { eventId: `event-${sequence}`, sequence, timestamp: sequence, sessionId: "session" };
}

describe("reduceAgentEvent", () => {
  it("records task duration from run start through settlement", () => {
    let state = createInitialAgentRuntimeState();
    state = reduceAgentEvent(state, { type: "run.started", meta: { ...meta(1), timestamp: 1_000 } });
    state = reduceAgentEvent(state, {
      type: "run.settled",
      meta: { ...meta(2), timestamp: 34_500 },
      outcome: "completed",
    });

    expect(state.runTiming).toEqual({ startedAt: 1_000, settledAt: 34_500 });
    expect(state.busy).toBe(false);
  });

  it("stores text and thinking blocks independently and accepts the final message", () => {
    let state = createInitialAgentRuntimeState();
    state = reduceAgentEvent(state, {
      type: "message.started",
      meta: meta(1),
      messageId: "message-1",
      role: "assistant",
      timestamp: 1,
    });
    state = reduceAgentEvent(state, {
      type: "message.delta",
      meta: meta(2),
      messageId: "message-1",
      channel: "thinking",
      contentIndex: 0,
      delta: "思考",
    });
    state = reduceAgentEvent(state, {
      type: "message.delta",
      meta: meta(3),
      messageId: "message-1",
      channel: "text",
      contentIndex: 1,
      delta: "草稿",
    });
    state = reduceAgentEvent(state, {
      type: "message.completed",
      meta: meta(4),
      message: {
        id: "message-1",
        role: "assistant",
        timestamp: 4,
        streaming: false,
        content: [{ type: "text", contentIndex: 1, text: "最终内容" }],
      },
    });

    expect(state.timelineOrder).toEqual([{ type: "message", id: "message-1" }]);
    expect(state.messagesById["message-1"].content).toEqual([
      { type: "text", contentIndex: 1, text: "最终内容" },
    ]);
    expect(state.messagesById["message-1"].streaming).toBe(false);
  });

  it("updates concurrent tools without replacing one another", () => {
    let state = createInitialAgentRuntimeState();
    state = reduceAgentEvent(state, { type: "tool.started", meta: meta(1), toolCallId: "one", toolName: "read", args: {} });
    state = reduceAgentEvent(state, { type: "tool.started", meta: meta(2), toolCallId: "two", toolName: "bash", args: {} });
    state = reduceAgentEvent(state, {
      type: "tool.completed",
      meta: meta(3),
      toolCallId: "two",
      result: { output: [{ type: "text", text: "done" }] },
      isError: false,
    });

    expect(state.toolCallsById.one.status).toBe("running");
    expect(state.toolCallsById.two.status).toBe("done");
    expect(state.timelineOrder).toEqual([
      { type: "tool", id: "one" },
      { type: "tool", id: "two" },
    ]);
  });

  it("links a file change to its originating tool call", () => {
    let state = createInitialAgentRuntimeState();
    state = reduceAgentEvent(state, {
      type: "tool.started",
      meta: meta(1),
      toolCallId: "edit-1",
      toolName: "edit",
      args: { path: "src/app.ts" },
    });
    state = reduceAgentEvent(state, {
      type: "file.changed",
      meta: meta(2),
      change: {
        path: "src/app.ts",
        changeType: "modified",
        unifiedDiff: "-old\n+new",
        toolCallId: "edit-1",
        timestamp: 2,
      },
    });

    expect(state.toolCallsById["edit-1"].fileChange).toMatchObject({
      path: "src/app.ts",
      toolCallId: "edit-1",
    });
  });

  it("ignores duplicate sequences and isolates a new session", () => {
    let state = createInitialAgentRuntimeState();
    const firstEvent = {
      type: "message.started" as const,
      meta: meta(1),
      messageId: "old-message",
      role: "assistant" as const,
      timestamp: 1,
    };
    state = reduceAgentEvent(state, firstEvent);
    const duplicateState = reduceAgentEvent(state, firstEvent);
    expect(duplicateState).toBe(state);

    state = reduceAgentEvent(state, {
      type: "run.started",
      meta: { ...meta(2), sessionId: "new-session" },
    });
    expect(state.timelineOrder).toEqual([]);
    expect(state.messagesById).toEqual({});
    expect(state.activeSessionId).toBe("new-session");
    expect(state.busy).toBe(true);
  });
});
