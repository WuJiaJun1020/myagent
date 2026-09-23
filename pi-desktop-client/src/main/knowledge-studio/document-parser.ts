import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { readFile, stat } from "node:fs/promises";
import { isIP } from "node:net";
import { basename, extname } from "node:path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import type {
  KnowledgeSourceFormat,
  KnowledgeSourceKind,
  KnowledgeSourceSegment,
} from "../../shared/contracts/knowledge-studio";

const MAX_FILE_BYTES = 24 * 1024 * 1024;
const MAX_WEB_BYTES = 6 * 1024 * 1024;
const MAX_CONTENT_CHARS = 1_500_000;
const SEGMENT_TARGET_CHARS = 3_600;
const SEGMENT_MIN_CHARS = 700;
const SEGMENT_MAX_CHARS = 5_200;

// Increment when cleaning or segmentation semantics change. Persisted sources
// use this value so older derived segments can be rebuilt from the original.
export const KNOWLEDGE_PARSER_VERSION = 2;

export type ParsedKnowledgeSource = {
  title: string;
  kind: KnowledgeSourceKind;
  format: KnowledgeSourceFormat;
  originalName?: string;
  sourceUrl?: string;
  content: string;
  contentHash: string;
  segments: KnowledgeSourceSegment[];
  raw: Buffer;
};

function normalizedText(value: string): string {
  return value
    .replace(/\u0000/gu, "")
    .replace(/[\u200b\u200c\u200d\ufeff]/gu, "")
    .replace(/\u00a0/gu, " ")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t ]+\n/gu, "\n")
    .replace(/\n[\t ]+\n/gu, "\n\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/giu, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isSafeInteger(code) ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isSafeInteger(code) ? String.fromCodePoint(code) : match;
    }
    return named[lower] ?? match;
  });
}

function htmlTitle(html: string): string | undefined {
  const value = /<title\b[^>]*>([\s\S]*?)<\/title>/iu.exec(html)?.[1];
  return value ? normalizedText(decodeHtmlEntities(value.replace(/<[^>]+>/gu, " "))) : undefined;
}

function stripHtmlTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/gu, " ")).replace(/\s+/gu, " ").trim();
}

function removeElement(html: string, tag: string): string {
  const expression = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "giu");
  let result = html;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = result.replace(expression, " ");
    if (next === result) break;
    result = next;
  }
  return result;
}

function removeDecorativeRegions(html: string): string {
  const marker = "(?:nav(?:bar|igation)?|sidebar|toc|table-of-contents|breadcrumbs?|pagination|search|language-switcher)";
  const expression = new RegExp(
    `<([a-z][\\w:-]*)\\b(?=[^>]*(?:id|class)\\s*=\\s*["'][^"']*${marker}(?:[-_\\s]|(?=["']))[^"']*["'])[^>]*>[\\s\\S]*?<\\/\\1>`,
    "giu",
  );
  let result = html;
  for (let pass = 0; pass < 6; pass += 1) {
    const next = result.replace(expression, " ");
    if (next === result) break;
    result = next;
  }
  return result;
}

function semanticHtmlRegion(html: string): { html: string; focused: boolean } {
  const candidates = Array.from(html.matchAll(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/giu))
    .map((match) => match[2] ?? "")
    .filter(Boolean);
  if (candidates.length > 0) {
    return {
      html: candidates.sort((left, right) => stripHtmlTags(right).length - stripHtmlTags(left).length)[0]!,
      focused: true,
    };
  }
  return { html: /<body\b[^>]*>([\s\S]*?)<\/body>/iu.exec(html)?.[1] ?? html, focused: false };
}

