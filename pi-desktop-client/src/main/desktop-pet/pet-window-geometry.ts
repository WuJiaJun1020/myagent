type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };

// Constrain the visible sprite, not the transparent window or its toolbar padding.
export function clampPetPosition(position: Point, visible: Rect, workArea: Rect): Point {
  const axis = (value: number, offset: number, length: number, start: number, available: number) => {
    const visibleLength = Math.min(64, length, available);
    const min = length <= available ? start - offset : start + visibleLength - offset - length;
    const max = length <= available ? start + available - offset - length : start + available - visibleLength - offset;
    return Math.round(Math.max(min, Math.min(max, value)));
  };
  return { x: axis(position.x, visible.x, visible.width, workArea.x, workArea.width), y: axis(position.y, visible.y, visible.height, workArea.y, workArea.height) };
}

export function validDesktopPoint(point: Point, displays: Rect[]): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && displays.some(d => point.x >= d.x && point.y >= d.y && point.x < d.x + d.width && point.y < d.y + d.height);
}
