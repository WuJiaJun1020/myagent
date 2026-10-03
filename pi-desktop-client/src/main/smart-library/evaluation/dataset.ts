import type { LibraryQuestion } from "../../../shared/contracts/library-question-bank";

export const EVALUATION_DATASET_ID="fanren-resident-v2";
export function evaluationDataset(questions:LibraryQuestion[]) {
  if(!questions.length)throw Error("没有已加入评测的题目，请在题库中加入后重试");
  if(new Set(questions.map(q=>q.sample_id)).size!==questions.length)throw Error("评测题目编号重复");
  if(questions.some(q=>q.generation!=="fanren-expansion-v2"))throw Error("旧题集已停用，请使用常驻评测题集");
  return {id:EVALUATION_DATASET_ID,questions,note:"常驻题集：简单100题、中等50题、困难50题。按当前已加入评测的题目快照运行；逐题独立、无对话历史，不生成回答。标注证据完整覆盖才算命中，报告中的题数反映本次实际快照。"};
}
