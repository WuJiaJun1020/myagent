import { describe, expect, it } from "vitest";
import { reconcilePrompts } from "./pending-prompts";
import type { AgentMessage } from "../../shared/contracts/agent-events";
const message = (id: string, text: string): AgentMessage => ({ id, role: "user", content: [{ type: "text", contentIndex: 0, text }], timestamp: 1, streaming: false });
const pending = (id: string) => ({ id, sessionId: "s1", text: "你好", knownIds: ["old"], timestamp: 1, queued: false });
describe("optimistic prompts", () => {
  it("ignores existing history and events from another session", () => {
    expect(reconcilePrompts([pending("a")], "s1", { old: message("old", "你好") })).toHaveLength(1);
    expect(reconcilePrompts([pending("a")], "s2", { next: message("next", "你好") })).toHaveLength(1);
  });
  it("replaces only one repeated send per confirmed message, across updates", () => {
    const messages = { next: message("next", "你好") };
    const remaining = reconcilePrompts([pending("a"), pending("b")], "s1", messages);
    expect(remaining.map(item => item.id)).toEqual(["b"]);
    expect(reconcilePrompts(remaining, "s1", messages)).toHaveLength(1);
    expect(reconcilePrompts(remaining, "s1", { ...messages, last: message("last", "你好") })).toHaveLength(0);
  });
});
