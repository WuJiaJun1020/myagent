import { describe, expect, it } from "vitest";
import { clampPetPosition, validDesktopPoint } from "../../../../src/main/desktop-pet/pet-window-geometry";

describe("pet window geometry", () => {
  const area = { x: 0, y: 0, width: 1920, height: 1080 };
  it("lets visible pixels reach the top left despite transparent padding", () => {
    const visible = { x: 90, y: 110, width: 160, height: 140 };
    expect(clampPetPosition({ x: -500, y: -500 }, visible, area)).toEqual({ x: -90, y: -110 });
    expect(clampPetPosition({ x: -85, y: -105 }, visible, area)).toEqual({ x: -85, y: -105 });
    expect(clampPetPosition({ x: 1900, y: 1060 }, visible, area)).toEqual({ x: 1670, y: 830 });
  });
  it("supports screens located left and above the primary screen", () => {
    expect(clampPetPosition({ x: -2200, y: -1200 }, { x: 8, y: 8, width: 250, height: 250 }, { x: -1920, y: -1080, width: 1920, height: 1080 })).toEqual({ x: -1928, y: -1088 });
  });
  it("allows oversized original-resolution sprites to move without losing every visible pixel", () => {
    const visible = { x: 8, y: 8, width: 2200, height: 1600 };
    expect(clampPetPosition({ x: -500, y: -500 }, visible, area)).toEqual({ x: -500, y: -500 });
    expect(clampPetPosition({ x: -10000, y: -10000 }, visible, area)).toEqual({ x: -2144, y: -1544 });
  });
  it("rejects failed native cursor reads without rejecting negative screen coordinates", () => {
    const displays = [area, { x: -1920, y: -1080, width: 1920, height: 1080 }];
    expect(validDesktopPoint({ x: -1145324672, y: -1145324672 }, displays)).toBe(false);
    expect(validDesktopPoint({ x: NaN, y: 50 }, displays)).toBe(false);
    expect(validDesktopPoint({ x: -250, y: -100 }, displays)).toBe(true);
    expect(validDesktopPoint({ x: 400, y: 400 }, displays)).toBe(true);
  });
});
