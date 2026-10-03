import type { EvaluationReport, EvaluationRow } from "./library-evaluation";

export type EvaluationGroup = "all" | "simple" | "medium" | "hard";
export const evaluationGroups: { id: EvaluationGroup; label: string }[] = [
  { id: "all", label: "总计" }, { id: "simple", label: "简单" },
  { id: "medium", label: "中等" }, { id: "hard", label: "困难" },
];
export function evaluationGroup(row: EvaluationRow): Exclude<EvaluationGroup, "all"> {
  return row.difficulty === "简单" ? "simple" : row.difficulty === "中等" ? "medium" : "hard";
}
export function groupRows(rows: EvaluationRow[], group: EvaluationGroup) {
  return group === "all" ? rows : rows.filter(row => evaluationGroup(row) === group);
}
// Count the returned text as-is. Overlap is deliberately counted again,
// following the UTF-16 character convention of the stored source offsets.
export function returnedCharacters(row: Pick<EvaluationRow, "hits">): number {
  return row.hits.reduce((total, hit) => total + hit.text.length, 0);
}
export function summarizeReturnedCharacters(rows: EvaluationRow[]) {
  const valid = rows.filter(row => row.state === "completed");
  const total = valid.reduce((sum, row) => sum + returnedCharacters(row), 0);
  return { count: valid.length, total, meanChars: valid.length ? total / valid.length : undefined };
}
export function summarizeEvaluation(rows: EvaluationRow[]): EvaluationReport["summary"] {
  const result: EvaluationReport["summary"] = {};
  const valid = rows.filter(row => row.state === "completed");
  for (const key of new Set(valid.flatMap(row => Object.keys(row.stages)))) {
    const scores = valid.map(row => row.stages[key]).filter(Boolean);
    const total = scores.reduce((n, s) => n + s.required, 0), complete = scores.reduce((n, s) => n + s.complete, 0);
    result[key] = {
      total, complete, microRecall: total ? complete / total : 0,
      macroRecall: scores.reduce((n, s) => n + s.recall, 0) / scores.length,
      macroCoverage: scores.reduce((n, s) => n + s.coverage, 0) / scores.length,
      allQuestions: scores.filter(s => s.all).length,
    };
  }
  return result;
}
