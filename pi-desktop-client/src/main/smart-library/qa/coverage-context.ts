import type { LibraryQaCitation, LibrarySearchResult, LibraryRetrievalPlan } from "../../../shared/contracts/smart-library";
import type { RagPipelineOptions } from "./rag-pipeline";

type Group = { chapter: number; start: number; end: number; citation: LibraryQaCitation };

function merge(groups: Group[], primary: Group): Group {
  const sorted = [...groups].sort((a, b) => a.start - b.start);
  const start = sorted[0].start; let end = start, text = "";
  for (const part of sorted) {
    const overlap = Math.max(0, Math.min(end, part.end) - part.start);
    if (part.start > end || text.slice(part.start - start, part.start - start + overlap) !== part.citation.excerpt.text.slice(0, overlap)) throw Error("待合并的原文上下文不一致");
    if (part.end > end) text += part.citation.excerpt.text.slice(overlap);
    end = Math.max(end, part.end);
  }
  const shift = primary.start - start;
  return { chapter: primary.chapter, start, end, citation: { ...primary.citation,
    reference: { ...primary.citation.reference, contextSpan: { start, end } },
    sourceIds: [...new Set(groups.flatMap(g => g.citation.sourceIds ?? [g.citation.reference.id]))],
    excerpt: { ...primary.citation.excerpt, text, highlight: { start: primary.citation.excerpt.highlight.start + shift, end: primary.citation.excerpt.highlight.end + shift } },
  } };
}

export async function coverageContexts(options: RagPipelineOptions, search: LibrarySearchResult, warnings: string[]): Promise<LibraryQaCitation[]> {
  let groups: Group[] = [], characters = 0;
  const decisions: NonNullable<LibraryRetrievalPlan["contexts"]> = [];
  if (search.plan) search.plan.contexts = decisions;
  for (const hit of search.hits) {
    options.signal.throwIfAborted();
    const reference = { version: search.version, id: hit.id, profileId: options.profile.id, readingPage: options.readingPage, readingStartPage: options.readingStartPage };
    const excerpt = await options.evidence(reference, options.profile.context.expandChars);
    if (excerpt.text.slice(excerpt.highlight.start, excerpt.highlight.end) !== hit.text) throw Error("上下文与检索片段不一致");
    const start = hit.start - excerpt.highlight.start, end = start + excerpt.text.length;
    const incoming: Group = { chapter: hit.chapter, start, end, citation: { number: 0, reference: { ...reference, contextSpan: { start, end } }, excerpt, sourceIds: [hit.id] } };
    const touching = options.profile.context.deduplicate ? groups.filter(g => g.chapter === hit.chapter && g.start <= end && g.end >= start) : [];
    if (!touching.length && groups.length >= options.profile.context.chunks) { decisions.push({ id: hit.id, decision: "limit", reason: "已达到回答证据数量上限" }); continue; }
    const combined = touching.length ? merge([...touching, incoming], touching[0]) : incoming;
    const nextCharacters = characters - touching.reduce((sum, g) => sum + g.citation.excerpt.text.length, 0) + combined.citation.excerpt.text.length;
    if (nextCharacters > options.profile.context.maxChars) { decisions.push({ id: hit.id, decision: "budget", reason: "超过原文字符预算，继续尝试后续片段" }); continue; }
    if (touching.length) {
      const position = groups.indexOf(touching[0]); groups = groups.filter(g => !touching.includes(g)); groups.splice(position, 0, combined);
    } else groups.push(incoming);
    characters = nextCharacters;
    decisions.push({ id: hit.id, decision: touching.length ? "merged" : "included", reason: touching.length ? "与同章节相邻原文合并，共用引用与字符预算" : hit.selectionReason ?? "按要点保留" });
  }
  if (decisions.some(d => d.decision === "budget")) warnings.push("原文上下文达到该方案的字符预算，部分片段未加入。");
  return groups.map((g, i) => ({ ...g.citation, number: i + 1 }));
}
