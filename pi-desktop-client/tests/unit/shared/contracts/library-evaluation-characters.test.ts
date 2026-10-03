import { expect, it } from "vitest";
import type { EvaluationRow } from "../../../../src/shared/contracts/library-evaluation";
import { groupRows, returnedCharacters, summarizeReturnedCharacters } from "../../../../src/shared/contracts/library-evaluation-metrics";

function row(texts: string[], state: EvaluationRow["state"] = "completed", difficulty = "简单") {
  return { state, difficulty, hits: texts.map(text => ({ text })) } as EvaluationRow;
}

it("counts returned UTF-16 text including overlapping passages and whitespace", () => {
  // These passages overlap; the repeated 乙 is still part of both returns.
  expect(returnedCharacters(row(["甲乙", "乙丙🐱", "\n "]))).toBe(8);
  expect(returnedCharacters(row([]))).toBe(0);
});

it("averages successful questions, including empty returns, within the chosen difficulty", () => {
  const rows = [row(["甲乙", "乙丙🐱"]), row([]), row(["失败原文"], "failed"), row(["困难题原文"], "completed", "困难")];
  expect(summarizeReturnedCharacters(groupRows(rows, "simple"))).toEqual({ count: 2, total: 6, meanChars: 3 });
  expect(summarizeReturnedCharacters(groupRows(rows, "hard"))).toEqual({ count: 1, total: 5, meanChars: 5 });
  expect(summarizeReturnedCharacters(groupRows(rows, "medium"))).toEqual({ count: 0, total: 0, meanChars: undefined });
  expect(summarizeReturnedCharacters([row(["失败"], "failed")]).meanChars).toBeUndefined();
});
