import { Worker } from "node:worker_threads";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { LibraryLocalModels, LibraryQaDebugCall } from "../../../shared/contracts/smart-library";
import type { EvaluationStatus, EvaluationReference, EvaluationOptions, EvaluationRunSummary } from "../../../shared/contracts/library-evaluation";
import type { LibraryQuestion } from "../../../shared/contracts/library-question-bank";
import { defaultStrategyProfile, type LibraryStrategyProfile } from "../../../shared/contracts/library-strategy";
import type { ModelGateway, ModelRequest } from "../../../platform/shared/ai/model-gateway";
import { evaluationDataset, EVALUATION_DATASET_ID } from "./dataset";
import { summarizeReturnedCharacters } from "../../../shared/contracts/library-evaluation-metrics";

export class LibraryEvaluationService {
  private worker?: Worker;
  private book = "";
  private profileId = "standard-rag";
  private state: EvaluationStatus = {state:"idle",completed:0,total:0};
  private writes = Promise.resolve();
  private batch?: Promise<void>;
  private controller?: AbortController;
  private legacyCharacterCounts = new Map<string, Promise<number | undefined>>();
  constructor(private root: string, private gateway?: ModelGateway) {}
  isBusy() { return !!this.batch; }
  private directory(book:string) { if(!/^[a-f0-9]{64}$/.test(book))throw Error("图书标识无效");return join(this.root,"evaluation",book); }
  private latestName(profileId:string) { if(!/^[\w-]{1,100}$/.test(profileId))throw Error("策略标识无效");return profileId==="standard-rag"?"latest.json":`${profileId}.json`; }
  async runs(book:string): Promise<EvaluationRunSummary[]> {
    await this.writes;
    try {
      const directory=this.directory(book);
      const runs:EvaluationRunSummary[]=JSON.parse(await readFile(join(directory,"runs.json"),"utf8"));
      // Legacy reports already contain all returned passages. Read each only
      // once per service lifetime, retaining numbers rather than book excerpts.
      for (const run of runs) {
        if (run.meanReturnedChars !== undefined || !/^[a-f0-9-]{36}$/.test(run.runId)) continue;
        const key=`${book}:${run.runId}`;
        if (!this.legacyCharacterCounts.has(key)) this.legacyCharacterCounts.set(key,(async()=>{
          try {
            const saved:EvaluationStatus=JSON.parse(await readFile(join(directory,"runs",`${run.runId}.json`),"utf8"));
            const report=saved.report;
            if (!report || report.book!==book || report.runId!==run.runId || report.datasetHash!==run.datasetHash) return undefined;
            return summarizeReturnedCharacters(report.rows).meanChars;
          } catch { return undefined; } // Unknown measurements stay blank, never zero.
        })());
        run.meanReturnedChars=await this.legacyCharacterCounts.get(key)!;
      }
      return runs;
    }
    catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;return [];}
  }
  async reference(book:string,ref:EvaluationReference) {
    const report=(await this.action(book,"status",undefined,[],undefined,{profileId:ref?.profileId,runId:ref?.runId})).report;
    if(!report||report.book!==book||!ref||ref.version!==report.version)throw Error("评测报告已变化，请重新打开详情");
    const row=report.rows.find(r=>r.id===ref.question);if(!row)throw Error("评测题目不存在");
    const metadata={version:report.version,source:report.source,...(report.profile?{profileId:report.profile.id}:{})};
    if(ref.kind==="gold"){const evidence=row.gold.find(e=>e.id===ref.id);if(!evidence)throw Error("标准证据不存在");return {...metadata,...evidence.span};}
    if(ref.kind==="hit"){const hit=row.hits.find(h=>h.id===ref.id);if(!hit)throw Error("召回引用不存在");return {...metadata,chapter:hit.chapter,start:hit.start,end:hit.end};}
    throw Error("引用类型无效");
  }
  private persist(book:string,state:EvaluationStatus) {
    if(!state.report)return this.writes;
    const snapshot=structuredClone({...state,comparison:undefined}),report=snapshot.report!,json=JSON.stringify(snapshot);
    const operation=this.writes.then(async()=>{
      const dir=this.directory(book);await mkdir(join(dir,"runs"),{recursive:true});
      const file=join(dir,this.latestName(report.profile?.id??"standard-rag"));await writeFile(file+".tmp",json);await rename(file+".tmp",file);
      if(report.runId){await writeFile(join(dir,"runs",`${report.runId}.json`),json);
        let summaries:EvaluationRunSummary[]=[];try{summaries=JSON.parse(await readFile(join(dir,"runs.json"),"utf8"));}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
        const successful=report.rows.filter(r=>r.state==="completed"),score=report.summary.expanded6;
        const item:EvaluationRunSummary={runId:report.runId,profileId:report.profile?.id??"standard-rag",name:report.profile?.name??"普通 RAG",revision:report.profile?.revision??1,startedAt:report.startedAt,state:snapshot.state,datasetHash:report.datasetHash,completed:snapshot.completed,total:snapshot.total,failed:report.rows.filter(r=>r.state==="failed").length,recall:score?.microRecall??0,coverage:score?.macroCoverage??0,meanMs:successful.length?successful.reduce((sum,r)=>sum+r.elapsedMs,0)/successful.length:0};
        item.meanReturnedChars=summarizeReturnedCharacters(report.rows).meanChars;
        summaries=[item,...summaries.filter(s=>s.runId!==item.runId)];const manifest=join(dir,"runs.json");await writeFile(manifest+".tmp",JSON.stringify(summaries));await rename(manifest+".tmp",manifest);
      }
    });
    this.writes=operation.catch(()=>{if(this.book===book)this.state={...this.state,error:"评测报告保存失败，请先导出当前报告"};});return this.writes;
  }
  async action(book:string,action:"status"|"start"|"stop",settings?:LibraryLocalModels,questions:LibraryQuestion[]=[],profile?:LibraryStrategyProfile,options:EvaluationOptions={}) : Promise<EvaluationStatus> {
    this.directory(book);
    const profileId=options.profileId??profile?.id??"standard-rag";
    this.latestName(profileId);
    if(action==="stop"){if(this.book===book){this.controller?.abort();this.worker?.postMessage({kind:"stop"});}return this.state;}
    if(action==="status"){
      if(!options.runId && this.book===book && (this.profileId===profileId || (!options.profileId && this.state.comparison) || this.batch))return this.state;
      await this.writes;
      let file=join(this.directory(book),this.latestName(profileId));
      if(options.runId){if(!/^[a-f0-9-]{36}$/.test(options.runId))throw Error("报告标识无效");file=join(this.directory(book),"runs",`${options.runId}.json`);}
      try { const saved=JSON.parse(await readFile(file,"utf8")) as EvaluationStatus;
        if(saved.report&&saved.report.dataset!==EVALUATION_DATASET_ID)return {state:"idle",completed:0,total:0,notice:"旧题集已停用，历史报告保留在本地。请重新评测当前常驻题集。"};return saved;
      }catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;return {state:"idle",completed:0,total:0};}
    }
    if(action!=="start"||!settings)throw Error("评测操作无效");if(this.batch)throw Error("已有评测正在进行，请先停止或等待完成");
    evaluationDataset(questions);
    const snapshot=structuredClone(profile??defaultStrategyProfile(settings));
    this.book=book;this.profileId=snapshot.id;this.controller=new AbortController();this.state={state:"running",completed:0,total:questions.length};
    const controller=this.controller;
    this.batch=this.runOne(book,questions,snapshot,controller.signal).catch(e=>{this.state={...this.state,state:controller.signal.aborted?"stopped":"failed",error:String(e)};}).finally(()=>{this.batch=undefined;});
    return this.state;
  }
  async compare(book:string,questions:LibraryQuestion[],profiles:LibraryStrategyProfile[]) {
    if(!profiles.length||profiles.length>16||new Set(profiles.map(p=>p.id)).size!==profiles.length)throw Error("请选择 1–16 个不同方案");
    if(this.batch)throw Error("已有评测正在进行");this.directory(book);evaluationDataset(questions);
    const snapshots=structuredClone(profiles);this.controller=new AbortController();const signal=this.controller.signal;
    this.book=book;this.profileId=snapshots[0].id;this.state={state:"running",completed:0,total:questions.length,comparison:{total:snapshots.length,completed:0,currentProfile:snapshots[0].name}};
    this.batch=(async()=>{for(const [i,profile] of snapshots.entries()){if(signal.aborted)break;this.profileId=profile.id;await this.runOne(book,questions,profile,signal,{total:snapshots.length,completed:i,currentProfile:profile.name});} if(this.state.comparison)this.state.comparison.completed=signal.aborted?this.state.comparison.completed:snapshots.length;if(signal.aborted)this.state.state="stopped";})().catch(e=>{this.state={...this.state,state:signal.aborted?"stopped":"failed",error:String(e)};}).finally(()=>{this.batch=undefined;});
    return this.state;
  }
  private async runOne(book:string,questions:LibraryQuestion[],profile:LibraryStrategyProfile,signal:AbortSignal,comparison?:EvaluationStatus["comparison"]):Promise<void> {
    this.state={state:"running",completed:0,total:questions.length,comparison};
    const model=profile.answer.model??await this.gateway?.getConfiguredModel?.();
    if(signal.aborted){this.state.state="stopped";return;}
    const worker=this.worker=new Worker(join(__dirname,"library-evaluation.cjs"),{workerData:{root:this.root,indexRoot:profile.id==="standard-rag"?this.root:join(this.root,"strategy-indexes",profile.id),book,settings:profile.localModels,questions,profile,model,runId:randomUUID()}});
    await new Promise<void>(resolve=>{
      worker.on("message",(message:EvaluationStatus|{kind:"model-request";id:string;request:ModelRequest})=>{
        if(this.worker!==worker)return;
        if("kind" in message && message.kind==="model-request"){
          const trace:LibraryQaDebugCall={purpose:message.request.metadata.purpose==="plan_book_retrieval"?"检索规划":"追问改写",request:message.request};
          void (async()=>{try{if(!this.gateway)throw Error("模型网关不可用");const result=await this.gateway.generate(message.request,{signal,onPreparedRequest:p=>{trace.prepared=p;},onResponseDiagnostics:r=>{trace.response=r.text;trace.usage=r.usage;}});if(!result.ok)throw Error(result.error.message);trace.response=result.value.text;trace.usage=result.value.usage;worker.postMessage({kind:"model-response",id:message.id,trace});}catch(e){try{worker.postMessage({kind:"model-response",id:message.id,trace,error:e instanceof Error?e.message:String(e)});}catch{/* worker exited */}}})();return;
        }
        this.state={...(message as EvaluationStatus),comparison};
      });
      worker.on("error",e=>{this.state={...this.state,state:"failed",error:e.message};});
      worker.on("exit",()=>{if(this.worker===worker){this.worker=undefined;if(this.state.state==="running")this.state={...this.state,state:signal.aborted?"stopped":"failed",error:"评测进程中断，已完成结果仍可查看"};}resolve();});
    });
    await this.persist(book,this.state);
  }
  async dispose(){this.controller?.abort();await this.worker?.terminate();await this.batch;await this.writes;}
}
