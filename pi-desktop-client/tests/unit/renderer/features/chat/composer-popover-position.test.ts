import { describe, expect, it } from "vitest";
import { composerPopoverPosition } from "../../../../../src/renderer/features/chat/composer-popover-position";

describe("composer popover placement", () => {
  const viewport = { width: 1280, height: 820 };

  it("centers on the trigger instead of aligning the right edges", () => {
    const position = composerPopoverPosition({ left: 500, top: 730, width: 130 }, 320, viewport);
    expect(position.left + 160).toBe(565);
    expect(position.bottom).toBe(98);
  });

  it("keeps both viewport edges clear", () => {
    expect(composerPopoverPosition({ left: 20, top: 730, width: 32 }, 272, viewport).left).toBe(12);
    expect(composerPopoverPosition({ left: 1210, top: 730, width: 32 }, 272, viewport).left).toBe(996);
  });

  it("follows a trigger shifted by resizing the review pane", () => {
    const before = composerPopoverPosition({ left: 500, top: 730, width: 130 }, 320, viewport);
    const after = composerPopoverPosition({ left: 420, top: 730, width: 130 }, 320, viewport);
    expect(after.left).toBe(before.left - 80);
  });

  it("limits the height to the available space above the trigger", () => {
    expect(composerPopoverPosition({ left: 500, top: 200, width: 130 }, 320, viewport).maxHeight).toBe(180);
  });
});
