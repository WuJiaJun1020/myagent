import type { LibrarySearchHit } from "../../../shared/contracts/smart-library";

export type QueryRoute = { keyword: LibrarySearchHit[]; vector: LibrarySearchHit[]; fused: LibrarySearchHit[] };
const overlaps = (a: LibrarySearchHit, b: LibrarySearchHit) => a.chapter === b.chapter && Math.min(a.end, b.end) - Math.max(a.start, b.start) > .6 * Math.min(a.end - a.start, b.end - b.start);

/** Reserve keyword/vector-only candidates, then fill fairly across query routes. */
export function balancedCandidates(routes: QueryRoute[], limit: number, deduplicate: boolean): LibrarySearchHit[] {
  if (!routes.length || limit < 1) return [];
  const all = new Map<string, LibrarySearchHit>();
  routes.forEach((route, query) => route.fused.forEach((hit, rank) => {
    const existing = all.get(hit.id) ?? { ...hit, queryMatches: [] };
    existing.queryMatches!.push({ query, fusionRank: rank + 1, keywordRank: hit.keywordRank, vectorRank: hit.vectorRank });
    all.set(hit.id, existing);
  }));
  const result: LibrarySearchHit[] = [];
  const order = routes.length > 1 ? [...routes.keys()].slice(1).concat(0) : [0];
  const add = (hit: LibrarySearchHit, query: number) => {
    if (result.length >= limit || result.some(other => other.id === hit.id || (deduplicate && overlaps(other, hit)))) return;
    result.push({ ...all.get(hit.id)!, rerankQuery: query });
  };
  const reserve = Math.max(1, Math.min(4, Math.floor(limit / (routes.length * 2))));
  for (let rank = 0; rank < reserve; rank++) for (const query of order) {
    for (const source of [routes[query].keyword, routes[query].vector]) if (source[rank]) add(source[rank], query);
  }
  const length = Math.max(0, ...routes.map(r => r.fused.length));
  for (let rank = 0; rank < length && result.length < limit; rank++) for (const query of order) {
    const hit = routes[query].fused[rank]; if (hit) add(hit, query);
  }
  return result;
}

/** Per-query scores are never compared directly; take turns using local ranks. */
export function coverageOrder(routes: LibrarySearchHit[][], limit: number, deduplicate: boolean): LibrarySearchHit[] {
  if (!routes.length || limit < 1) return [];
  const result: LibrarySearchHit[] = [];
  const order = routes.length > 1 ? [...routes.keys()].slice(1).concat(0) : [0];
  const length = Math.max(0, ...routes.map(r => r.length));
  for (let rank = 0; rank < length && result.length < limit; rank++) for (const query of order) {
    const hit = routes[query][rank];
    if (!hit || result.length >= limit || result.some(other => other.id === hit.id || (deduplicate && overlaps(other, hit)))) continue;
    result.push({ ...hit, queryRank: rank + 1, selectionReason: `${query === 0 ? "原问题" : `子问题 ${query}`}排名 ${rank + 1}，按要点轮流保留` });
  }
  return result;
}
