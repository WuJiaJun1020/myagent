import { describe, expect, it } from "vitest";
import { scoreEvidence, summarize } from "../../../../../src/main/smart-library/evaluation/scoring";
import type { EvaluationRow } from "../../../../../src/shared/contracts/library-evaluation";
import { groupRows, evaluationGroup } from "../../../../../src/shared/contracts/library-evaluation-metrics";

describe("evidence recall", () => {
  const gold = [{ id: "e1", span: { chapter: 0, start: 10, end: 20 } }];
  it("unions overlapping and adjacent chunks without double counting", () => {
    const score = scoreEvidence(gold, [
      { chapter: 0, start: 8, end: 15 },
      { chapter: 0, start: 12, end: 18 },
      { chapter: 0, start: 18, end: 30 },
    ]);
    expect(score).toMatchObject({ complete: 1, recall: 1, coverage: 1, all: true });
  });
  it("keeps partial coverage separate from complete recall and respects chapter identity", () => {
    expect(scoreEvidence(gold, [
      { chapter: 0, start: 10, end: 14 },
      { chapter: 0, start: 16, end: 20 },
      { chapter: 1, start: 10, end: 20 },
    ])).toMatchObject({ complete: 0, recall: 0, coverage: 0.8, all: false });
  });
  it("does not punish excess retrieved context as IoU would", () => {
    expect(scoreEvidence(gold, [{ chapter: 0, start: 0, end: 1000 }]).recall).toBe(1);
    expect(scoreEvidence(gold, []).coverage).toBe(0);
    expect(scoreEvidence([...gold, { id: "optional", required: false, span: { chapter: 0, start: 50, end: 60 } }], []).required).toBe(1);
  });
  it("distinguishes evidence-weighted and question-average recall, excluding failures", () => {
    const row = (id: string, state: EvaluationRow["state"], score: ReturnType<typeof scoreEvidence>): EvaluationRow => ({ id, state, question: "q", difficulty: "simple", elapsedMs: 1, warnings: [], hits: [], gold: [], stages: { raw8: score } });
    const a = scoreEvidence(gold, [{ chapter: 0, start: 10, end: 20 }]);
    const b = scoreEvidence(Array.from({ length: 3 }, (_, i) => ({ id: `b${i}`, span: { chapter: 0, start: i * 10, end: i * 10 + 5 } })), []);
    expect(summarize([row("a", "completed", a), row("b", "completed", b), row("failure", "failed", b)]).raw8).toMatchObject({ total: 4, complete: 1, microRecall: 0.25, macroRecall: 0.5, allQuestions: 1 });
  });
  it("combines high and extreme questions into hard without mixing simple and medium", () => {
    const rows = ["简单", "中等", "高", "超难"].map((difficulty, i) => ({ id: String(i), difficulty } as EvaluationRow));
    expect(rows.map(evaluationGroup)).toEqual(["simple", "medium", "hard", "hard"]);
    expect(groupRows(rows, "all")).toHaveLength(4);
    expect(groupRows(rows, "hard").map(row => row.id)).toEqual(["2", "3"]);
  });
});
