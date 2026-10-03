import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseBook } from "../../../../src/main/smart-library/book-parser";
describe("book import", () => {
 it("decodes UTF-16 and splits Chinese chapters", async () => {
  const bytes = Buffer.concat([Buffer.from([255,254]),Buffer.from("第一章 开始\n你好世界\n第二章 后续\n再见", "utf16le")]);
  const book = await parseBook(bytes,"中文.txt"); expect(book.chapters.map(c=>c.title)).toEqual(["第一章 开始","第二章 后续"]); expect(book.chapters[0].text).toBe("你好世界");
 });
 it("bounds long chapters and rejects empty files", async () => {
  const book = await parseBook(Buffer.from("甲".repeat(40000)),"长文.txt"); expect(book.chapters.length).toBe(3); expect(book.chapters.every(c=>c.text.length<=14000)).toBe(true);
  await expect(parseBook(Buffer.from("   "),"空白.txt")).rejects.toThrow("正文");
 });
 it("reads EPUB spine order, metadata, encoded paths and strips active content", async () => {
  const zip=new JSZip();zip.file("META-INF/container.xml",'<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>');
  zip.file("OPS/book.opf",'<package xmlns:dc="urn:dc"><metadata><dc:title>测试图书</dc:title><dc:creator>测试作者</dc:creator></metadata><manifest><item id="a" href="一.xhtml" media-type="application/xhtml+xml"/><item id="b" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>');
  zip.file("OPS/一.xhtml",'<html><body><h1>第一章</h1><p>正文一</p></body></html>');zip.file("OPS/two.xhtml",'<html><body><h1>第二章</h1><script>secret()</script><p>正文二 &amp; 字符</p></body></html>');
  const result=await parseBook(await zip.generateAsync({type:"nodebuffer"}),"test.epub");expect(result.title).toBe("测试图书");expect(result.author).toBe("测试作者");expect(result.chapters.map(c=>c.title)).toEqual(["第二章","第一章"]);expect(result.chapters[0].text).not.toContain("secret");expect(result.chapters[0].text).toContain("&");
 });
 it("rejects corrupt EPUB",async()=>{await expect(parseBook(Buffer.from('no zip'),'bad.epub')).rejects.toThrow();});
});
