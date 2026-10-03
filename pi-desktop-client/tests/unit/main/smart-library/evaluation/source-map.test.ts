import { describe, expect, it } from "vitest";
import { parseBook } from "../../../../../src/main/smart-library/book-parser";
import { mapChapters, mapEvidence } from "../../../../../src/main/smart-library/evaluation/source-map";

describe("benchmark raw UTF-16 to indexed source mapping", () => {
  const raw = "前言  \r\n\r\n\r\n说明😀\r\n第一章 起点\r\n  韩立😀  \r\n\r\n\r\n交出铜钥匙。 \r第二章 后续\r\n另一处铜钥匙。\r\n";
  const prepare = async () => {
    const book = await parseBook(Buffer.from(raw), "book.txt", false);
    return mapChapters(raw, book.chapters.map((c, chapter) => ({ chapter, text: c.text })));
  };
  it("matches the production parser across CRLF, blank lines, trimming and surrogate pairs", async () => {
    const chapters = await prepare();
    expect(chapters.map(c => c.text)).toEqual(["前言\n\n说明😀", "韩立😀\n\n交出铜钥匙。", "另一处铜钥匙。"]);
    for (const quote of ["说明😀", "韩立😀  \r\n\r\n\r\n交出铜钥匙。", "另一处铜钥匙。"]) {
      const start = raw.indexOf(quote), span = mapEvidence(raw, chapters, { quote, start_utf16: start, end_utf16: start + quote.length });
      expect(chapters[span.chapter].text.slice(span.start, span.end)).toBe(quote.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim());
    }
  });
  it("rejects changed source, headings and index parser drift instead of guessing", async () => {
    const chapters = await prepare();
    expect(() => mapEvidence(raw, chapters, { quote: "不是原文", start_utf16: 0, end_utf16: 4 })).toThrow("不一致");
    const quote = "第一章 起点", start = raw.indexOf(quote);
    expect(() => mapEvidence(raw, chapters, { quote, start_utf16: start, end_utf16: start + quote.length })).toThrow("正文");
    expect(() => mapChapters(raw, [{ chapter: 0, text: "旧版本正文" }])).toThrow("有效索引不同");
  });
});
