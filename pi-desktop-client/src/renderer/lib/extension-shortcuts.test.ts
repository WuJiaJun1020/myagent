import { describe, expect, it } from "vitest";
import { eventShortcut, matchesExtensionShortcut } from "./extension-shortcuts";

function keyEvent(key: string, modifiers: Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">> = {}) {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  };
}

describe("extension shortcuts", () => {
  it("matches Pi shortcuts independent of modifier order", () => {
    const event = keyEvent("P", { ctrlKey: true, altKey: true });
    expect(matchesExtensionShortcut(event, "ctrl+alt+p")).toBe(true);
    expect(matchesExtensionShortcut(event, "alt+ctrl+p")).toBe(true);
    expect(matchesExtensionShortcut(event, "ctrl+shift+p")).toBe(false);
  });

  it("normalizes browser arrow key names to Pi key ids", () => {
    const event = keyEvent("ArrowUp", { ctrlKey: true });
    expect(eventShortcut(event)).toBe("ctrl+up");
    expect(matchesExtensionShortcut(event, "ctrl+up")).toBe(true);
  });
});
