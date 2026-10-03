import type { EvaluationRow, EvaluationTimings } from "./library-evaluation";

export type EvaluationTimingKey = "totalMs" | keyof EvaluationTimings;
export type TimingStatistics = { count: number; meanMs: number; p50Ms: number; p95Ms: number };
export const evaluationTimingLabels: Record<EvaluationTimingKey, string> = {
  totalMs: "单题总耗时", retrievalMs: "检索合计", setupMs: "检索准备", keywordMs: "关键词检索",
  embeddingMs: "问题向量化", vectorMs: "向量查询与读取", fusionMs: "融合与去重",
  rewriteMs: "问题改写", rerankMs: "重排", contextMs: "原文上下文组装", scoringMs: "证据计分",
};

export function summarizeEvaluationTimings(rows: EvaluationRow[]): Partial<Record<EvaluationTimingKey, TimingStatistics>> {
  const result: Partial<Record<EvaluationTimingKey, TimingStatistics>> = {};
  const valid = rows.filter(row => row.state === "completed");
  for (const key of Object.keys(evaluationTimingLabels) as EvaluationTimingKey[]) {
    const values = valid.map(row => key === "totalMs" ? row.elapsedMs : row.timings?.[key])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0)
      .sort((a, b) => a - b);
    if (!values.length) continue;
    const percentile = (p: number) => values[Math.ceil(values.length * p) - 1];
    result[key] = { count: values.length, meanMs: values.reduce((sum, value) => sum + value, 0) / values.length, p50Ms: percentile(.5), p95Ms: percentile(.95) };
  }
  return result;
}
