import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download, Play, Square, Settings, Info, ChevronRight } from "lucide-react";
import type { LibraryStrategyProfile } from "../../../shared/contracts/library-strategy";
import type { EvaluationRunSummary } from "../../../shared/contracts/library-evaluation";
import type { LibraryBook, LibraryEvidence } from "../../../shared/contracts/smart-library";
import type { EvaluationStatus, EvaluationRow, EvaluationScore, EvaluationReport } from "../../../shared/contracts/library-evaluation";
import { evaluationGroups, groupRows, returnedCharacters, summarizeReturnedCharacters, summarizeEvaluation, type EvaluationGroup } from "../../../shared/contracts/library-evaluation-metrics";
import { evaluationTimingLabels, summarizeEvaluationTimings, type EvaluationTimingKey } from "../../../shared/contracts/library-evaluation-timings";
import { LibraryRuntimeControls } from "./LibraryRuntimeControls";
import { LibraryAutoRuntimeNotice, useLibraryAutoRuntime } from "./LibraryAutoRuntime";
import { EvidenceDialog } from "./LibraryEvidenceDialog";
import { HintButton } from "../../components/ui/tooltip";
import { useLibrary } from "./library-store";
import { evidenceOverlaps } from "../../../shared/contracts/library-evidence-overlap";

