import { expect,it } from "vitest";
import batch from "../../../../../resources/smart-library/question-bank/candidates.json";
import { evaluationDataset,EVALUATION_DATASET_ID } from "../../../../../src/main/smart-library/evaluation/dataset";
import type { LibraryQuestion } from "../../../../../src/shared/contracts/library-question-bank";
it("the resident dataset contains only the unchanged 100/50/50 additions with no legacy prefix",()=>{
  const questions=batch.questions as LibraryQuestion[],data=evaluationDataset(questions);
  expect(data.id).toBe(EVALUATION_DATASET_ID);expect(data.questions).toHaveLength(200);
  expect(questions.filter(q=>q.difficulty==="简单")).toHaveLength(100);
  expect(questions.filter(q=>q.difficulty==="中等")).toHaveLength(50);
  expect(questions.filter(q=>q.difficulty==="困难")).toHaveLength(50);
  expect(questions.every(q=>!/^(T|[SMH]00)/.test(q.sample_id)&&q.sample_id!=="S010"&&q.sample_id!=="M010"&&q.sample_id!=="H010")).toBe(true);
  expect(evaluationDataset(questions.slice(0,3)).questions).toHaveLength(3);
  expect(()=>evaluationDataset([])).toThrow(/没有已加入/);
  expect(()=>evaluationDataset([questions[0],questions[0]])).toThrow(/重复/);
  expect(()=>evaluationDataset([{...questions[0],generation:undefined,sample_id:"T001"}])).toThrow(/旧题集/);
});
