import { describe, expect, it } from "vitest";
import { PiEventAdapter } from "./pi-event-adapter";

describe("PiEventAdapter", () => {
  it("maps assistant text and thinking deltas to one stable message", () => {
    const adapter = new PiEventAdapter();
    const [started] = adapter.adapt({
      type: "message_start",
      message: { role: "assistant", content: [], timestamp: 10 },
    });
    expect(started.type).toBe("message.started");
    if (started.type !== "message.started") throw new Error("Expected message.started");

    const [thinking] = adapter.adapt({
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "分析" },
    });
    const [text] = adapter.adapt({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta: "答案" },
    });

    expect(thinking).toMatchObject({
      type: "message.delta",
      messageId: started.messageId,
      channel: "thinking",
      contentIndex: 0,
      delta: "分析",
    });
    expect(text).toMatchObject({
      type: "message.delta",
      messageId: started.messageId,
      channel: "text",
      contentIndex: 1,
      delta: "答案",
    });

    const [completed] = adapter.adapt({
      type: "message_end",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "分析" },
          { type: "text", text: "最终答案" },
        ],
        timestamp: 12,
        model: "test-model",
      },
    });
    expect(completed).toMatchObject({
      type: "message.completed",
      message: {
        id: started.messageId,
        model: "test-model",
        streaming: false,
        content: [
          { type: "thinking", text: "分析" },
          { type: "text", text: "最终答案" },
        ],
      },
    });
  });

  it("keeps concurrent tool calls independent", () => {
    const adapter = new PiEventAdapter();
    const [first] = adapter.adapt({ type: "tool_execution_start", toolCallId: "call-1", toolName: "read", args: { path: "a.ts" } });
    const [second] = adapter.adapt({ type: "tool_execution_start", toolCallId: "call-2", toolName: "bash", args: { command: "npm test" } });
    const [firstDone] = adapter.adapt({
      type: "tool_execution_end",
      toolCallId: "call-1",
      result: { content: [{ type: "text", text: "content" }] },
      isError: false,
    });

    expect(first).toMatchObject({ type: "tool.started", toolCallId: "call-1", toolName: "read" });
    expect(second).toMatchObject({ type: "tool.started", toolCallId: "call-2", toolName: "bash" });
    expect(firstDone).toMatchObject({
      type: "tool.completed",
      toolCallId: "call-1",
      result: { output: [{ type: "text", text: "content" }] },
    });
  });

  it("maps queue, retry, compaction, and interactive extension events", () => {
    const adapter = new PiEventAdapter();
    expect(adapter.adapt({ type: "queue_update", steering: ["调整"], followUp: ["继续"] })[0]).toMatchObject({
      type: "queue.changed",
      steering: ["调整"],
      followUp: ["继续"],
    });
    expect(adapter.adapt({ type: "compaction_start", reason: "threshold" })[0]).toMatchObject({
      type: "compaction.changed",
      state: { phase: "running", reason: "threshold" },
    });
    expect(adapter.adapt({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 500, errorMessage: "busy" })[0]).toMatchObject({
      type: "retry.changed",
      state: { phase: "waiting", attempt: 1, maxAttempts: 3 },
    });
    expect(adapter.adapt({ type: "extension_ui_request", id: "ui-1", method: "confirm", title: "确认", message: "继续吗？" })[0]).toMatchObject({
      type: "interaction.requested",
      request: { id: "ui-1", method: "confirm", title: "确认", message: "继续吗？" },
    });
  });

  it("bounds very large tool output before it reaches renderer state", () => {
    const adapter = new PiEventAdapter();
    const [event] = adapter.adapt({
      type: "tool_execution_update",
      toolCallId: "large-output",
      partialResult: { content: [{ type: "text", text: "x".repeat(250_000) }] },
    });
    expect(event.type).toBe("tool.output");
    if (event.type !== "tool.output") throw new Error("Expected tool.output");
    expect(event.output[0]).toMatchObject({ type: "text" });
    const output = event.output[0];
    if (output.type !== "text") throw new Error("Expected text output");
    expect(output.text.length).toBeLessThan(201_000);
    expect(output.text).toContain("[输出过长，已截断]");
  });
});
