import type { Readable } from "node:stream";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { posix, basename, extname } from "node:path";
export type ParsedBook = { title: string; author: string; chapters: { title: string; text: string }[] };
const LIMIT = 80 * 1024 * 1024;
function xml(source: string) {
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(source)) throw Error("不支持包含实体声明的 EPUB");
  return new DOMParser({ onError: level => { if (level === "fatalError") throw Error("EPUB 文档格式损坏"); } }).parseFromString(source, "text/xml");
}
function nodes(doc: ReturnType<typeof xml>, tag: string) { return Array.from(doc.getElementsByTagNameNS("*", tag)); }
function plain(node: any): string {
  if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue ?? "";
  const tag = String(node.localName ?? "").toLowerCase();
  if (["script", "style", "head", "svg"].includes(tag)) return "";
  const children = Array.from(node.childNodes ?? []).map(plain).join("");
  return /^(p|div|section|h[1-6]|li|br|tr|blockquote)$/.test(tag) ? `\n${children}\n` : children;
}
function sections(title: string, text: string, paginate = true) {
  const result: { title: string; text: string }[] = [];
  text = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!paginate) return text ? [{ title, text }] : [];
  while (text.length) {
    let end = Math.min(14000, text.length);
    if (end < text.length) { const line = text.lastIndexOf("\n", end); if (line > end / 2) end = line; }
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    result.push({ title: result.length ? `${title}（续 ${result.length}）` : title, text: text.slice(0, end).trim() });
    text = text.slice(end).trim();
  }
  return result;
}
export async function parseBook(bytes: Buffer, filename: string, paginate = true): Promise<ParsedBook> {
  if (bytes.length > LIMIT) throw Error("单本图书不能超过 80 MB");
  const title = basename(filename, extname(filename));
  if (extname(filename).toLowerCase() === ".txt") {
    let text: string;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder("utf-16le").decode(bytes);
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder("utf-16be").decode(bytes);
    else { try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { text = new TextDecoder("gb18030").decode(bytes); } }
    if (text.includes("\0")) throw Error("无法识别文本编码，请转换为 UTF-8 后导入");
    const chapters: ParsedBook["chapters"] = [];
    let heading = "正文", lines: string[] = [];
    for (const line of text.split(/\r\n?|\n/)) {
      if (/^\s*(?:第[零〇一二三四五六七八九十百千万两\d]+[卷章节回部篇]|chapter\s+\d+)[^\n]{0,65}$/i.test(line)) {
        chapters.push(...sections(heading, lines.join("\n"), paginate)); heading = line.trim(); lines = [];
      } else lines.push(line);
    }
    chapters.push(...sections(heading, lines.join("\n"), paginate));
    if (!chapters.length) throw Error("图书没有可阅读的正文");
    return { title, author: "", chapters };
  }
  if (extname(filename).toLowerCase() !== ".epub") throw Error("仅支持 TXT 和 EPUB");
  const zip = await JSZip.loadAsync(bytes);
  if (Object.keys(zip.files).length > 20000) throw Error("EPUB 条目过多");
  let total = 0;
  const read = async (name: string): Promise<string> => {
    const entry = zip.file(name); if (!entry) throw Error(`EPUB 缺少文件：${name}`);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []; let size = 0;
      const stream = entry.nodeStream() as Readable;
      stream.on("data", (data: Buffer) => { size += data.length; total += data.length; if (size > 8 * 1024 * 1024 || total > LIMIT) { stream.destroy(); reject(Error("EPUB 解压内容过大")); } else chunks.push(data); });
      stream.on("error", reject).on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
  };
  if (zip.file("META-INF/encryption.xml")) throw Error("此 EPUB 包含加密资源，暂不支持");
  const container = xml(await read("META-INF/container.xml"));
  const opf = nodes(container, "rootfile")[0]?.getAttribute("full-path");
  if (!opf) throw Error("EPUB 缺少书籍目录");
  const doc = xml(await read(opf));
  const manifest = new Map(nodes(doc, "item").map(item => [item.getAttribute("id"), item]));
  const chapters: ParsedBook["chapters"] = [];
  for (const itemref of nodes(doc, "itemref")) {
    if (itemref.getAttribute("linear") === "no") continue;
    const item = manifest.get(itemref.getAttribute("idref"));
    if (!item) throw Error("EPUB 阅读顺序引用了不存在的章节");
    if (!/html|xml/.test(item.getAttribute("media-type") ?? "")) continue;
    const href = item.getAttribute("href") ?? "";
    const name = posix.normalize(posix.join(posix.dirname(opf), decodeURIComponent(href.split("#")[0])));
    if (name.startsWith("../") || name.startsWith("/") || href.includes(":")) throw Error("EPUB 章节路径无效");
    const chapter = xml(await read(name));
    const heading = nodes(chapter, "h1")[0]?.textContent || nodes(chapter, "h2")[0]?.textContent || nodes(chapter, "title")[0]?.textContent || `章节 ${chapters.length + 1}`;
    chapters.push(...sections(heading.trim(), plain(nodes(chapter, "body")[0] ?? chapter.documentElement), paginate));
  }
  if (!chapters.length) throw Error("此 EPUB 没有可预览的文字正文");
  return { title: nodes(doc, "title")[0]?.textContent?.trim() || title, author: nodes(doc, "creator")[0]?.textContent?.trim() || "", chapters };
}
