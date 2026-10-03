import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Copy, Save } from "lucide-react";
import type { LibraryBook, LibraryQaModels } from "../../../shared/contracts/smart-library";
import type { LibraryStrategyProfile } from "../../../shared/contracts/library-strategy";
import { strategyIndexConfig, DEFAULT_PLANNING_PROMPT } from "../../../shared/contracts/library-strategy";
import { LibraryIndexDialog } from "./LibraryIndexDialog";
import { LibraryModelPanel } from "./LibraryModelPanel";
import { LibraryStrategyExplanation } from "./LibraryStrategyExplanation";
import { HintButton } from "../../components/ui/tooltip";
import { modelKey } from "./LibraryQaControls";

export default function LibraryStrategyDialog({ book, onClose }: { book?: LibraryBook; onClose: () => void }) {
  const dialog=useRef<HTMLDialogElement>(null),alive=useRef(true),lock=useRef(false);
  const [profiles,setProfiles]=useState<LibraryStrategyProfile[]>([]),[draft,setDraft]=useState<LibraryStrategyProfile>();
  const [books,setBooks]=useState<LibraryBook[]>([]),[bookId,setBookId]=useState(book?.id??"");
  const [models,setModels]=useState<LibraryQaModels>({models:[],configured:null});
  const [tab,setTab]=useState<"config"|"description"|"models"|"index">("config"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [modelsVisited,setModelsVisited]=useState(false),[modelBusy,setModelBusy]=useState(false);
  const blocked=busy||modelBusy;
  const [closing,setClosing]=useState(false);
  const saved=profiles.find(p=>p.id===draft?.id),dirty=!!draft&&JSON.stringify(draft)!==JSON.stringify(saved);
  const selectedBook=books.find(b=>b.id===bookId)??(book?.id===bookId?book:undefined);
  useEffect(()=>{
    alive.current=true;const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();
    void Promise.all([window.piDesktop.library.strategyProfiles(),window.piDesktop.library.qaModels(),window.piDesktop.library.list()]).then(([items,models,books])=>{if(!alive.current)return;setProfiles(items);setDraft(structuredClone(items[0]));setModels(models);setBooks(books);if(!bookId)setBookId(books[0]?.id??"");}).catch(e=>{if(alive.current)setError(String(e));});
    return()=>{alive.current=false;previous?.focus();};
  },[]);
  const mutate=(change:(next:LibraryStrategyProfile)=>void)=>{setDraft(old=>{if(!old)return old;const next=structuredClone(old);change(next);return next;});setNotice("");};
  async function action(kind:"save"|"create"|"copy"){
    if(lock.current||modelBusy||!draft)return;if(kind!=="save"&&dirty){setError("请先保存当前修改，或点击“放弃修改”后再新建、复制。");return;}
    lock.current=true;setBusy(true);setError("");setNotice("");
    try{
      const items=await window.piDesktop.library.strategyProfiles(kind==="save"?{action:"save",profile:draft}:{action:"create",...(kind==="copy"?{copyFrom:draft.id}:{})});
      if(!alive.current)return;setProfiles(items);setDraft(structuredClone(kind==="save"?items.find(p=>p.id===draft.id)!:items.at(-1)!));
      if(kind!=="save")setTab("config");setNotice(kind==="save"?"方案已保存。问答与评测会使用保存的配置。":"方案已创建，索引独立，需为要使用的图书构建索引。");window.dispatchEvent(new Event("library-strategies-changed"));
    }catch(e){if(alive.current)setError(String(e));}finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  function select(id:string){if(blocked)return;if(dirty){setError("当前有未保存修改，请先保存或放弃修改。");return;}setDraft(structuredClone(profiles.find(p=>p.id===id)!));if(tab!=="description")setTab("config");setError("");setNotice("");dialog.current?.querySelector("main")?.scrollTo(0,0);}
  function close(){if(blocked)return;if(dirty)setClosing(true);else onClose();}
  function changeTab(next:typeof tab){
    if(blocked)return;
    if(next==="index"&&dirty){setError("请先保存配置，再构建或检查索引。");return;}
    if(next==="models")setModelsVisited(true);
    setTab(next);setError("");setNotice("");dialog.current?.querySelector("main")?.scrollTo(0,0);
  }
  const number=(label:string,value:number,change:(value:number)=>void,min=0,max=200)=><label>{label}<input aria-label={label} type="number" min={min} max={max} value={Number.isFinite(value)?value:""} onChange={e=>change(e.target.value===""?NaN:Number(e.target.value))}/></label>;
  function modelControl(stage:"rewrite"|"answer"){
    if(!draft)return null;const config=draft[stage],selected=models.models.find(m=>config.model&&modelKey(m)===modelKey(config.model));
    return <div className="library-strategy-fields"><label>{stage==="rewrite"?"问题处理模型":"回答模型"}<select aria-label={stage==="rewrite"?"问题处理模型":"方案回答模型"} value={config.model?modelKey(config.model):""} onChange={e=>mutate(p=>{const key=e.target.value?JSON.parse(e.target.value):null;p[stage].model=key?{providerId:key[0],modelId:key[1]}:null;p[stage].reasoning=undefined;})}><option value="">{stage==="rewrite"?"沿用回答模型":"使用问答所选／客户端默认模型"}</option>{config.model&&!selected&&<option value={modelKey(config.model)}>当前模型不可用：{config.model.modelId}</option>}{models.models.map(m=><option key={modelKey(m)} value={modelKey(m)}>{m.providerId} / {m.name}</option>)}</select></label><label>思考程度<select aria-label={`${stage==="rewrite"?"问题处理":"方案回答"}思考程度`} value={config.reasoning??""} onChange={e=>mutate(p=>{p[stage].reasoning=(e.target.value||undefined) as typeof config.reasoning;})}><option value="">默认</option>{(selected?.reasoningLevels??["minimal","low","medium","high","xhigh","max"]).map(level=><option key={level} value={level}>{({minimal:"最少",low:"低",medium:"中",high:"高",xhigh:"超高",max:"最大"} as Record<string,string>)[level]}</option>)}</select></label></div>;
  }
  const section=(title:string,children:ReactNode)=><fieldset><legend>{title}</legend>{children}</fieldset>;
  return createPortal(<dialog ref={dialog} className="library-model-dialog library-strategy-dialog" aria-label="策略管理" onCancel={e=>{e.preventDefault();close();}}>
    <header><div><h2>策略管理</h2><p>统一管理方案配置、本地模型与图书索引。</p></div><HintButton hint="关闭策略管理" disabled={blocked} onClick={close}><X size={18}/></HintButton></header>
    <div className="library-strategy-layout">
      <aside><div className="library-strategy-actions"><button disabled={blocked} onClick={()=>void action("create")}><Plus size={15}/>新建</button><button disabled={blocked||!draft} onClick={()=>void action("copy")}><Copy size={15}/>复制</button></div><nav aria-label="策略方案">{profiles.map(p=><button disabled={blocked} className={draft?.id===p.id?"active":""} aria-current={draft?.id===p.id?"true":undefined} key={p.id} onClick={()=>select(p.id)}><strong>{p.name}</strong><small>{p.queryPlanning?.enabled?"多路覆盖":"单次检索"} · 配置 v{p.revision}</small></button>)}</nav></aside>
      <main>{!draft?<p role="status">正在加载策略方案…</p>:<>
        <div className="library-strategy-tabs" role="tablist" aria-label="策略配置页面">{([["config","配置"],["description","说明"],["models","本地模型"],["index","索引"]] as const).map(([value,label])=><button key={value} id={`library-strategy-tab-${value}`} role="tab" aria-controls={`library-strategy-page-${value}`} aria-selected={tab===value} disabled={blocked} onClick={()=>changeTab(value)}>{label}</button>)}<span>{dirty?"尚未保存":`已保存 · v${draft.revision}`}</span></div>
        {error&&<p className="library-error" role="alert">{error}</p>}{notice&&<p className="library-strategy-notice" role="status">{notice}</p>}
        {tab==="config"&&<form id="library-strategy-page-config" role="tabpanel" aria-labelledby="library-strategy-tab-config" onSubmit={e=>{e.preventDefault();void action("save");}}>
          {section("方案信息",<><label>方案名称<input aria-label="方案名称" required maxLength={80} value={draft.name} onChange={e=>mutate(p=>{p.name=e.target.value;})}/></label><p>技术类型：传统 RAG。策略详解与流程图见“说明”页。</p></>)}
          {section("切片与向量索引",<><div className="library-strategy-fields"><label>切片方式<select aria-label="切片方式" value={draft.chunking.method} onChange={e=>mutate(p=>{p.chunking.method=e.target.value as "paragraph"|"fixed";})}><option value="paragraph">按标点与段落边界</option><option value="fixed">固定字符长度</option></select></label>{number("片段长度",draft.chunking.size,value=>mutate(p=>{p.chunking.size=value;}),100,4000)}{number("重叠字符",draft.chunking.overlap,value=>mutate(p=>{p.chunking.overlap=value;}),0,3999)}</div><p>向量接口与模型在“本地模型”页配置。</p><p>{saved&&strategyIndexConfig(saved)!==strategyIndexConfig(draft)?"这些修改保存后需要重建索引。":"不同方案不共用索引。原书与模型权重共用，每套方案只保留一份当前有效索引。"}</p></>)}
          {section("检索规划",<><label>检索规划<select aria-label="检索规划" value={draft.queryPlanning?.enabled?"coverage":"off"} onChange={e=>mutate(p=>{p.queryPlanning={...(p.queryPlanning??{maxSubqueries:4,prompt:DEFAULT_PLANNING_PROMPT}),enabled:e.target.value==="coverage"};})}><option value="off">关闭 · 单次检索</option><option value="coverage">拆分问题 · 多路证据覆盖</option></select></label>{draft.queryPlanning?.enabled&&<>{number("最多子问题",draft.queryPlanning.maxSubqueries,value=>mutate(p=>{p.queryPlanning!.maxSubqueries=value;}),1,4)}{modelControl("rewrite")}<label>检索规划提示词<textarea aria-label="检索规划提示词" rows={6} maxLength={12000} value={draft.queryPlanning.prompt} onChange={e=>mutate(p=>{p.queryPlanning!.prompt=e.target.value;})}/></label><p>每次调用规划模型；简单问题可以返回空数组。输出 {`{"subqueries":["子问题"]}`}，原问题自动保留。各路分别召回、重排，候选和上下文按要点分配；相邻原文合并。模型只收到问题和必要历史。关闭后可做相同参数的单查询对照。</p></>}</>)}
          {!draft.queryPlanning?.enabled&&section("问题处理",<><label>问题改写<select aria-label="问题改写" value={draft.rewrite.mode} onChange={e=>mutate(p=>{p.rewrite.mode=e.target.value as typeof p.rewrite.mode;})}><option value="off">关闭</option><option value="history">仅有可用历史时</option><option value="always">每次执行</option></select></label>{modelControl("rewrite")}<label>问题处理提示词<textarea aria-label="问题处理提示词" rows={5} value={draft.rewrite.prompt} onChange={e=>mutate(p=>{p.rewrite.prompt=e.target.value;})}/></label><p>输出必须是 {`{"query":"检索问题"}`}。当前评测每题独立、没有历史；只有“每次执行”会对这批题目调用改写模型。问题处理模型会收到问题和所需历史，不发送整本书。</p></>)}
          {section("召回与重排",<><div className="library-strategy-fields"><label>检索方式<select aria-label="方案检索方式" value={draft.retrieval.mode} onChange={e=>mutate(p=>{p.retrieval.mode=e.target.value as typeof p.retrieval.mode;})}><option value="hybrid">关键词＋向量</option><option value="keyword">关键词</option><option value="vector">向量</option></select></label>{number("关键词候选",draft.retrieval.keywordCandidates,value=>mutate(p=>{p.retrieval.keywordCandidates=value;}),1,200)}{number("向量候选",draft.retrieval.vectorCandidates,value=>mutate(p=>{p.retrieval.vectorCandidates=value;}),1,200)}{number("融合候选",draft.retrieval.fusionCandidates,value=>mutate(p=>{p.retrieval.fusionCandidates=value;}),1,64)}{number("RRF 常数",draft.retrieval.rrfK,value=>mutate(p=>{p.retrieval.rrfK=value;}),1,200)}{number("返回片段",draft.retrieval.returnedChunks,value=>mutate(p=>{p.retrieval.returnedChunks=value;}),1,64)}</div><label className="library-strategy-check"><input type="checkbox" checked={draft.retrieval.rerank} onChange={e=>mutate(p=>{p.retrieval.rerank=e.target.checked;})}/>启用重排</label><label>重排批量<select aria-label="重排批量" value={draft.retrieval.batchSize} onChange={e=>mutate(p=>{p.retrieval.batchSize=Number(e.target.value);})}>{[1,2,4,8,16].map(n=><option key={n} value={n}>{n}</option>)}</select></label><p>重排接口、模型选择与测试在“本地模型”页。内置服务按所选批量推理，尾批按实际数量处理；外部接口是否支持 batch_size 取决于该服务。</p></>)}
          {section("上下文组装",<><div className="library-strategy-fields">{number("回答证据数量",draft.context.chunks,value=>mutate(p=>{p.context.chunks=value;}),1,64)}{number("前后扩展字符",draft.context.expandChars,value=>mutate(p=>{p.context.expandChars=value;}),0,2000)}{number("原文字符预算",draft.context.maxChars,value=>mutate(p=>{p.context.maxChars=value;}),100,128000)}</div><label className="library-strategy-check"><input type="checkbox" checked={draft.context.deduplicate} onChange={e=>mutate(p=>{p.context.deduplicate=e.target.checked;})}/>过滤高度重叠的候选片段</label></>)}
          {section("回答生成",<>{modelControl("answer")}{number("最近历史轮数",draft.answer.historyRounds,value=>mutate(p=>{p.answer.historyRounds=value;}),0,20)}<label>附加回答提示词<textarea aria-label="附加回答提示词" rows={4} value={draft.answer.prompt} placeholder="例如：按时间顺序回答，列出每一步的证据。" onChange={e=>mutate(p=>{p.answer.prompt=e.target.value;})}/></label><p>始终保留只依据证据回答和引用校验的基础规则。召回评测执行到上下文组装，不生成最终回答。</p></>)}
        </form>}
        {tab==="description"&&<div id="library-strategy-page-description" role="tabpanel" aria-labelledby="library-strategy-tab-description"><LibraryStrategyExplanation profile={draft} dirty={dirty} onDescriptionChange={value=>mutate(p=>{p.description=value;})}/></div>}
        {modelsVisited&&<div id="library-strategy-page-models" role="tabpanel" aria-labelledby="library-strategy-tab-models" hidden={tab!=="models"}><LibraryModelPanel key={draft.id} settings={draft.localModels} onChange={settings=>mutate(p=>{p.localModels=settings;})} onBusyChange={setModelBusy} active={tab==="models"} disabled={busy}/></div>}
        {tab==="index"&&<div id="library-strategy-page-index" role="tabpanel" aria-labelledby="library-strategy-tab-index"><label className="library-strategy-book">图书<select aria-label="策略索引图书" value={bookId} onChange={e=>setBookId(e.target.value)}>{books.map(b=><option key={b.id} value={b.id}>{b.title}</option>)}</select></label>{selectedBook?<LibraryIndexDialog key={`${draft.id}:${bookId}:${draft.revision}`} book={selectedBook} profileId={draft.id} embedded onClose={()=>changeTab("config")}/>:<p>先导入图书，再为此方案构建索引。</p>}</div>}
      </>}</main>
    </div>
    <footer>{closing?<><span>当前修改尚未保存。</span><div><button onClick={()=>setClosing(false)}>继续编辑</button><button disabled={blocked} onClick={onClose}>放弃修改并关闭</button></div></>:<><span>{dirty?"修改仅在保存后生效。":"构建索引和评测按需执行，不影响其他模块启动。"}</span><div>{dirty&&<button disabled={blocked} onClick={()=>{setDraft(structuredClone(saved!));setError("");}}>放弃修改</button>}<button type={tab==="config"?"submit":"button"} form={tab==="config"?"library-strategy-page-config":undefined} disabled={blocked||!draft||tab==="index"||!dirty} onClick={tab==="models"||tab==="description"?()=>void action("save"):undefined}><Save size={15}/>{busy?"正在保存…":"保存方案"}</button><button disabled={blocked} onClick={close}>完成</button></div></>}</footer>
  </dialog>,document.body);
}
