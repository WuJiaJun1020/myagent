import { describe, expect, it, vi } from "vitest";
import { sendToRenderer, type RendererWindow } from "./send-to-renderer";

function createWindow(options: { windowDestroyed?: boolean; contentsDestroyed?: boolean; sendThrows?: boolean } = {}) {
  const send = options.sendThrows
    ? vi.fn(() => { throw new Error("Object has been destroyed"); })
    : vi.fn();
  const window: RendererWindow = {
    isDestroyed: () => options.windowDestroyed ?? false,
    webContents: {
      isDestroyed: () => options.contentsDestroyed ?? false,
      send,
    },
  };
  return { window, send };
}

describe("sendToRenderer", () => {
  it("sends to a live renderer", () => {
    const { window, send } = createWindow();
    expect(sendToRenderer(window, "agent:event", { type: "run.started" })).toBe(true);
    expect(send).toHaveBeenCalledOnce();
  });

  it("ignores events after the window or webContents is destroyed", () => {
    const destroyedWindow = createWindow({ windowDestroyed: true });
    const destroyedContents = createWindow({ contentsDestroyed: true });

    expect(sendToRenderer(destroyedWindow.window, "pi:status", {})).toBe(false);
    expect(sendToRenderer(destroyedContents.window, "pi:status", {})).toBe(false);
    expect(destroyedWindow.send).not.toHaveBeenCalled();
    expect(destroyedContents.send).not.toHaveBeenCalled();
  });

  it("absorbs the teardown race between checking and sending", () => {
    const { window } = createWindow({ sendThrows: true });
    expect(() => sendToRenderer(window, "pi:status", {})).not.toThrow();
    expect(sendToRenderer(null, "pi:status", {})).toBe(false);
  });
});
