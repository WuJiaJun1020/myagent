import { describe, expect, it } from "vitest";
import { paragraphs, splitChapter, keywords } from "../../../../../src/main/smart-library/indexing/chunks";
import { parseBook } from "../../../../../src/main/smart-library/book-parser";
describe("library source coordinates", () => {
  it("keeps true chapters distinct from display pages and preserves Unicode", async () => {
    const text = "甲".repeat(13999) + "🐱" + "乙".repeat(16000);
    const canonical = await parseBook(Buffer.from("第一章\n" + text), "book.txt", false);
    const pages = await parseBook(Buffer.from("第一章\n" + text), "book.txt");
    expect(canonical.chapters).toHaveLength(1); expect(pages.chapters.length).toBeGreaterThan(1);
    expect(pages.chapters.map(c => c.text).join("")).toBe(text);
    for (const page of pages.chapters) expect(Buffer.from(page.text).toString("utf8")).toBe(page.text);
  });
  it("covers every character, restores all chunks and never splits surrogate pairs", () => {
    const text = ("甲🐱".repeat(271) + "。\n\n乙。\n").repeat(8);
    let covered = 0;
    for (const chunk of splitChapter(text)) {
      expect(chunk.start).toBeLessThanOrEqual(covered);
      expect(chunk.text).toBe(text.slice(chunk.start, chunk.end));
      expect(Buffer.from(chunk.text).toString("utf8")).toBe(chunk.text); expect(chunk.text.length).toBeLessThanOrEqual(800);
      covered = chunk.end;
    }
    expect(covered).toBe(text.length);
    expect(paragraphs(text).map(p => text.slice(p.start,p.end)).join("")).toBe(text);
  });
  it("indexes two character names and single characters", () => { expect(keywords("林舟拿钥匙").split(" ")).toContain("林舟"); expect(keywords("甲")).toBe("甲"); });
  it("supports fixed and paragraph sizes with high overlap without splitting emoji", () => {
    const text="🐱甲。\n".repeat(150);
    for(const method of ["fixed","paragraph"]){
      const pieces=[...splitChapter(text,{method,size:100,overlap:99})];
      expect(pieces.length).toBeLessThan(text.length);let covered=0;
      for(const p of pieces){expect(p.start).toBeLessThanOrEqual(covered);expect(p.end).toBeGreaterThan(p.start);expect(p.text.length).toBeLessThanOrEqual(100);expect(Buffer.from(p.text).toString("utf8")).toBe(p.text);covered=p.end;}
      expect(covered).toBe(text.length);
    }
  });
});
