import type { LibrarySearchHit } from "../../../shared/contracts/smart-library";
import { safeBoundary } from "../indexing/chunks";

// Prefer bigrams for Chinese names, while retaining single characters and Latin words.
export function queryTerms(query: string): string[] {
  const words = query.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.flatMap(word => {
    const chars = Array.from(word);
    return chars.length === 1 ? chars : chars.slice(0, -1).map((c, i) => c + chars[i + 1]);
  }))].slice(0, 160);
}
export function ftsQuery(query: string) { return queryTerms(query).map(t => `"${t.replaceAll('"', '""')}"`).join(" OR "); }
export function fuse(keyword: LibrarySearchHit[], vector: LibrarySearchHit[], rrfK = 60) {
  const items = new Map<string, LibrarySearchHit & { fused: number }>();
  for (const [list, field] of [[keyword, "keywordRank"], [vector, "vectorRank"]] as const) list.forEach((hit, i) => {
    const row = items.get(hit.id) ?? { ...hit, fused: 0 };
    row[field] = i + 1; row.fused += 1 / (rrfK + i + 1); items.set(hit.id, row);
  });
  return [...items.values()].sort((a, b) => b.fused - a.fused || a.ordinal - b.ordinal);
}
export function distinct<T extends LibrarySearchHit>(hits: T[], limit: number): T[] {
  const result: T[] = [];
  for (const hit of hits) {
    if (result.some(other => other.chapter === hit.chapter && Math.min(other.end, hit.end) - Math.max(other.start, hit.start) > .6 * Math.min(hit.end - hit.start, other.end - other.start))) continue;
    result.push(hit); if (result.length === limit) break;
  }
  return result;
}
export function windows(text: string, size = 64, overlap = 16): string[] {
  const result: string[] = [];
  for (let start = 0; start < text.length;) {
    const end = safeBoundary(text, Math.min(text.length, start + size));
    result.push(text.slice(start, end)); if (end === text.length) break;
    start = safeBoundary(text, end - overlap);
  }
  return result;
}
