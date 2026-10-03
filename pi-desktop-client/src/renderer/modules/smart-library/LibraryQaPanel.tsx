import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, BookOpen, Square, X, Plus, Trash2, Pencil } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { LibraryBook, LibraryEvidence, LibraryQaInput, LibraryQaModels, LibraryQaTurn, LibraryQaSession, LibraryQaRange, LibraryQaStrategyInfo } from "../../../shared/contracts/smart-library";
import type { ModelReasoningLevel } from "../../../platform/shared/ai/model-gateway";
import { HintButton } from "../../components/ui/tooltip";
import { DEFAULT_LIBRARY_QA_STRATEGY } from "../../../shared/contracts/smart-library";
import { QaModelControl, QaUsageControl, QaStrategyControl } from "./LibraryQaControls";
import { useLibrary } from "./library-store";
import { EvidenceDialog } from "./LibraryEvidenceDialog";
import { LibraryAutoRuntimeNotice, useLibraryAutoRuntime } from "./LibraryAutoRuntime";

const drafts = new Map<string, string>();
const running = (t: LibraryQaTurn) => ["retrieving", "rewriting", "answering"].includes(t.state);
const statuses = { retrieving: "正在查找原文…", rewriting: "正在理解追问…", answering: "正在生成回答…", completed: "已完成", stopped: "已停止", failed: "未完成" };
export function mergeQaTurns(current: LibraryQaTurn[], incoming: LibraryQaTurn[]) {
  const items = new Map(current.map(t => [t.id, t]));
  for (const t of incoming) if (!items.has(t.id) || t.revision >= items.get(t.id)!.revision) items.set(t.id, t);
  return [...items.values()].sort((a,b) => a.createdAt - b.createdAt || (a.seq ?? Infinity) - (b.seq ?? Infinity));
}
function Answer({ turn, onCitation }: { turn: LibraryQaTurn; onCitation: (n: number) => void }) {
  const citations = new Set(turn.citations.map(c => c.number));
  const citationPlugin = () => (tree: any) => {
    const walk = (node: any) => { if (!node.children || node.type === "link") return;
      node.children = node.children.flatMap((child: any) => {
        if(child.type!=="text"){walk(child);return [child];}
        return child.value.split(/(\[\d+\])/g).filter(Boolean).map((value: string) => {
          const match=/^\[(\d+)\]$/.exec(value);const n=Number(match?.[1]);
          return match&&citations.has(n)?{type:"link",url:`#library-citation-${n}`,children:[{type:"text",value}]}:{type:"text",value};
        });
      });
    }; walk(tree);
  };
  return <div className="library-qa-answer"><ReactMarkdown remarkPlugins={[citationPlugin]} components={{
    a: ({href,children}) => { const match=/^#library-citation-(\d+)$/.exec(href??"");const n=Number(match?.[1]);return match&&citations.has(n)?<button className="library-qa-cite" onClick={()=>onCitation(n)} aria-label={`查看引用 ${n}`}>{children}</button>:<span>{children}</span>; },
    img: () => null,
  }}>{turn.answer}</ReactMarkdown></div>;
}
type PanelProps = { book: LibraryBook; page: number; onClose: () => void; onJump: () => void };
const lastSessions = new Map<string, string>();
export default function LibraryQaPanel(props: PanelProps) {
  const [runtimeProfile,setRuntimeProfile]=useState("standard-rag");
  const runtime = useLibraryAutoRuntime(runtimeProfile);
  const [sessions, setSessions] = useState<LibraryQaSession[]>([]);
  const [selected, setSelected] = useState(""); const [error, setError] = useState("");
  const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState<"delete" | "rename" | null>(null); const [name,setName] = useState(""); const [loaded,setLoaded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { let valid = true; void window.piDesktop.library.qaSessions(props.book.id).then(rows => {
    if (!valid) return; setSessions(rows); const last = lastSessions.get(props.book.id); setSelected(rows.find(s=>s.id===last)?.id ?? rows[0]?.id ?? "");
  }).catch(e=>{if(valid)setError(String(e));}).finally(()=>{if(valid)setLoaded(true);}); return ()=>{valid=false;}; }, [props.book.id]);
  useEffect(()=>window.piDesktop.library.onQaUpdate(turn=>{
    if(turn.book===props.book.id)setSessions(rows=>rows.map(row=>row.id===(turn.sessionId??"default")&&row.title==="新会话"&&!row.manualTitle?{...row,title:turn.question.slice(0,24)}:row));
  }),[props.book.id]);
  useEffect(()=>{if(confirm)dialog.current?.showModal();},[confirm]);
  async function manage(action: "create" | "delete" | "rename") {
    if (busy) return; setBusy(true); setError("");
    try { const rows = await window.piDesktop.library.qaSessions(props.book.id, action, selected, name); setSessions(rows);
      if(action==="create"){setSelected(rows[0].id);lastSessions.set(props.book.id,rows[0].id);}
      else if(action==="delete") {drafts.delete(`${props.book.id}:${selected}`);setSelected(rows[0]?.id??"");lastSessions.set(props.book.id,rows[0]?.id??"");}
      setConfirm(null);
    } catch(e){setError(String(e));} finally{setBusy(false);}
  }
  useEffect(()=>{setRuntimeProfile(sessions.find(s=>s.id===selected)?.strategyId??"standard-rag");},[sessions,selected]);
  const navigation = <div className="library-qa-sessionbar"><select aria-label="图书问答会话" value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);lastSessions.set(props.book.id,e.target.value);setError("");}}>{sessions.map((s,i)=><option key={s.id} value={s.id}>{s.title}{s.title==="新会话"?` ${sessions.length-i}`:""}</option>)}</select><HintButton hint="新建会话" aria-label="新建图书会话" disabled={busy} onClick={()=>void manage("create")}><Plus size={16}/></HintButton><HintButton hint="重命名会话" aria-label="重命名图书会话" disabled={busy||!selected} onClick={()=>{setName(sessions.find(s=>s.id===selected)?.title??"");setConfirm("rename");}}><Pencil size={16}/></HintButton><HintButton hint="删除会话" aria-label="删除图书会话" disabled={busy||!selected} onClick={()=>setConfirm("delete")}><Trash2 size={16}/></HintButton></div>;
  return <>{selected?<QaSessionPanel key={`${props.book.id}:${selected}`} {...props} runtime={runtime} sessionId={selected} navigation={navigation} strategyId={sessions.find(s=>s.id===selected)?.strategyId??DEFAULT_LIBRARY_QA_STRATEGY} onStrategy={async strategyId=>{const rows=await window.piDesktop.library.qaSessions(props.book.id,"strategy",selected,undefined,undefined,strategyId);setSessions(rows);}} range={sessions.find(s=>s.id===selected)?.range??null} onRange={async range=>{const rows=await window.piDesktop.library.qaSessions(props.book.id,"range",selected,undefined,range);setSessions(rows);}}/>:<aside className="library-qa-panel"><header><strong>图书问答</strong><button aria-label="关闭图书问答" onClick={props.onClose}><X size={17}/></button></header><LibraryAutoRuntimeNotice snapshot={runtime.snapshot}/>{loaded?<><div className="library-qa-empty"><p>暂无会话</p><button disabled={busy} onClick={()=>void manage("create")}>新建会话</button></div></>:<p>正在恢复会话…</p>}</aside>}
    {error&&createPortal(<div role="alert" className="library-qa-session-error" onClick={()=>setError("")}>{error}（点击关闭）</div>,document.body)}
    {confirm&&createPortal(<dialog ref={dialog} className="library-model-dialog" aria-label={confirm==="delete"?"删除会话确认":"重命名会话"} onCancel={()=>setConfirm(null)}><header><h2>{confirm==="delete"?"删除当前会话？":"重命名会话"}</h2></header><form onSubmit={e=>{e.preventDefault();void manage(confirm);}}><div className="library-model-body">{confirm==="delete"?<p>将删除此会话及其全部问答、引用和记忆，无法撤销。其他会话、图书和索引不受影响。</p>:<label>会话名称<input autoFocus aria-label="会话名称" maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>}</div><footer><button type="button" disabled={busy} onClick={()=>setConfirm(null)}>取消</button><button type="submit" disabled={busy||(confirm==="rename"&&!name.trim())}>{confirm==="delete"?"删除会话":"保存名称"}</button></footer></form></dialog>,document.body)}</>;

}
function QaSessionPanel({ book, page, onClose, onJump, sessionId, navigation, range, onRange, strategyId, onStrategy, runtime }: PanelProps & { runtime: ReturnType<typeof useLibraryAutoRuntime>; sessionId: string; strategyId:string; onStrategy:(id:string)=>Promise<void>; navigation: React.ReactNode; range:LibraryQaRange|null; onRange:(range:LibraryQaRange|null)=>Promise<void> }) {
  const api = window.piDesktop.library;
  const [strategies,setStrategies] = useState<LibraryQaStrategyInfo[]>([]);
  const [strategyBusy,setStrategyBusy] = useState(false);
  const strategySaving = useRef(false);
  const strategyAvailable = strategies.some(strategy=>strategy.id===strategyId);

  const [turns, setTurns] = useState<LibraryQaTurn[]>([]); const [hasMore, setHasMore] = useState(false);
  const [models, setModels] = useState<LibraryQaModels>({ models: [], configured: null }); const [modelKey, setModelKey] = useState("");
  const [reasoning, setReasoning] = useState<ModelReasoningLevel | "">("");
  const [question, setQuestion] = useState(drafts.get(`${book.id}:${sessionId}`) ?? "");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [sending, setSending] = useState(false);
  const [citation, setCitation] = useState<LibraryEvidence>(); const [locating, setLocating] = useState(false);
  const mounted = useRef(true); const active = useRef(""); const request = useRef(0); const scroller = useRef<HTMLDivElement>(null); const follow = useRef(true);
  const key = (m: { providerId: string; modelId: string }) => JSON.stringify([m.providerId, m.modelId]);
  const selected = models.models.find(m => key(m) === modelKey);
  useEffect(()=>{const refresh=()=>{void api.qaStrategies().then(setStrategies).catch(e=>setError(String(e)));};window.addEventListener("library-strategies-changed",refresh);return()=>window.removeEventListener("library-strategies-changed",refresh);},[]);
  useEffect(()=>{const strategy=strategies.find(s=>s.id===strategyId);if(strategy?.model)setModelKey(key(strategy.model));if(strategy?.model||strategy?.reasoning)setReasoning(strategy.reasoning??"");},[strategyId,strategies,models]);
  const readPage = range?.end;
  const visible = turns;
  const [debugId,setDebugId] = useState<string>();
  const live = turns.find(running);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = api.onQaUpdate(turn => { if (mounted.current && turn.book === book.id && (turn.sessionId ?? "default") === sessionId) { if (running(turn)) active.current = turn.id; else if (active.current === turn.id) active.current = ""; setTurns(old => mergeQaTurns(old,[turn])); } });
    void api.qaStrategies().then(value=>{if(mounted.current)setStrategies(value);}).catch(e=>{if(mounted.current)setError(String(e));});
    const historyRequest = api.qaHistory(book.id,undefined,sessionId);
    void historyRequest.then(history => {
      if (!mounted.current) return;
      setTurns(old => mergeQaTurns(old,history.turns)); setHasMore(history.hasMore);
      const pending = history.turns.find(running); if (pending) active.current = pending.id;
    }).catch(e => { if (mounted.current) setError(String(e)); }).finally(() => { if (mounted.current) setLoading(false); });
    void Promise.all([historyRequest.catch(()=>({turns:[],hasMore:false})),api.qaModels()]).then(([history,info])=>{
      if(!mounted.current)return;setModels(info);const last=history.turns.at(-1);const defaultModel=last?.model??info.configured;
      setModelKey(defaultModel?key(defaultModel):"");if(last?.reasoning)setReasoning(last.reasoning);
    }).catch(e=>{if(mounted.current)setError(String(e));});
    return () => { mounted.current = false; request.current++; unsubscribe(); if (active.current) void api.qaStop(book.id,active.current).catch(() => {}); };
  }, [book.id]);
  useEffect(() => { drafts.set(`${book.id}:${sessionId}`,question); }, [book.id,question]);
  useEffect(() => { if (follow.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [turns,readPage]);
  useEffect(() => { setCitation(undefined); setLocating(false); request.current++; }, [readPage]);
  async function refreshModels() { try { const value = await api.qaModels(); if (mounted.current) { setModels(value); setError(""); } } catch(e) { if (mounted.current) setError(String(e)); } }
  async function changeStrategy(id:string) {
    if(active.current||sending||strategySaving.current)return;
    strategySaving.current=true;setStrategyBusy(true);setError("");
    try { await onStrategy(id); } catch(e) { if(mounted.current)setError(String(e)); }
    finally { strategySaving.current=false;if(mounted.current)setStrategyBusy(false); }
  }
  async function send() {
    if (!runtime.available) return;
    if (sending || active.current || strategySaving.current || !strategyAvailable || !selected || !question.trim()) return;
    const input: LibraryQaInput = { id: crypto.randomUUID(), sessionId, strategyId, question: question.trim(), model: { providerId:selected.providerId,modelId:selected.modelId }, readingPage:readPage, readingStartPage:range?.start, ...(reasoning ? {reasoning} : {}) };
    const optimistic: LibraryQaTurn = { ...input, strategy: strategies.find(strategy=>strategy.id===strategyId), book:book.id, revision:0, createdAt:Date.now(),updatedAt:Date.now(), state:"retrieving",answer:"",citations:[],warnings:[] };
    active.current = input.id; setSending(true); setError(""); setQuestion(""); follow.current = true; setTurns(old => [...old,optimistic]);
    try { const value = await api.qaAsk(book.id,input); if (mounted.current) setTurns(old => mergeQaTurns(old,[value])); }
    catch(e) { if (mounted.current) { setTurns(old => old.filter(t => t.id!==input.id)); setQuestion(input.question); setError(String(e)); } if (active.current===input.id) active.current=""; }
    finally { if (mounted.current) setSending(false); }
  }
  async function stop() { try { if(active.current) await api.qaStop(book.id,active.current); } catch(e) { if(mounted.current)setError(String(e)); } }
  async function showCitation(turn: LibraryQaTurn, number: number) {
    const id = ++request.current; setLocating(true); setError("");
    try { const value = await api.qaEvidence(book.id,turn.id,number); if(mounted.current && request.current===id)setCitation(value); }
    catch(e) { if(mounted.current && request.current===id)setError(String(e)); }
    finally { if(mounted.current && request.current===id)setLocating(false); }
  }
  async function more() { const before = Math.min(...turns.map(t=>t.seq??Infinity)); if(!Number.isFinite(before))return; try { const value=await api.qaHistory(book.id,before,sessionId); if(mounted.current){follow.current=false;setTurns(old=>mergeQaTurns(old,value.turns));setHasMore(value.hasMore);} }catch(e){if(mounted.current)setError(String(e));} }
  return <aside className="library-qa-panel" aria-label="图书问答">
    <header><div><BookOpen size={16}/><strong>图书问答</strong></div><button aria-label="关闭图书问答" onClick={onClose}><X size={17}/></button></header>
    {navigation}
    <QaRange key={`${sessionId}:${range?.start}:${range?.end}`} range={range} total={book.chapters.length} disabled={!!live||sending} onChange={onRange}/>
    <LibraryAutoRuntimeNotice snapshot={runtime.snapshot}/>

    <div className="library-qa-messages" ref={scroller} onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<60;}}>
      {hasMore&&<button className="library-qa-more" onClick={()=>void more()}>加载更早对话</button>}
      {loading?<p className="library-qa-empty">正在恢复图书对话…</p>:!visible.length&&<div className="library-qa-empty"><BookOpen size={28}/><strong>带着问题读这本书</strong><p>可以询问细节、人物关系，或继续追问。回答只依据检索到的原文，证据不足时应明确说明。</p></div>}
      {visible.map(turn=><section className="library-qa-turn" key={turn.id}><p className="library-qa-question">{turn.question}</p><div className="library-qa-meta"><span>{turn.model.modelId}</span><span>{turn.strategy?.name??"普通 RAG（历史记录）"}</span>{running(turn)&&<span role="status">{statuses[turn.state]}</span>}</div>
        <small className="library-qa-range-note">{turn.readingPage===undefined?"全书检索":`阅读页 ${(turn.readingStartPage??0)+1}–${turn.readingPage+1}`}</small><Answer turn={turn} onCitation={n=>void showCitation(turn,n)}/>
        <button className="library-qa-debug-button" onClick={()=>setDebugId(turn.id)}>调试信息</button>
        {!!turn.citations.length&&<details className="library-qa-sources"><summary>参考原文 · {turn.citations.length}</summary>{turn.citations.map(c=><button key={c.number} disabled={locating} onClick={()=>void showCitation(turn,c.number)}>[{c.number}] {c.excerpt.title}</button>)}</details>}
        {!!turn.warnings.length&&<details className="library-qa-notes"><summary>检索与引用提示 · {turn.warnings.length}</summary>{turn.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}
        {turn.error&&<p className="library-qa-turn-error" role="status">{turn.error}</p>}
        {(turn.state==="failed"||turn.state==="stopped")&&<button disabled={!!live} onClick={()=>{setQuestion(turn.question);setModelKey(key(turn.model));setReasoning(turn.reasoning??"");}}>重新填写此问题</button>}
      </section>)}
    </div>
    {error&&<p className="library-qa-error" role="alert">{error}</p>}

    <form className="library-qa-composer" onSubmit={e=>{e.preventDefault();void send();}}><div className="library-qa-input-shell"><textarea aria-label="向图书提问" placeholder="问问这本书…" maxLength={200} rows={3} value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!live&&!sending)void send();}}}/>
      <div className="library-qa-usage-row"><QaUsageControl turn={visible.at(-1)}/></div><div className="library-qa-input-tools"><QaStrategyControl strategies={strategies} selectedId={strategyId} disabled={!!live||sending||strategyBusy||loading} onSelect={id=>void changeStrategy(id)}/><QaModelControl models={models.models} selected={selected} reasoning={reasoning} disabled={!!live||sending} onModel={value=>{setModelKey(value);setReasoning("");}} onReasoning={setReasoning} onRefresh={()=>void refreshModels()}/>{live||sending?<button type="button" aria-label="停止图书回答" onClick={()=>void stop()}><Square size={16}/></button>:<button type="submit" aria-label="发送图书问题" disabled={!runtime.available||!selected||!question.trim()||loading||strategyBusy||!strategyAvailable}><ArrowUp size={17}/></button>}</div></div></form>
    {debugId&&<QaDebug turn={turns.find(t=>t.id===debugId)!} turns={turns} onSelect={setDebugId} onClose={()=>setDebugId(undefined)}/>}
    {citation&&<EvidenceDialog value={citation} onClose={()=>setCitation(undefined)} onJump={()=>{if(citation.page!==undefined){void useLibrary.getState().open(book,citation.page,citation.pageHighlight);setCitation(undefined);onJump();}}}/>}
  </aside>;
}

