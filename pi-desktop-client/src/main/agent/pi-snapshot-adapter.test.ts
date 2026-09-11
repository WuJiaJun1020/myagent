import { describe, expect, it } from "vitest";
import { adaptRpcHistory, toDesktopModel, toThinkingLevel } from "./pi-snapshot-adapter";

describe("adaptRpcHistory", () => {
  it("restores messages, thinking, tool calls, and results from Pi history", () => {
    const history = adaptRpcHistory("session-1", [
      { role: "user", content: "检查项目", timestamp: 10 },
      {
        role: "assistant",
        timestamp: 20,
        model: "gpt-test",
        content: [
          { type: "thinking", thinking: "先读取文件" },
          { type: "text", text: "我来检查。" },
          { type: "toolCall", id: "call-1", name: "read", arguments: { path: "src/app.ts" } },
        ],
      },
      { role: "toolResult", toolCallId: "call-1", toolName: "read", content: [{ type: "text", text: "source" }], isError: false, timestamp: 30 },
    ]);

    expect(history.messages).toHaveLength(2);
    expect(history.messages[1]).toMatchObject({
      role: "assistant",
      model: "gpt-test",
      content: [
        { type: "thinking", text: "先读取文件" },
        { type: "text", text: "我来检查。" },
      ],
    });
    expect(history.toolCalls).toEqual([expect.objectContaining({
      id: "call-1",
      name: "read",
      args: { path: "src/app.ts" },
      output: [{ type: "text", text: "source" }],
      status: "done",
    })]);
    expect(history.timeline).toEqual([
      { type: "message", id: "session-1:message:0" },
      { type: "message", id: "session-1:message:1" },
      { type: "tool", id: "call-1" },
    ]);
  });
});

describe("Pi state value adapters", () => {
  it("accepts Pi model metadata and supported thinking levels", () => {
    expect(toDesktopModel({
      provider: "openai",
      id: "gpt-test",
      name: "GPT Test",
      api: "responses",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 128_000,
      maxTokens: 16_000,
    })).toMatchObject({ id: "gpt-test", reasoning: true, supportsImages: true, contextWindow: 128_000 });
    expect(toThinkingLevel("xhigh")).toBe("xhigh");
    expect(toThinkingLevel("unsupported")).toBeUndefined();
  });
});