const labels: Record<string, string> = { keyword40: "关键词 ≤40", vector40: "向量 ≤40", fused16: "融合 ≤16", reranked16: "重排 ≤16", raw3: "原始 @3", raw6: "原始 @6", raw8: "原始 @8", expanded6: "回答上下文 @6" };
function stageLabel(key:string, report?:EvaluationReport) {
  const limit=report?.stageLimits?.[key];
  if(limit===undefined)return labels[key];
  if(report?.profile?.queryPlanning?.enabled&&(key==="keyword40"||key==="vector40"))return `${key==="keyword40"?"关键词":"向量"} 各路≤${limit} · 合并去重`;
  return `${key==="expanded6"?"回答上下文":key.startsWith("raw")?"原始":key==="keyword40"?"关键词":key==="vector40"?"向量":key==="fused16"?"融合":"重排"} ${key.startsWith("raw")||key==="expanded6"?"@":"≤"}${limit}`;
}
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const counts = (s?: EvaluationScore) => s ? `${s.complete}/${s.required} · ${pct(s.recall)}` : "—";
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} 秒`;
const characters = (value?: number) => value === undefined ? "—" : `${Math.round(value).toLocaleString("zh-CN")} 字符`;
function duration(ms: number) {
  const value = Math.max(0, Math.round(ms / 1000));
  return value < 60 ? `${value} 秒` : `${Math.floor(value / 60)} 分 ${value % 60} 秒`;
}

function useDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement; ref.current?.showModal(); return () => previous?.focus(); }, []);
  return ref;
}

export default function LibraryEvaluationDialog({ book, onClose }: { book: LibraryBook; onClose: () => void }) {
  const dialog = useDialog(), alive = useRef(true);
  const [profiles,setProfiles]=useState<LibraryStrategyProfile[]>([]),[profileId,setProfileId]=useState("standard-rag"),[runId,setRunId]=useState("");
  const [selectedProfiles,setSelectedProfiles]=useState<string[]>(["standard-rag"]),[runs,setRuns]=useState<EvaluationRunSummary[]>([]);
  const [comparing,setComparing]=useState(false),[showComparison,setShowComparison]=useState(false);
  const runtime = useLibraryAutoRuntime(profileId);
  useEffect(()=>{let valid=true;void window.piDesktop.library.strategyProfiles().then(items=>{if(valid)setProfiles(items);}).catch(e=>{if(valid)setError(String(e));});return()=>{valid=false;};},[book.id]);
  const [status, setStatus] = useState<EvaluationStatus>({ state: "idle", completed: 0, total: 0 });
  const [error, setError] = useState(""), [pending, setPending] = useState(false);
  const [group, setGroup] = useState<EvaluationGroup>("all");
  const [detailId, setDetailId] = useState<string>(), [auxiliary, setAuxiliary] = useState<"models" | "rules">();
  const running = status.state === "running" || (status.state === "completed" && !!status.comparison && status.comparison.completed<status.comparison.total), report = status.report;
  const rows = groupRows(report?.rows ?? [], group), summary = summarizeEvaluation(rows);
  const timing = summarizeEvaluationTimings(rows).totalMs;
  const characterStats = summarizeReturnedCharacters(rows);
  const elapsed = report ? (report.finishedAt ?? Date.now()) - report.startedAt : undefined;
  const valid = rows.filter(row => row.state === "completed").length, failed = rows.filter(row => row.state === "failed").length;
  const detail = report?.rows.find(row => row.id === detailId);

  useEffect(() => {
    alive.current = true; let valid=true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const next = await window.piDesktop.library.evaluate(book.id, "status", comparing?undefined:{profileId,runId:runId||undefined}); if (alive.current&&valid) {setStatus(next);if(comparing&&next.report?.profile&&next.state!=="running"&&(next.state==="stopped"||next.state==="failed"||next.comparison?.completed===next.comparison?.total)){setProfileId(next.report.profile.id);setRunId(next.report.runId??"");setComparing(false);}} const summaries=await window.piDesktop.library.evaluationRuns(book.id);if(alive.current&&valid)setRuns(summaries); }
      catch (e) { if (alive.current&&valid) setError(String(e)); }
      finally { if (alive.current&&valid) timer = setTimeout(() => void poll(), 1200); }
    };
    void poll(); return () => { alive.current = false; valid=false; clearTimeout(timer); };
  }, [book.id,profileId,runId,comparing]);

  async function action(value: "start" | "stop") {
    if (value === "start" && !runtime.available) return;
    if (pending) return; setPending(true); setError("");
    try { const next = await window.piDesktop.library.evaluate(book.id, value,{profileId}); if (alive.current) { setStatus(next); if (value === "start") {setDetailId(undefined);setRunId("");setComparing(false);}  } }
    catch (e) { if (alive.current) setError(String(e)); }
    finally { if (alive.current) setPending(false); }
  }
  async function compare(){
    if(pending||running||!runtime.available||!selectedProfiles.length)return;setPending(true);setError("");setRunId("");setComparing(true);
    try{const next=await window.piDesktop.library.evaluate(book.id,"start",{profileIds:selectedProfiles});if(alive.current)setStatus(next);}
    catch(e){if(alive.current){setComparing(false);setError(String(e));}}finally{if(alive.current)setPending(false);}
  }
  function download() {
    if (!report) return;
    const exported = { ...status, report: { ...report,
      rows: report.rows.map(row => ({ ...row, returnedCharacters: row.state === "completed" ? returnedCharacters(row) : undefined })),
      returnedCharacterStatistics: Object.fromEntries(evaluationGroups.map(g => [g.id, summarizeReturnedCharacters(groupRows(report.rows, g.id))])),
    } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `图书召回评测-${report.dataset}-${report.startedAt}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <>{createPortal(<dialog ref={dialog} className={`library-model-dialog library-evaluation-dialog${showComparison?" is-comparing":""}`} aria-label="图书召回评测" onCancel={onClose}>
    <header><div><h2>召回评测</h2><p>{book.title}</p></div><HintButton hint="关闭召回评测" onClick={onClose}><X size={18}/></HintButton></header>
    <div className="library-evaluation-profiles"><label>方案<select aria-label="评测方案" disabled={pending||running} value={profileId} onChange={e=>{setProfileId(e.target.value);setRunId("");setDetailId(undefined);setComparing(false);}}>{profiles.map(p=><option key={p.id} value={p.id}>{p.name} · v{p.revision}</option>)}</select></label><label>报告<select aria-label="评测报告" disabled={pending||running} value={runId} onChange={e=>{setRunId(e.target.value);setDetailId(undefined);setComparing(false);}}><option value="">当前方案最近一次</option>{runs.filter(r=>r.profileId===profileId).map(r=><option key={r.runId} value={r.runId}>{new Date(r.startedAt).toLocaleString()} · v{r.revision}</option>)}</select></label></div>
    <details className="library-evaluation-compare" open={showComparison} onToggle={e=>setShowComparison(e.currentTarget.open)}><summary>多方案对比{runs.length?` · ${runs.length} 份报告`:""}</summary><div className="library-evaluation-profile-checks">{profiles.map(p=><label key={p.id}><input type="checkbox" disabled={running||pending} checked={selectedProfiles.includes(p.id)} onChange={e=>setSelectedProfiles(old=>e.target.checked?[...old,p.id]:old.filter(id=>id!==p.id))}/>{p.name}</label>)}<button disabled={running||pending||!runtime.available||!selectedProfiles.length} onClick={()=>void compare()}>评测所选方案</button></div><p>相同图书、相同常驻题集；每题独立、全书检索。按方案依次运行，关闭窗口后继续。启用“每次改写”会调用配置的模型并计入耗时。</p>{runs.length>0&&<div className="library-evaluation-compare-table"><table><thead><tr><th>方案／配置版本</th><th>完成</th><th>上下文召回</th><th>字符覆盖</th><th>平均返回字符</th><th>单题平均</th><th>报告</th></tr></thead><tbody>{runs.map(r=><tr key={r.runId}><td>{r.name} · v{r.revision}<small>{new Date(r.startedAt).toLocaleString()}{report&&r.datasetHash!==report.datasetHash?" · 题集不同":""}</small></td><td>{r.completed}/{r.total}{r.failed?` · 失败 ${r.failed}`:""}</td><td>{pct(r.recall)}</td><td>{pct(r.coverage)}</td><td>{characters(r.meanReturnedChars)}</td><td>{seconds(r.meanMs)}</td><td><button disabled={running||pending} onClick={()=>{setProfileId(r.profileId);setRunId(r.runId);setComparing(false);setShowComparison(false);setDetailId(undefined);}}>查看</button></td></tr>)}</tbody></table></div>}</details>
    <LibraryAutoRuntimeNotice snapshot={runtime.snapshot}/>
    <div className="library-evaluation-controls">
      <div>{running ? <button disabled={pending} onClick={() => void action("stop")}><Square size={15}/>停止评测</button> : <button disabled={pending || !runtime.available} onClick={() => void action("start")}><Play size={15}/>{report ? "重新评测" : "开始评测"}</button>}
        <span role="status">{status.comparison&&running?`${status.comparison.currentProfile} · 方案 ${status.comparison.completed+1}/${status.comparison.total} · `:""}{running ? `${status.current ?? "正在准备"} · ${status.completed}/${status.total}` : status.state === "completed" ? `已完成 ${status.completed}/${status.total}` : status.state === "stopped" ? `已停止 · ${status.completed} 题` : status.state === "failed" ? "评测未完成" : `${status.total} 道评测题`}</span></div>
      <div><HintButton hint="本地模型服务" onClick={() => setAuxiliary("models")}><Settings size={16}/></HintButton><HintButton hint="配置与评分说明" onClick={() => setAuxiliary("rules")}><Info size={16}/></HintButton></div>
    </div>
    {(error || status.error) && <p className="library-evaluation-error" role="alert">{error || status.error}</p>}
    {status.notice&&<p className="library-evaluation-note">{status.notice}</p>}
    <div className="library-evaluation-groups" role="tablist" aria-label="评测难度">
      {evaluationGroups.map(item => {
        const subset = groupRows(report?.rows ?? [], item.id), s = summarizeEvaluation(subset).expanded6;
        return <button role="tab" key={item.id} aria-selected={group === item.id} onClick={() => setGroup(item.id)}><span>{item.label}<small>{subset.length} 题</small></span><strong>{s ? pct(s.microRecall) : "—"}</strong><small>{s ? `命中 ${s.complete}/${s.total} · 题均 ${pct(s.macroRecall)}` : "等待结果"}</small></button>;
      })}
    </div>
    <div className="library-evaluation-metrics" aria-label="当前分组统计">
      <span>原始 @{report?.stageLimits?.raw8??8} <strong>{summary.raw8 ? pct(summary.raw8.microRecall) : "—"}</strong></span>
      <span>上下文 @{report?.stageLimits?.expanded6??6} <strong>{summary.expanded6 ? pct(summary.expanded6.microRecall) : "—"}</strong></span>
      <span>字符覆盖 <strong>{summary.expanded6 ? pct(summary.expanded6.macroCoverage) : "—"}</strong></span>
      <span aria-label="平均返回片段字符数">平均返回字符 <strong>{characters(characterStats.meanChars)}</strong></span>
      <span>全部找齐 <strong>{summary.expanded6?.allQuestions ?? 0}/{valid} 题</strong></span><span>失败 {failed} 题</span>
    </div>
    {report && <div className="library-evaluation-metrics library-evaluation-time-summary" aria-label="评测耗时统计">
      <span>评测总耗时 <strong>{duration(elapsed!)}</strong></span>
      <span>单题平均 <strong>{timing ? seconds(timing.meanMs) : "—"}</strong></span>
      <span>P50 <strong>{timing ? seconds(timing.p50Ms) : "—"}</strong></span>
      <span>P95 <strong>{timing ? seconds(timing.p95Ms) : "—"}</strong></span>
    </div>}
    <div className="library-evaluation-results" role="tabpanel" aria-label={`${evaluationGroups.find(g => g.id === group)?.label}评测结果`}>
      {!rows.length ? <p className="library-evaluation-empty">{running ? "正在评测，结果逐题显示…" : "运行评测后查看结果"}</p> : <table><thead><tr><th>题目</th><th>原始 @{report?.stageLimits?.raw8??8}</th><th>上下文 @{report?.stageLimits?.expanded6??6}</th><th>返回字符</th><th>耗时</th><th><span className="sr-only">详情</span></th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><div><strong>{row.id}</strong><small>{row.difficulty}</small></div><p>{row.question}</p></td><td>{row.state === "failed" ? "未计分" : counts(row.stages.raw8)}</td><td>{row.state === "failed" ? "未计分" : counts(row.stages.expanded6)}</td><td>{characters(row.state === "completed" ? returnedCharacters(row) : undefined)}</td><td>{seconds(row.elapsedMs)}</td><td><HintButton hint={`查看 ${row.id} 详情`} onClick={() => setDetailId(row.id)}>详情<ChevronRight size={14}/></HintButton></td></tr>)}</tbody></table>}
    </div>
    <footer><span>按短引锚点计分 · 困难含高难与超难</span><div><button disabled={!report} onClick={download}><Download size={15}/>导出</button><button onClick={onClose}>完成</button></div></footer>
  </dialog>, document.body)}
    {detail && report && <EvaluationDetail key={detail.id} row={detail} report={report} book={book} onClose={() => setDetailId(undefined)} onJump={onClose}/>}
    {auxiliary && <EvaluationInfo kind={auxiliary} report={report} summary={summary} onClose={() => setAuxiliary(undefined)}/>}
  </>;
}

