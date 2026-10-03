import { describe, expect, it } from "vitest";
import { summarizeEvaluationTimings } from "../../../../src/shared/contracts/library-evaluation-timings";
import { groupRows } from "../../../../src/shared/contracts/library-evaluation-metrics";
import type { EvaluationRow } from "../../../../src/shared/contracts/library-evaluation";

const row = (id: string, elapsedMs: number, extra: Partial<EvaluationRow> = {}): EvaluationRow => ({
  id, question: "问题", difficulty: "简单", state: "completed", elapsedMs, warnings: [], stages: {}, hits: [], gold: [], ...extra,
});
describe("evaluation latency statistics", () => {
  it("uses nearest-rank percentiles, excludes failures, and leaves the input order intact", () => {
    const rows = [row("c", 300), row("a", 100), row("b", 200), row("failure", 90000, { state: "failed" })];
    expect(summarizeEvaluationTimings(rows).totalMs).toEqual({ count: 3, meanMs: 200, p50Ms: 200, p95Ms: 300 });
    expect(rows.map(r => r.id)).toEqual(["c", "a", "b", "failure"]);
    expect(summarizeEvaluationTimings(Array.from({ length: 100 }, (_, i) => row(String(i), i + 1))).totalMs?.p95Ms).toBe(95);
  });
  it("does not substitute zero for missing timings in historical reports", () => {
    const stats = summarizeEvaluationTimings([row("old", 1000), row("new", 2000, { timings: { embeddingMs: 20, rerankMs: 800, fusionMs: 0 } })]);
    expect(stats.totalMs?.count).toBe(2);
    expect(stats.rerankMs).toEqual({ count: 1, meanMs: 800, p50Ms: 800, p95Ms: 800 });
    expect(stats.fusionMs?.meanMs).toBe(0);
    expect(stats.vectorMs).toBeUndefined();
    expect(summarizeEvaluationTimings([])).toEqual({});
  });
  it("filters invalid timings and summarizes the selected difficulty independently", () => {
    const rows = [row("simple", 100, { timings: { rerankMs: NaN, embeddingMs: -1 } }), row("hard", 900, { difficulty: "困难", timings: { rerankMs: 700 } }), row("bad", Infinity)];
    expect(summarizeEvaluationTimings(rows).totalMs?.meanMs).toBe(500);
    expect(summarizeEvaluationTimings(rows).rerankMs?.count).toBe(1);
    expect(summarizeEvaluationTimings(rows).embeddingMs).toBeUndefined();
    expect(summarizeEvaluationTimings(groupRows(rows, "hard")).totalMs?.meanMs).toBe(900);
  });
});
