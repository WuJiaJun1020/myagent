import { describe, expect, it } from "vitest";
import { balancedCandidates, coverageOrder, type QueryRoute } from "../../../../../src/main/smart-library/retrieval/coverage";
import { fuse } from "../../../../../src/main/smart-library/retrieval/ranking";
import type { LibrarySearchHit } from "../../../../../src/shared/contracts/smart-library";
const hit = (id: string, chapter = Number(id), start = 0): LibrarySearchHit => ({ id, chapter, ordinal: Number(id), title: "章", start, end: start + 100, text: "原文" });
const route = (keyword: LibrarySearchHit[], vector: LibrarySearchHit[]): QueryRoute => ({ keyword, vector, fused: fuse(keyword, vector) });
describe("query-aware evidence coverage", () => {
  it("keeps single-source facts and reserves candidates for each subquestion", () => {
    const routes = [route([hit("0")],[hit("0")]), route([hit("1"),hit("2")],[hit("3")]), route([hit("4")],[hit("5")])];
    const pool = balancedCandidates(routes,6,true);
    expect(new Set(pool.map(h=>h.id))).toEqual(new Set(["0","1","2","3","4","5"]));
    expect(pool).toHaveLength(6);expect(pool.every(h=>h.queryMatches?.length && h.rerankQuery!==undefined)).toBe(true);
  });
  it("deduplicates shared source IDs, retains provenance, and optionally filters overlapping windows", () => {
    const shared=hit("1",0),overlap=hit("2",0,10);
    const routes=[route([shared],[overlap]),route([shared],[shared])];
    const pool=balancedCandidates(routes,8,true);expect(pool).toHaveLength(1);expect(pool[0].queryMatches?.map(m=>m.query)).toEqual([0,1]);
    expect(balancedCandidates(routes,8,false)).toHaveLength(2);
  });
  it("uses per-query ranks instead of comparing incompatible scores across queries", () => {
    const routes=[[{...hit("0"),rerankScore:.99}],[{...hit("1"),rerankScore:.001},{...hit("2"),rerankScore:.0001}],[{...hit("3"),rerankScore:.2}]];
    const selected=coverageOrder(routes,3,true);
    expect(selected.map(h=>h.id)).toEqual(["1","3","0"]);expect(selected.every(h=>h.selectionReason?.includes("按要点"))).toBe(true);
    expect(coverageOrder(routes,10,true)).toHaveLength(4);expect(coverageOrder([],10,true)).toEqual([]);
  });
});
