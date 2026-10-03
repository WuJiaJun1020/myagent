import type { EvaluationSpan } from "./library-evaluation";

export function evidenceOverlaps(hit: EvaluationSpan, gold: { id: string; span: EvaluationSpan }[]) {
  const matches = gold.filter(e => e.span.chapter === hit.chapter && e.span.start < hit.end && e.span.end > hit.start);
  const points = [...new Set([0, hit.end - hit.start, ...matches.flatMap(e => [Math.max(0, e.span.start - hit.start), Math.min(hit.end - hit.start, e.span.end - hit.start)])])].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, i) => ({ start, end: points[i + 1], ids: matches.filter(e => e.span.start < hit.start + points[i + 1] && e.span.end > hit.start + start).map(e => e.id) }));
}