function QaRange({range,total,disabled,onChange}:{range:LibraryQaRange|null;total:number;disabled:boolean;onChange:(r:LibraryQaRange|null)=>Promise<void>}) {
  const [custom,setCustom]=useState(!!range),[start,setStart]=useState(String((range?.start??0)+1)),[end,setEnd]=useState(String((range?.end??total-1)+1));
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function save(r:LibraryQaRange|null){setBusy(true);setError("");try{await onChange(r);setCustom(!!r);}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <form className="library-qa-range" onSubmit={e=>{e.preventDefault();const a=Number(start),b=Number(end);if(!Number.isInteger(a)||!Number.isInteger(b)||a<1||b<a||b>total){setError(`请输入 1–${total} 内的有效起止页`);return;}void save({start:a-1,end:b-1});}}><div><select aria-label="问答阅读范围" disabled={disabled||busy} value={custom?"custom":"whole"} onChange={e=>{if(e.target.value==="whole")void save(null);else setCustom(true);}}><option value="whole">全书检索</option><option value="custom">自定义页码</option></select>{custom&&<><input aria-label="检索起始页" type="number" min={1} max={total} value={start} disabled={disabled||busy} onChange={e=>setStart(e.target.value)}/><span>–</span><input aria-label="检索结束页" type="number" min={1} max={total} value={end} disabled={disabled||busy} onChange={e=>setEnd(e.target.value)}/><button disabled={disabled||busy} type="submit">应用</button></>}</div>{error&&<p role="alert">{error}</p>}</form>;
}
function QaDebug({turn,turns,onSelect,onClose}:{turn:LibraryQaTurn;turns:LibraryQaTurn[];onSelect:(id:string)=>void;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);const [copied,setCopied]=useState(false);
  useEffect(()=>{dialog.current?.showModal();},[]);
  const payload={profile:turn.profile,strategy:turn.strategy??{id:"standard-rag",name:"普通 RAG",version:"未记录（历史记录）"},question:turn.question,range:turn.readingPage===undefined?"全书":{start: (turn.readingStartPage??0)+1,end:turn.readingPage+1},query:turn.query,retrieval:turn.retrieval,citations:turn.citations,calls:turn.debug,state:turn.state,error:turn.error};
  return createPortal(<dialog ref={dialog} className="library-model-dialog library-qa-debug" aria-label="图书问答调试信息" onCancel={onClose}><header><h2>本轮调试信息</h2><button aria-label="关闭调试信息" onClick={onClose}><X size={18}/></button></header><div className="library-model-body"><label>查看轮次<select aria-label="调试轮次" value={turn.id} onChange={e=>{onSelect(e.target.value);setCopied(false);}}>{turns.map((t,i)=><option key={t.id} value={t.id}>第 {i+1} 轮 · {t.question}</option>)}</select></label><p>{turn.question}</p><p>回答策略：{payload.strategy.name} · 版本 {payload.strategy.version}</p><p>记录应用请求与网关提交给模型运行时的上下文；不包含密钥、HTTP 请求头或模型内部思考。供应商 SDK 的最终 HTTP 封装未在这里抓包。</p>{!turn.debug?.length&&<p>本轮没有已保存的模型请求：可能是旧记录、尚在检索，或未找到证据而未调用模型。</p>}{turn.debug?.map((call,i)=><section key={i}><h3>{i+1}. {call.purpose}</h3><details open><summary>网关最终系统提示词</summary><pre>{call.prepared?call.prepared.systemPrompt??"（空）":"未取得运行时快照，请查看下方应用请求；不能把模板当作已发送内容。"}</pre></details><details><summary>实际消息序列 · 保留角色、顺序和完整内容</summary><pre>{call.prepared?JSON.stringify(call.prepared.messages,null,2):"未记录"}</pre></details><details><summary>运行参数与 token 用量</summary><pre>{JSON.stringify({...call.prepared,systemPrompt:undefined,messages:undefined,usage:call.usage,error:call.error},null,2)}</pre></details><details><summary>应用构造的完整请求 · 含提示词、历史和证据</summary><pre>{JSON.stringify(call.request,null,2)}</pre></details><details><summary>模型返回文本</summary><pre>{call.response??"尚无完整返回"}</pre></details></section>)}{turn.retrieval?.plan&&<details open><summary>检索规划与证据筛选</summary><ol>{turn.retrieval.plan.queries.map((query,i)=><li key={i}>{i===0?"原问题":"子问题 "+i}：{query}</li>)}</ol><pre>{JSON.stringify(turn.retrieval.plan,null,2)}</pre></details>}<details><summary>检索结果与引用原文</summary><pre>{JSON.stringify({range:payload.range,query:turn.query,retrieval:turn.retrieval,citations:turn.citations},null,2)}</pre></details></div><footer><button onClick={()=>{void navigator.clipboard.writeText(JSON.stringify(payload,null,2)).then(()=>setCopied(true)).catch(()=>setCopied(false));}}>{copied?"已复制":"复制完整调试记录"}</button><button onClick={onClose}>完成</button></footer></dialog>,document.body);
}
