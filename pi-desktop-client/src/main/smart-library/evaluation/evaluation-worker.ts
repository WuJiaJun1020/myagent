import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { evaluationDataset } from "./dataset";
import type { LibraryQuestion } from "../../../shared/contracts/library-question-bank";
import { LibraryRetrieval } from "../retrieval/retrieval";
import { mapChapters, mapEvidence } from "./source-map";
import { scoreEvidence, summarize } from "./scoring";
import type { EvaluationReport, EvaluationRow, EvaluationStatus, EvaluationSpan } from "../../../shared/contracts/library-evaluation";
import type { LibraryLocalModels, LibrarySearchHit } from "../../../shared/contracts/smart-library";

import { runRagEvidence } from "../qa/rag-pipeline";
import { defaultStrategyProfile } from "../../../shared/contracts/library-strategy";
import { validateStrategyProfile } from "../strategies/profile-store";
import type { ModelRequest } from "../../../platform/shared/ai/model-gateway";
import type { LibraryQaDebugCall } from "../../../shared/contracts/smart-library";

const {root,book,settings,questions=[],indexRoot=root,runId,model}=workerData;
const profile=validateStrategyProfile(workerData.profile??defaultStrategyProfile(settings));
const dataset=evaluationDataset(questions);
let stopped=false,token="",retrieval:LibraryRetrieval|undefined;
const controller=new AbortController();
const pending=new Map<string,{resolve:(value:any)=>void;reject:(reason:Error)=>void}>();
parentPort!.on("message",message=>{
  if(message?.kind==="model-response"){const call=pending.get(message.id);if(call){pending.delete(message.id);call.resolve({...message.trace,...(message.error?{error:message.error}:{})});}return;}
  stopped=true;controller.abort();if(token)retrieval?.cancel(book,token);
  for(const call of pending.values())call.reject(Error("评测已停止"));pending.clear();
});
async function generate(request:ModelRequest,trace:LibraryQaDebugCall){
  const id=randomUUID();let timer:ReturnType<typeof setTimeout>|undefined;
  try{const result=await new Promise<LibraryQaDebugCall>((resolve,reject)=>{pending.set(id,{resolve,reject});timer=setTimeout(()=>{pending.delete(id);reject(Error("问题处理超时"));},50000);parentPort!.postMessage({kind:"model-request",id,request});});Object.assign(trace,result);if(result.error)throw Error(result.error);return result.response!;}finally{clearTimeout(timer);pending.delete(id);}
}
const sha=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");
let report:EvaluationReport|undefined;
const publish=(state:EvaluationStatus["state"],current?:string,error?:string)=>parentPort!.postMessage({state,total:dataset.questions.length,completed:report?.rows.length??0,current,error,report} satisfies EvaluationStatus);
void (async()=>{
  let db:DatabaseSync|undefined;
  const startedAt=Date.now();
  const preparationStarted=performance.now();
  try {
    publish("running","正在校验原文与索引坐标…");
    if(!/^[a-f0-9]{64}$/.test(book)||dataset.questions.some(q=>q.source_sha256.toLowerCase()!==book))throw Error("这批样题只适用于相同 SHA-256 的《凡人修仙传》原文，请选择对应图书");
    const bytes=await readFile(join(root,book,"original.txt"));if(sha(bytes)!==book)throw Error("原始图书校验失败");
    const raw=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
    db=new DatabaseSync(join(indexRoot,"indexes.sqlite"),{readOnly:true});
    const row=db.prepare("SELECT j.data FROM active a JOIN jobs j ON j.version=a.version WHERE a.book=? AND j.book=?").get(book,book);
    const job=row&&JSON.parse(String(row.data));if(!job||job.state!=="ready")throw Error("请先完成本书索引，评测不会自动重建");
    const canonical=db.prepare("SELECT chapter,text FROM chapters WHERE book=? AND source=? ORDER BY chapter").all(book,job.source).map(c=>({chapter:Number(c.chapter),text:String(c.text)}));
    const chapters=mapChapters(raw,canonical);
    const gold=dataset.questions.map(q=>q.evidence.map(e=>({id:e.evidence_id,quote:e.quote,supports:e.supports,required:e.required,span:mapEvidence(raw,chapters,e)})));
    report={schema:1,dataset:dataset.id,datasetHash:sha(JSON.stringify(dataset)),note:dataset.note,book,version:job.version,source:job.source,indexModel:job.model,revision:job.revision,settings,runId,profile,stageLimits:{keyword40:profile.retrieval.keywordCandidates,vector40:profile.retrieval.vectorCandidates,fused16:profile.retrieval.fusionCandidates,reranked16:profile.retrieval.fusionCandidates,raw3:Math.min(3,profile.retrieval.returnedChunks),raw6:Math.min(6,profile.retrieval.returnedChunks),raw8:profile.retrieval.returnedChunks,expanded6:profile.context.chunks},startedAt,preparationMs:performance.now()-preparationStarted,rows:[],summary:{}};
    retrieval=new LibraryRetrieval(db,indexRoot,root);
    const spans=(hits:LibrarySearchHit[]):EvaluationSpan[]=>hits.map(h=>({chapter:h.chapter,start:h.start,end:h.end}));
    for(const [i,q] of dataset.questions.entries()) {
      if(stopped)break;token=randomUUID();publish("running",q.sample_id);
      const started=performance.now();const result:EvaluationRow={id:q.sample_id,question:q.question,difficulty:q.difficulty,answer:q.answer,reasoning:q.reasoning,state:"completed",elapsedMs:0,warnings:[],stages:{},hits:[],gold:gold[i]};
      try {
        const version=db.prepare("SELECT version FROM active WHERE book=?").get(book)?.version;
        if(version!==job.version)throw Error("索引在评测期间发生变化，请重新测试");
        const pipeline=await runRagEvidence({profile,question:q.question,token,history:[],model,reasoning:profile.answer.reasoning,signal:controller.signal,version:job.version,
          search:input=>retrieval!.search(book,input,settings,true,profile),
          evidence:(reference,expandChars)=>retrieval!.evidence(book,reference,{locatePage:false,expandChars}),
          generate:async(request,trace)=>{(result.debug??=[]).push(trace);return generate(request,trace);},
        });
        const found=pipeline.search;result.query=pipeline.query;result.debug=pipeline.debug;
        result.timings={...found.timings,retrievalMs:found.elapsedMs,rewriteMs:pipeline.rewriteMs,contextMs:pipeline.contextMs};
        if(found.version!==job.version)throw Error("索引版本变化");
        result.hits=found.hits;result.usedContext=pipeline.citations.flatMap(c=>c.sourceIds??[c.reference.id]);result.warnings=pipeline.warnings;
        if(found.plan){result.retrievalPlan=found.plan;result.contexts=pipeline.citations;}
        if(pipeline.warnings.some(w=>w.includes("已降级")||w.startsWith("重排不可用")||w.startsWith("追问改写失败")||w.startsWith("检索规划失败")))throw Error("当前策略发生降级，不能当作完整混合检索结果："+pipeline.warnings.join("；"));
        const trace=found.diagnostics!;
        const pools={...(profile.retrieval.mode!=="vector"?{keyword40:trace.keyword}:{}),...(profile.retrieval.mode!=="keyword"?{vector40:trace.vector}:{}),fused16:trace.fused,...(profile.retrieval.rerank?{reranked16:trace.reranked}:{}),raw3:found.hits.slice(0,3),raw6:found.hits.slice(0,6),raw8:found.hits};
        const scoringStarted=performance.now();
        for(const [key,hits] of Object.entries(pools))result.stages[key]=scoreEvidence(gold[i],spans(hits));
        result.timings.scoringMs=performance.now()-scoringStarted;
        const expanded:EvaluationSpan[]=[];
        for(const citation of pipeline.citations) {
          const hit=found.hits.find(h=>h.id===citation.reference.id)!,evidence=citation.excerpt;
          const start=hit.start-evidence.highlight.start;
          expanded.push({chapter:hit.chapter,start,end:start+evidence.text.length});
        }
        if(stopped)break;
        const expandedScoringStarted=performance.now();
        result.stages.expanded6=scoreEvidence(gold[i],expanded);
        result.timings.scoringMs+=performance.now()-expandedScoringStarted;
      }catch(e){if(stopped)break;result.state="failed";result.error=e instanceof Error?e.message:String(e);}
      result.elapsedMs=performance.now()-started;report.rows.push(result);report.summary=summarize(report.rows);publish("running");
    }
    report.finishedAt=Date.now();publish(stopped?"stopped":"completed");
  }catch(e){publish(stopped?"stopped":"failed",undefined,e instanceof Error?e.message:String(e));}
  finally{db?.close();parentPort?.close();}
})();
