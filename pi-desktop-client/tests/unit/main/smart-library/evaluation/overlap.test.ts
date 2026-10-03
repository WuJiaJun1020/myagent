import { expect, it } from "vitest";
import { evidenceOverlaps } from "../../../../../src/shared/contracts/library-evidence-overlap";

it("underlines only coordinate overlaps, including clipped and overlapping evidence", () => {
  expect(evidenceOverlaps({ chapter: 1, start: 10, end: 20 }, [
    { id: "a", span: { chapter: 1, start: 8, end: 14 } },
    { id: "b", span: { chapter: 1, start: 12, end: 16 } },
    { id: "other", span: { chapter: 2, start: 10, end: 20 } },
  ])).toEqual([{ start: 0, end: 2, ids: ["a"] }, { start: 2, end: 4, ids: ["a", "b"] }, { start: 4, end: 6, ids: ["b"] }, { start: 6, end: 10, ids: [] }]);
});