function EvaluationDetail({ row, report, book, onClose, onJump }: { row: EvaluationRow; report: EvaluationReport; book: LibraryBook; onClose: () => void; onJump: () => void }) {
  const ref = useDialog(), alive = useRef(true), request = useRef(0);
  const [tab, setTab] = useState<"gold" | "hit" | "answer">("gold");
  const [citation, setCitation] = useState<LibraryEvidence>(), [locating, setLocating] = useState(false), [error, setError] = useState("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++; }; }, []);
  async function cite(kind: "gold" | "hit", id: string) {
    const token = ++request.current; setLocating(true); setError("");
    try { const result = await window.piDesktop.library.evaluationEvidence(book.id, { version: report.version, profileId:report.profile?.id,runId:report.runId, question: row.id, kind, id }); if (alive.current && token === request.current) setCitation(result); }
    catch (e) { if (alive.current && token === request.current) setError(String(e)); }
    finally { if (alive.current && token === request.current) setLocating(false); }
  }
  return <>{createPortal(<dialog ref={ref} className="library-model-dialog library-evaluation-detail" aria-label="评测题目详情" onCancel={onClose}>
    <header><div><h2>{row.id} · {row.difficulty}</h2><p>{(row.elapsedMs / 1000).toFixed(2)} 秒 · 上下文命中 {counts(row.stages.expanded6)} · 返回 {characters(row.state === "completed" ? returnedCharacters(row) : undefined)}</p></div><HintButton hint="关闭题目详情" onClick={onClose}><X size={18}/></HintButton></header>
    <p className="library-evaluation-question">{row.question}</p>{row.query&&row.query!==row.question&&<p className="library-evaluation-note">实际检索问题：{row.query}</p>}{!!row.debug?.length&&<details className="library-evaluation-debug"><summary>问题处理调试信息</summary><pre>{JSON.stringify(row.debug,null,2)}</pre></details>}
    <div className="library-evaluation-detail-tabs" role="tablist" aria-label="题目详情内容"><button role="tab" aria-selected={tab === "gold"} onClick={() => setTab("gold")}>标注证据 {row.gold.length}</button><button role="tab" aria-selected={tab === "hit"} onClick={() => setTab("hit")}>召回原文 {row.hits.length}</button>{row.answer && <button role="tab" aria-selected={tab === "answer"} onClick={() => setTab("answer")}>参考答案</button>}</div>
    <div className="library-evaluation-detail-body" role="tabpanel">
      {row.retrievalPlan&&<details className="library-evaluation-debug"><summary>多路检索与证据筛选</summary><ol>{row.retrievalPlan.queries.map((query,i)=><li key={i}>{i===0?"原问题":"子问题 "+i}：{query}</li>)}</ol><pre>{JSON.stringify(row.retrievalPlan,null,2)}</pre></details>}
      {row.contexts&&<details className="library-evaluation-debug"><summary>实际回答上下文 · 合并后的引用原文</summary><pre>{JSON.stringify(row.contexts,null,2)}</pre></details>}
      {row.timings && <div className="library-evaluation-timings" aria-label="单题分阶段耗时">{Object.entries(row.timings).map(([key, ms]) => <span key={key}>{evaluationTimingLabels[key as keyof typeof row.timings]} <strong>{seconds(ms)}</strong></span>)}</div>}
      {(error || row.error) && <p className="library-model-error" role="alert">{error || row.error}</p>}
      {!!row.warnings.length && <p className="library-evaluation-note">{row.warnings.join("；")}</p>}
      {tab === "gold" && row.gold.map((e, i) => {
        const raw = row.stages.raw8?.evidence.find(s => s.id === e.id), expanded = row.stages.expanded6?.evidence.find(s => s.id === e.id);
        return <section className="library-evaluation-source" key={e.id}><div><button className="library-qa-cite" disabled={locating} aria-label={`查看标准证据 ${i + 1}`} onClick={() => void cite("gold", e.id)}>[{i + 1}]</button><strong>{e.supports}</strong><span className={expanded?.complete ? "is-hit" : "is-missing"}>{expanded?.complete ? "已命中" : expanded?.coverage ? "部分覆盖" : "未命中"}</span></div><blockquote>{e.quote}</blockquote><small>原始覆盖 {raw ? pct(raw.coverage) : "—"} · 上下文覆盖 {expanded ? pct(expanded.coverage) : "—"}</small></section>;
      })}
      {tab === "hit" && row.hits.map((hit, i) => {
        const parts=evidenceOverlaps(hit,row.gold),matched=row.gold.filter(e=>parts.some(p=>p.ids.includes(e.id)));
        return <section className="library-evaluation-source" key={hit.id}><div><button className="library-qa-cite" disabled={locating} aria-label={`查看召回引用 ${i + 1}`} onClick={() => void cite("hit", hit.id)}>[{i + 1}]</button><strong>{hit.title}</strong><span>{(row.usedContext?.includes(hit.id)??i < (report.stageLimits?.expanded6??6)) ? "用于回答" : "检索候选"}</span></div>
          {hit.selectionReason&&<small>{hit.selectionReason}</small>}
          {!!matched.length&&<div className="library-evaluation-matched"><small>划线为标注证据</small>{matched.map(e=><button className="library-qa-cite" disabled={locating} key={e.id} aria-label={`查看划线证据 ${e.id}`} onClick={()=>void cite("gold",e.id)}>[{row.gold.indexOf(e)+1}]</button>)}</div>}
          <p>{parts.map(part=>part.ids.length?<u className="library-evaluation-match" key={part.start}>{hit.text.slice(part.start,part.end)}</u>:hit.text.slice(part.start,part.end))}</p></section>;
      })}
      {tab === "answer" && <><h3>参考答案</h3><p className="library-evaluation-answer">{row.answer}</p>{row.reasoning && <><h3>构题说明</h3><p className="library-evaluation-answer">{row.reasoning}</p></>}</>}
    </div><footer><span>{locating ? "正在定位原文…" : "点击 [序号] 查看原文上下文"}</span><button onClick={onClose}>完成</button></footer>
  </dialog>, document.body)}
    {citation && <EvidenceDialog label="评测引用原文" value={citation} description="高亮为当前证据范围。" onClose={() => setCitation(undefined)} onJump={() => { if (citation.page !== undefined) { void useLibrary.getState().open(book, citation.page, citation.pageHighlight); onJump(); } }}/>}
  </>;
}

function EvaluationInfo({ kind, report, summary, onClose }: { kind: "models" | "rules"; report?: EvaluationReport; summary: EvaluationReport["summary"]; onClose: () => void }) {
  const ref = useDialog();
  const timings = summarizeEvaluationTimings(report?.rows ?? []);
  return createPortal(<dialog ref={ref} className="library-model-dialog" aria-label={kind === "models" ? "评测模型服务" : "评测配置与评分说明"} onCancel={onClose}>
    <header><h2>{kind === "models" ? "本地模型服务" : "配置与评分说明"}</h2><HintButton hint="关闭说明" onClick={onClose}><X size={18}/></HintButton></header>
    <div className="library-model-body">{kind === "models" ? <LibraryRuntimeControls/> : <>
      <p>复用当前全书索引和本地模型；每题独立，无对话历史，不生成回答。短引完整覆盖才算命中，多个片段取范围并集，重复不加分。</p><p>四组卡片展示上下文 @{report?.stageLimits?.expanded6??6} 的证据召回率。题均召回按题等权平均，字符覆盖按证据及题目依次平均；失败题不计入分母。</p><p>{report?.note ?? "这批样题适用于相同原书的《凡人修仙传》，需先完成索引。"}</p>
      <p>返回片段字符数为本题所有最终返回片段正文的 UTF-16 长度之和，重叠文字重复计入；不计前后扩展原文、系统提示词或历史。平均值只统计成功题，成功但未返回片段计为 0，失败或缺失数据显示“—”。旧报告直接使用已保存片段计算，无需重新评测。字符数用于比较文本量，不是实际 token 用量。</p>
      {!!Object.keys(summary).length && <div className="library-evaluation-stage-table"><table><thead><tr><th>阶段</th><th>完整命中</th><th>召回率</th><th>题均召回</th></tr></thead><tbody>{Object.entries(summary).map(([key, s]) => <tr key={key}><td>{stageLabel(key,report)}</td><td>{s.complete}/{s.total}</td><td>{pct(s.microRecall)}</td><td>{pct(s.macroRecall)}</td></tr>)}</tbody></table></div>}
      {!!Object.keys(timings).length && <><h3>全题集耗时</h3><p>平均与百分位只统计成功题，P50/P95 使用排序后的最近秩法；未记录的阶段不按零耗时统计。检索合计包含其下各检索阶段，不能重复相加。评测总耗时包含原文校验与准备，不含本地模型启动。</p>
        {report?.preparationMs !== undefined && <p>原文校验与评测准备：{seconds(report.preparationMs)}</p>}
        <div className="library-evaluation-stage-table"><table aria-label="分阶段耗时统计"><thead><tr><th>阶段</th><th>样本数</th><th>平均</th><th>P50</th><th>P95</th></tr></thead><tbody>{(Object.keys(timings) as EvaluationTimingKey[]).map(key => { const value = timings[key]!; return <tr key={key}><td>{evaluationTimingLabels[key]}</td><td>{value.count}</td><td>{seconds(value.meanMs)}</td><td>{seconds(value.p50Ms)}</td><td>{seconds(value.p95Ms)}</td></tr>; })}</tbody></table></div>
        {report && !report.rows.some(row => row.timings) && <p>旧报告仅记录单题总耗时；重新评测后才能查看分阶段耗时。</p>}
      </>}
      {report && <pre className="library-evaluation-config">{JSON.stringify({dataset:report.dataset,datasetHash:report.datasetHash,indexVersion:report.version,indexModel:report.indexModel,revision:report.revision,models:report.settings,profile:report.profile,stageLimits:report.stageLimits,startedAt:new Date(report.startedAt).toLocaleString(),finishedAt:report.finishedAt?new Date(report.finishedAt).toLocaleString():undefined},null,2)}</pre>}
    </>}</div><footer><button onClick={onClose}>完成</button></footer>
  </dialog>, document.body);
}