function isStandaloneWebNoise(value: string): boolean {
  const plain = value.replace(/^#{1,6}\s+/u, "").trim().toLowerCase();
  if (!plain) return true;
  return /^(?:skip to (?:main )?content|on this page|table of contents|back to top|edit this page|copy page|copy|search|menu|navigation|previous|next|was this page helpful\??|english|简体中文|繁體中文|日本語|한국어|-|—)$/iu.test(plain)
    || /^(?:copyright|©)\s*\d{4}/iu.test(plain);
}

function removeWebNoiseBlocks(value: string): string {
  const result: string[] = [];
  for (const block of value.split(/\n{2,}/u).map((entry) => entry.trim()).filter(Boolean)) {
    if (isStandaloneWebNoise(block)) continue;
    if (block.length <= 160 && result.at(-1)?.toLowerCase() === block.toLowerCase()) continue;
    result.push(block);
  }
  return result.join("\n\n");
}

function htmlToText(html: string): string {
  let sanitized = html
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/giu, " ")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/giu, " ");
  const region = semanticHtmlRegion(sanitized);
  sanitized = removeDecorativeRegions(region.html);
  for (const tag of ["nav", "aside", "form", "dialog", "svg", "button", "select"]) {
    sanitized = removeElement(sanitized, tag);
  }
  if (!region.focused) {
    sanitized = removeElement(removeElement(sanitized, "header"), "footer");
  }
  sanitized = sanitized
    .replace(/<([a-z][\w:-]*)\b[^>]*\brole\s*=\s*["'](?:navigation|banner|contentinfo|search)["'][^>]*>[\s\S]*?<\/\1>/giu, " ")
    .replace(/<([a-z][\w:-]*)\b[^>]*\baria-hidden\s*=\s*["']true["'][^>]*>[\s\S]*?<\/\1>/giu, " ")
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/giu, (_match, level: string, value: string) => (
      `\n\n${"#".repeat(Number(level))} ${stripHtmlTags(value)}\n\n`
    ))
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/giu, (_match, value: string) => `\n\n\`\`\`\n${decodeHtmlEntities(value.replace(/<[^>]+>/gu, ""))}\n\`\`\`\n\n`)
    .replace(/<li\b[^>]*>/giu, "\n- ")
    .replace(/<\/(?:li|p|tr|blockquote|section|article|main)>/giu, "\n\n")
    .replace(/<\/div>/giu, "\n")
    .replace(/<(?:br|hr)\b[^>]*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ");
  return removeWebNoiseBlocks(normalizedText(decodeHtmlEntities(sanitized)));
}

function safeContent(value: string): string {
  const content = normalizedText(value);
  if (content.length < 40) throw new Error("资料正文过短，无法生成可靠题目");
  if (content.length > MAX_CONTENT_CHARS) {
    throw new Error(`资料正文超过 ${Math.round(MAX_CONTENT_CHARS / 10_000)} 万字符限制`);
  }
  return content;
}

function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function headingFor(block: string, format: KnowledgeSourceFormat): string | undefined {
  const markdown = /^#{1,6}\s+(.+)$/u.exec(block.trim());
  if (markdown) return markdown[1].trim().slice(0, 160);
  if (format === "markdown" || format === "html") return undefined;
  const trimmed = block.trim();
  if (trimmed.includes("\n")) return undefined;
  if (trimmed.length < 3 || trimmed.length > 80 || isStandaloneWebNoise(trimmed)) return undefined;
  if (/^(?:[-*+•]|\d+[.)])\s/u.test(trimmed) || /[。！？.!?;,，；]$/u.test(trimmed)) return undefined;
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return undefined;
  const words = trimmed.split(/\s+/u);
  const sectionNumber = /^(?:\d+(?:\.\d+)*|第[一二三四五六七八九十百\d]+[章节部分篇])/u.test(trimmed);
  const cjkTitle = /[\p{Script=Han}]/u.test(trimmed) && trimmed.length <= 36;
  const englishTitle = words.length <= 10 && (sectionNumber || words.every((word) => (
    /^(?:[A-Z\d][\p{L}\p{N}'’:/()&+-]*|a|an|and|as|at|by|for|from|in|of|on|or|the|to|with)$/u.test(word)
  )));
  return sectionNumber || cjkTitle || englishTitle ? trimmed.slice(0, 160) : undefined;
}

function splitOversizedBlock(block: string): string[] {
  if (block.length <= SEGMENT_MAX_CHARS) return [block];
  const result: string[] = [];
  let remaining = block;
  while (remaining.length > SEGMENT_MAX_CHARS) {
    const lowerBound = Math.min(SEGMENT_TARGET_CHARS, Math.floor(SEGMENT_MAX_CHARS * 0.65));
    const window = remaining.slice(lowerBound, SEGMENT_MAX_CHARS);
    let cut = -1;
    for (const match of window.matchAll(/[。！？.!?](?:\s+|$)|\n+/gu)) cut = lowerBound + (match.index ?? 0) + match[0].length;
    if (cut <= 0) {
      const space = remaining.lastIndexOf(" ", SEGMENT_MAX_CHARS);
      cut = space >= lowerBound ? space + 1 : SEGMENT_MAX_CHARS;
    }
    result.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) result.push(remaining);
  return result;
}

export function segmentKnowledgeContent(
  sourceId: string,
  content: string,
  format: KnowledgeSourceFormat = "text",
): KnowledgeSourceSegment[] {
  const blocks = content.split(/\n{2,}/u).map((block) => block.trim()).filter(Boolean).flatMap(splitOversizedBlock);
  const chunks: Array<{ content: string; heading?: string }> = [];
  let current = "";
  let heading: string | undefined;
  const flush = () => {
    if (!current.trim()) return;
    chunks.push({ content: current.trim(), ...(heading ? { heading } : {}) });
    current = "";
  };

  for (const block of blocks) {
    const detectedHeading = headingFor(block, format);
    const nextLength = current.length + (current ? 2 : 0) + block.length;
    if (detectedHeading && current.length >= SEGMENT_MIN_CHARS) {
      flush();
      heading = detectedHeading;
      current = block;
      continue;
    }
    if (current && (nextLength > SEGMENT_MAX_CHARS || (nextLength > SEGMENT_TARGET_CHARS && current.length >= SEGMENT_MIN_CHARS))) {
      flush();
    }
    if (!current) heading = detectedHeading ?? heading;
    current += `${current ? "\n\n" : ""}${block}`;
  }
  flush();

  for (let index = chunks.length - 1; index > 0; index -= 1) {
    const chunk = chunks[index]!;
    const previous = chunks[index - 1]!;
    if (chunk.content.length >= SEGMENT_MIN_CHARS) continue;
    if (previous.content.length + chunk.content.length + 2 > SEGMENT_MAX_CHARS) continue;
    previous.content = `${previous.content}\n\n${chunk.content}`;
    chunks.splice(index, 1);
  }

  if (chunks.length === 0) chunks.push({ content });
  let searchOffset = 0;
  return chunks.map((chunk, ordinal) => {
    let startOffset = content.indexOf(chunk.content, searchOffset);
    if (startOffset < 0) startOffset = searchOffset;
    const endOffset = Math.min(content.length, startOffset + chunk.content.length);
    searchOffset = endOffset;
    return {
      id: `${sourceId}:segment:${ordinal}`,
      ordinal,
      ...(chunk.heading ? { heading: chunk.heading } : {}),
      content: chunk.content,
      startOffset,
      endOffset,
    };
  });
}

function extensionFormat(filePath: string): KnowledgeSourceFormat {
  const extension = extname(filePath).toLowerCase();
  if ([".md", ".markdown"].includes(extension)) return "markdown";
  if ([".html", ".htm"].includes(extension)) return "html";
  if (extension === ".pdf") return "pdf";
  if (extension === ".docx") return "docx";
  if ([".txt", ".text", ".csv", ".json", ".yaml", ".yml", ".toml", ".rst"].includes(extension)) return "text";
  throw new Error(`暂不支持 ${extension || "无扩展名"} 文件；可导入 TXT、Markdown、HTML、DOCX 或文本型 PDF`);
}

async function extractBuffer(buffer: Buffer, format: KnowledgeSourceFormat): Promise<string> {
  if (format === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  if (format === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  const text = buffer.toString("utf8");
  return format === "html" ? htmlToText(text) : text;
}

function buildParsed(
  sourceId: string,
  input: Omit<ParsedKnowledgeSource, "contentHash" | "segments">,
): ParsedKnowledgeSource {
  const content = safeContent(input.content);
  return {
    ...input,
    content,
    contentHash: contentHash(content),
    segments: segmentKnowledgeContent(sourceId, content, input.format),
  };
}

export async function parseKnowledgeFile(sourceId: string, filePath: string): Promise<ParsedKnowledgeSource> {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error("选择的路径不是文件");
  if (info.size > MAX_FILE_BYTES) throw new Error(`文件 ${basename(filePath)} 超过 24 MB 限制`);
  const raw = await readFile(filePath);
  const format = extensionFormat(filePath);
  const extracted = await extractBuffer(raw, format);
  const content = format === "pdf"
    ? extracted.replace(/\f/gu, "\n\n").replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gimu, "")
    : extracted;
  if (format === "pdf" && normalizedText(content).length < 40) {
    throw new Error(`${basename(filePath)} 未提取到可用文字，可能是扫描 PDF；当前版本尚未启用 OCR`);
  }
  const originalName = basename(filePath);
  return buildParsed(sourceId, {
    title: originalName.replace(/\.[^.]+$/u, ""),
    kind: "file",
    format,
    originalName,
    content,
    raw,
  });
}

export function parseKnowledgeText(
  sourceId: string,
  title: string,
  content: string,
  format: "text" | "markdown" | "html" = "text",
): ParsedKnowledgeSource {
  const extracted = format === "html" ? htmlToText(content) : content;
  return buildParsed(sourceId, {
    title: title.trim(),
    kind: "pasted",
    format,
    content: extracted,
    raw: Buffer.from(content, "utf8"),
  });
}

function isPrivateAddress(address: string): boolean {
  if (address === "::1" || address === "0:0:0:0:0:0:0:1") return true;
  if (address.toLowerCase().startsWith("fc") || address.toLowerCase().startsWith("fd") || address.toLowerCase().startsWith("fe80:")) return true;
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function assertPublicUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("只支持不包含账号信息的 HTTP/HTTPS 网页地址");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("网页地址指向本机或私有网络，已拒绝访问");
  }
  return url;
}

async function readLimitedResponse(response: Response): Promise<Buffer> {
  const advertised = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertised) && advertised > MAX_WEB_BYTES) throw new Error("网页内容超过 6 MB 限制");
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_WEB_BYTES) {
      await reader.cancel();
      throw new Error("网页内容超过 6 MB 限制");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function parseKnowledgeUrl(sourceId: string, inputUrl: string, title?: string): Promise<ParsedKnowledgeSource> {
  let url = await assertPublicUrl(inputUrl.trim());
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: { "user-agent": "Pi-Desktop-Knowledge-Studio/1.0" },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location || redirects === 3) throw new Error("网页重定向次数过多");
    url = await assertPublicUrl(new URL(location, url).toString());
  }
  if (!response?.ok) throw new Error(`网页请求失败（HTTP ${response?.status ?? "?"}）`);
  const raw = await readLimitedResponse(response);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const markdownUrl = /\.(?:md|markdown)$/iu.test(url.pathname);
  const format: KnowledgeSourceFormat = contentType.includes("pdf")
    ? "pdf"
    : contentType.includes("html")
      ? "html"
      : contentType.includes("markdown") || markdownUrl
        ? "markdown"
        : "text";
  const extracted = await extractBuffer(raw, format);
  const pageTitle = format === "html" ? htmlTitle(raw.toString("utf8")) : undefined;
  return buildParsed(sourceId, {
    title: title?.trim() || pageTitle || url.hostname,
    kind: "url",
    format,
    sourceUrl: url.toString(),
    content: extracted,
    raw,
  });
}
