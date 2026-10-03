import { describe, expect, it } from "vitest";
import { distinct, ftsQuery, fuse, windows } from "../../../../../src/main/smart-library/retrieval/ranking";
const hit = (id: string, chapter = 0, start = 0, end = 800) => ({ id, chapter, start, end, title: "章", text: "原文", ordinal: Number(id) });
describe("library evidence ranking", () => {
  it("keeps two-character names and escapes operator-shaped input", () => {
    expect(ftsQuery("林舟")).toBe('"林舟"');
    expect(ftsQuery('" OR * - ()')).toBe('"or"');
    expect(ftsQuery("🐱")).toBe("");
  });
  it("fuses rank, not incompatible raw scores", () => {
    const rows = fuse([hit("1"), hit("2")], [hit("2"), hit("3")]);
    expect(rows[0].id).toBe("2"); expect(rows[0].keywordRank).toBe(2); expect(rows[0].vectorRank).toBe(1);
  });
  it("removes substantial overlap without collapsing different chapters", () => {
    expect(distinct([hit("1"), hit("2", 0, 100, 850), hit("3", 0, 700, 1400), hit("4", 1)], 8).map(r => r.id)).toEqual(["1", "3", "4"]);
  });
  it("covers rerank window tails and preserves surrogate pairs", () => {
    const text = "一".repeat(63) + "🐱" + "二".repeat(400) + "末尾关键证据";
    const rows = windows(text); expect(rows.at(-1)).toContain("末尾关键证据");
    let covered = 0;
    rows.forEach(row => { expect(row.length).toBeLessThanOrEqual(64); expect(Array.from(row).some(c => c.length === 1 && /[\uD800-\uDFFF]/.test(c))).toBe(false); const start = text.indexOf(row, Math.max(0, covered - 17)); expect(start).toBeLessThanOrEqual(covered); covered = start + row.length; });
    expect(covered).toBe(text.length);
  });
});
