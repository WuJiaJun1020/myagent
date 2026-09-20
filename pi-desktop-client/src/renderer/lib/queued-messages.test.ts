import { describe, expect, it } from "vitest";
import { restoreQueuedMessages } from "./queued-messages";

describe("restoreQueuedMessages", () => {
  it("restores steering before follow-up messages and preserves the current draft", () => {
    expect(restoreQueuedMessages({
      steering: ["先修正方向", "再检查测试"],
      followUp: ["最后补文档"],
    }, "我正在输入的内容")).toBe([
      "先修正方向",
      "再检查测试",
      "最后补文档",
      "我正在输入的内容",
    ].join("\n\n"));
  });

  it("keeps the current draft unchanged when the queue is empty", () => {
    expect(restoreQueuedMessages({ steering: [], followUp: [] }, "保留草稿")).toBe("保留草稿");
  });
});
