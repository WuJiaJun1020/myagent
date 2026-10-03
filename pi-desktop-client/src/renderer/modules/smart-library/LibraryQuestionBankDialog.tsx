import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, ArrowLeft, Pencil, Check, FlaskConical } from "lucide-react";
import type { LibraryBook, LibraryEvidence } from "../../../shared/contracts/smart-library";
import type { BankEntry, BankAction, QuestionBank } from "../../../shared/contracts/library-question-bank";
import { EvidenceDialog } from "./LibraryEvidenceDialog";
import { HintButton } from "../../components/ui/tooltip";
import { useLibrary } from "./library-store";

const statusLabel={pending:"待审核",approved:"已通过",rejected:"已驳回"};
export default function LibraryQuestionBankDialog({book,onClose}:{book:LibraryBook;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),alive=useRef(true),citationRequest=useRef(0);
  const [bank,setBank]=useState<QuestionBank>(),[selected,setSelected]=useState<string>();
  const [filter,setFilter]=useState("all"),[difficulty,setDifficulty]=useState("全部难度"),[query,setQuery]=useState("");
  const [generation,setGeneration]=useState("all");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[citation,setCitation]=useState<LibraryEvidence>();
  const [editing,setEditing]=useState(false),[edit,setEdit]=useState<BankAction["edit"]>(),[note,setNote]=useState("");
  const row=bank?.entries.find(e=>e.question.sample_id===selected);
  const evidenceChapters=[...new Set(row?.question.evidence.map(e=>Number(e.chapter_id.slice(1)))??[])].sort((a,b)=>a-b);
  const expanded=new Set(bank?.entries.map(e=>e.question.generation??"first")).size>1;
  const visible=bank?.entries.filter(e=>(filter==="all"||(filter==="published"?e.published:e.status===filter))&&(difficulty==="全部难度"||e.question.difficulty===difficulty)&&(generation==="all"||(e.question.generation??"first")===generation)&&`${e.question.sample_id} ${e.question.question}`.toLowerCase().includes(query.toLowerCase()))??[];
  const approveTargets=visible.filter(e=>e.status!=="approved");
  const publishTargets=visible.filter(e=>e.status!=="approved"||!e.published);
  useEffect(()=>{
    alive.current=true;const previous=document.activeElement as HTMLElement;dialog.current?.showModal();
    void window.piDesktop.library.questionBank(book.id).then(value=>{if(alive.current)setBank(value);}).catch(e=>{if(alive.current)setError(String(e));});
    return()=>{alive.current=false;citationRequest.current++;previous?.focus();};
  },[book.id]);
  function select(entry:BankEntry){setSelected(entry.question.sample_id);setNote(entry.reviewNote);setEditing(false);setEdit(undefined);setError("");citationRequest.current++;}
  async function action(value:BankAction["action"]) {
    if(!row||busy)return;setBusy(true);setError("");setNotice("");
    try {const next=await window.piDesktop.library.questionBank(book.id,{id:row.question.sample_id,revision:row.revision,action:value,reviewNote:note,...(value==="save"?{edit}:{})});if(alive.current){setBank(next);setNote(next.entries.find(e=>e.question.sample_id===row.question.sample_id)?.reviewNote??"");setEditing(false);setEdit(undefined);}}
    catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)setBusy(false);}
  }
  async function cite(id:string) {
    if(!row||busy)return;const token=++citationRequest.current;setBusy(true);setError("");
    try{const value=await window.piDesktop.library.questionBankEvidence(book.id,row.question.sample_id,id);if(alive.current&&token===citationRequest.current)setCitation(value);}
    catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)setBusy(false);}
  }
  function beginEdit(){if(!row)return;setEdit({question:row.question.question,answer:row.question.answer,reasoning:row.question.reasoning,supports:row.question.evidence.map(e=>e.supports)});setEditing(true);}
  const noteDirty=!!row&&note!==row.reviewNote;
  const hasDraft=editing||noteDirty;
  async function bulk(publish:boolean) {
    const targets=publish?publishTargets:approveTargets;
    if(busy||hasDraft||!targets.length)return;
    setBusy(true);setError("");setNotice("");
    try {
      const next=await window.piDesktop.library.questionBank(book.id,{action:"approve_many",publish,entries:targets.map(e=>({id:e.question.sample_id,revision:e.revision}))});
      if(alive.current){setBank(next);setNotice(publish?`已通过并加入评测 ${targets.length} 题，重新运行评测后生效。`:`已批量通过 ${targets.length} 题，尚未加入评测的题目仍需加入。`);}
    }catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)setBusy(false);}
  }
  return <>{createPortal(<dialog ref={dialog} className={`library-model-dialog library-bank-dialog ${row?"has-selection":""}`} aria-label="图书题库与审核" onCancel={e=>{if(hasDraft||busy)e.preventDefault();else onClose();}}>
    <header><div><h2>题库与审核</h2><p>{book.title} · {bank?`${bank.entries.length} 道${bank.residentGeneration?"常驻评测题":"候选题"}`:"正在加载…"}</p></div><HintButton aria-label="关闭题库" hint={hasDraft?"请先保存或取消编辑":"关闭题库"} disabled={hasDraft||busy} onClick={onClose}><X size={18}/></HintButton></header>
    <div className="library-bank-filters"><div role="tablist" aria-label="审核状态">{[["all","全部"],["pending","待审核"],["approved","已通过"],["rejected","已驳回"],["published","已入评测"]].map(([key,label])=><button key={key} role="tab" aria-selected={filter===key} disabled={hasDraft||busy} onClick={()=>{setFilter(key);setSelected(undefined);}}>{label}<small>{bank?.entries.filter(e=>key==="all"||(key==="published"?e.published:e.status===key)).length??0}</small></button>)}</div><div><select aria-label="题库难度" disabled={hasDraft||busy} value={difficulty} onChange={e=>{setDifficulty(e.target.value);setSelected(undefined);}}>{["全部难度","简单","中等","困难"].map(d=><option key={d}>{d}</option>)}</select>{expanded&&<select aria-label="题库批次" disabled={hasDraft||busy} value={generation} onChange={e=>{setGeneration(e.target.value);setSelected(undefined);}}><option value="all">全部批次</option><option value="first">首批题目</option><option value="fanren-expansion-v2">本批新增题目</option></select>}<label><Search size={15}/><input aria-label="搜索题库" disabled={hasDraft||busy} placeholder="搜索题目" value={query} onChange={e=>setQuery(e.target.value)}/></label></div></div>
    <div className="library-bank-bulk"><span>批量操作作用于当前筛选结果</span><button disabled={busy||hasDraft||!approveTargets.length} onClick={()=>void bulk(false)}><Check size={14}/>批量通过 ({approveTargets.length})</button><button disabled={busy||hasDraft||!publishTargets.length} onClick={()=>void bulk(true)}><FlaskConical size={14}/>通过并加入评测 ({publishTargets.length})</button></div>
    {error&&<p className="library-evaluation-error" role="alert">{error}</p>}
    <div className="library-bank-layout"><nav className="library-bank-list" aria-label="候选题列表">{visible.map(entry=><button key={entry.question.sample_id} disabled={hasDraft||busy} aria-current={entry===row?"true":undefined} onClick={()=>select(entry)}><div><strong>{entry.question.sample_id} · {entry.question.difficulty}</strong><small>{entry.published?"已入评测":statusLabel[entry.status]}</small></div><p>{entry.question.question}</p><small>全书第 {entry.question.stratum} / 10 区间 · {entry.question.anchor_chapter_id}</small></button>)}{!visible.length&&<p className="library-evaluation-empty">{bank?"暂无符合条件的题目":"正在读取题库…"}</p>}</nav>
    <section className="library-bank-review" aria-label="题目审核详情">{!row?<div className="library-bank-intro"><Check size={28}/><p>选择一道题，核对答案与原文证据</p><small>评测使用已加入的题目，重新运行后生效。</small></div>:<>
      <div className="library-bank-review-heading"><HintButton hint="返回题目列表" disabled={hasDraft||busy} className="library-bank-back" onClick={()=>setSelected(undefined)}><ArrowLeft size={16}/></HintButton><strong>{row.question.sample_id} · {row.question.difficulty}</strong><span>{row.published?"已入评测":statusLabel[row.status]}</span><HintButton hint="编辑题目与答案" disabled={busy||hasDraft} onClick={beginEdit}><Pencil size={16}/></HintButton></div>
      <div className="library-bank-detail-scroll">
        {editing&&edit?<><label>题目<textarea disabled={busy} aria-label="编辑题目" value={edit.question} onChange={e=>setEdit({...edit,question:e.target.value})}/></label><label>参考答案<textarea disabled={busy} aria-label="编辑参考答案" value={edit.answer} onChange={e=>setEdit({...edit,answer:e.target.value})}/></label><label>推理说明<textarea disabled={busy} aria-label="编辑推理说明" value={edit.reasoning} onChange={e=>setEdit({...edit,reasoning:e.target.value})}/></label><p className="library-evaluation-note">保存修改会撤销审核通过与评测资格，需重新审核。</p></>:<><h3>{row.question.question}</h3><h4>参考答案</h4><p>{row.question.answer}</p><h4>推理说明</h4><p>{row.question.reasoning}</p></>}
        {row.question.event_key&&<p className="library-evaluation-note">知识点：{row.question.event_key} · 出题规范 {row.question.prompt_version??"v1"}</p>}
        {row.question.answer_points&&<details><summary>出题时标注的答案要点</summary><ul>{row.question.answer_points.map((point,i)=><li key={i}>{point}</li>)}</ul><small>编辑答案后请重新核对，这些标注不会自动改写。</small></details>}
        {row.question.cross_chapter_reason&&<><h4>跨章节证据为何必要</h4><p className="library-evaluation-note">涉及 {evidenceChapters.length} 个证据章 · 首尾间隔 {evidenceChapters.at(-1)!-evidenceChapters[0]} 个物理章</p><p>{row.question.cross_chapter_reason}</p></>}
        <h4>标注证据 · {row.question.evidence.length}</h4>{row.question.evidence.map((e,i)=><article className="library-evaluation-source" key={e.evidence_id}><div><button className="library-qa-cite" disabled={busy} aria-label={`查看题库证据 ${i+1}`} onClick={()=>void cite(e.evidence_id)}>[{i+1}]</button><strong>{e.chapter_label}</strong><small>{e.chapter_id}</small></div><blockquote>{e.quote}</blockquote>{editing&&edit?<label>支持要点<textarea disabled={busy} aria-label={`编辑证据 ${i+1} 支持要点`} value={edit.supports[i]} onChange={event=>setEdit({...edit,supports:edit.supports.map((v,j)=>i===j?event.target.value:v)})}/></label>:<p>{e.supports}</p>}<small>字符 [{e.start_utf16}, {e.end_utf16}) · 第 {e.line_start}–{e.line_end} 行</small></article>)}
        <label className="library-bank-note">审核备注<textarea disabled={busy} aria-label="审核备注" placeholder="记录答案或证据的问题…" value={note} onChange={e=>setNote(e.target.value)} maxLength={5000}/></label>{noteDirty&&!editing&&<div className="library-bank-note-actions"><button disabled={busy} onClick={()=>setNote(row.reviewNote)}>取消备注修改</button><button disabled={busy} onClick={()=>void action("note")}>保存备注</button></div>}
      </div>
      <div className="library-bank-actions">{editing?<><button disabled={busy} onClick={()=>{setEditing(false);setEdit(undefined);}}>取消编辑</button><button disabled={busy} onClick={()=>void action("save")}>保存并待审</button></>:<><button disabled={busy} onClick={()=>void action("reject")}>驳回</button><button disabled={busy||row.status==="pending"} onClick={()=>void action("reset")}>重新待审</button><button disabled={busy} onClick={()=>void action("approve")}><Check size={14}/>通过审核</button><button disabled={busy||(!row.published&&row.status!=="approved")} onClick={()=>void action(row.published?"unpublish":"publish")}><FlaskConical size={14}/>{row.published?"移出评测":"加入评测"}</button></>}</div>
    </>}</section></div>
    <footer><span>{bank?.model} · 规范 {bank?.promptVersion}</span><span role="status">{busy?"正在处理…":notice||(bank?.residentGeneration?"常驻题集 · 审核记录保存在本地":"新题需主动加入评测 · 审核记录保存在本地")}</span></footer>
  </dialog>,document.body)}
  {citation&&<EvidenceDialog value={hasDraft?{...citation,page:undefined}:citation} label="题库证据原文" description={hasDraft?"高亮为标注证据。请先保存或取消修改，再跳转阅读原文。":"高亮为标注证据，请核对答案是否被充分支持。"} onClose={()=>setCitation(undefined)} onJump={()=>{if(hasDraft)return;if(citation.page!==undefined)void useLibrary.getState().open(book,citation.page,citation.pageHighlight);setCitation(undefined);onClose();}}/>}</>;
}
