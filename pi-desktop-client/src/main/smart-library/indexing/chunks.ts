import { createHash } from "node:crypto";
import type { ParsedBook } from "../book-parser";
export const CHUNK_VERSION = "utf16-paragraph-800-overlap80-v1";
export const SOURCE_VERSION = "canonical-v1";
export const hashText = (text: string) => createHash("sha256").update(text).digest("hex");
export function safeBoundary(text: string, offset: number) {
  return offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]) ? offset - 1 : offset;
}
export function paragraphs(text: string) {
  const starts = [0];
  for (const m of text.matchAll(/\n+/g)) if (m.index! + m[0].length < text.length) starts.push(m.index! + m[0].length);
  return starts.map((start, i) => ({ start, end: starts[i + 1] ?? text.length }));
}
export function* splitChapter(text: string, config = { method: "paragraph", size: 800, overlap: 80 }) {
  for (let start = 0; start < text.length;) {
    let end = safeBoundary(text, Math.min(start + config.size, text.length));
    const minimum = Math.max(Math.floor(config.size / 2), config.overlap + 2);
    if (config.method === "paragraph" && end < text.length) {
      const part = text.slice(start + minimum, end);
      const boundaries = [...part.matchAll(/[\n。！？!?；;]/g)];
      if (boundaries.length) end = start + minimum + boundaries.at(-1)!.index! + 1;
    }
    yield { start, end, text: text.slice(start, end) };
    if (end === text.length) break;
    const advance = start + (/^[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(text.slice(start, start + 2)) ? 2 : 1);
    start = Math.max(advance, safeBoundary(text, end - config.overlap));
  }
}
export const sourceHash = (book: ParsedBook) => hashText(JSON.stringify([SOURCE_VERSION, book.chapters]));
export function keywords(text: string) {
  const chars = Array.from(text.normalize("NFKC").toLowerCase());
  return chars.flatMap((char, i) => /[\p{L}\p{N}]/u.test(char)
    ? [char, ...(i + 1 < chars.length && /[\p{L}\p{N}]/u.test(chars[i + 1]) ? [char + chars[i + 1]] : [])] : []).join(" ");
}
