import type { EvaluationSpan, EvaluationScore } from "../../../shared/contracts/library-evaluation";
export { summarizeEvaluation as summarize } from "../../../shared/contracts/library-evaluation-metrics";

export function scoreEvidence(gold: { id: string; span: EvaluationSpan; required?: boolean }[], retrieved: EvaluationSpan[]): EvaluationScore {
  const evidence = gold.filter(e => e.required !== false).map(e => {
    const parts = retrieved.filter(r => r.chapter === e.span.chapter).map(r => ({ start: Math.max(r.start,e.span.start), end: Math.min(r.end,e.span.end) })).filter(r => r.end>r.start).sort((a,b)=>a.start-b.start);
    let covered=0, end=e.span.start;
    for (const part of parts) { covered+=Math.max(0,part.end-Math.max(end,part.start));end=Math.max(end,part.end); }
    const size=e.span.end-e.span.start;
    if(size<=0)throw Error("标准证据范围为空");
    return { id:e.id, complete:covered===size, coverage:covered/size };
  });
  const complete=evidence.filter(e=>e.complete).length, required=evidence.length;
  return { required, complete, recall:required?complete/required:0, coverage:required?evidence.reduce((n,e)=>n+e.coverage,0)/required:0, all:required>0&&complete===required, evidence };
}
