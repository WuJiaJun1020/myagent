import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X, ArrowUpRight, ChevronDown } from "lucide-react";
import type { LibraryBook, LibraryEvidence, LibrarySearchRequest, LibrarySearchResult } from "../../../shared/contracts/smart-library";
import { useLibrary } from "./library-store";
import { LibraryRuntimeControls } from "./LibraryRuntimeControls";

export function Highlight({ text, range }: { text: string; range?: { start: number; end: number } }) {
  if (!range || range.end <= range.start) return <>{text}</>;
  return <>{text.slice(0, range.start)}<mark>{text.slice(range.start, range.end)}</mark>{text.slice(range.end)}</>;
}
export default function LibrarySearchDialog({ book, page, onClose }: { book: LibraryBook; page: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<LibrarySearchRequest["mode"]>("hybrid");
  const [scope, setScope] = useState("current");
  const [rerank, setRerank] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ value: LibrarySearchResult; request: LibrarySearchRequest }>();
  const [expanded, setExpanded] = useState("");
  const [evidence, setEvidence] = useState<Record<string, LibraryEvidence>>({});
  const [locating, setLocating] = useState("");
  const [runtimeOpen, setRuntimeOpen] = useState(false);
  const alive = useRef(true); const token = useRef(""); const generation = useRef(0);
  const api = window.piDesktop.library;
  useEffect(() => {
    alive.current = true; const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { alive.current = false; generation.current++; if (token.current) void api.cancelSearch(book.id, token.current).catch(() => {}); previous?.focus(); };
  }, [book.id]);
  function clear() { generation.current++; setResult(undefined); setExpanded(""); setEvidence({}); setError(""); setLocating(""); }
  async function search() {
    if (token.current || !query.trim()) return;
    clear(); const request: LibrarySearchRequest = { token: crypto.randomUUID(), query: query.trim(), mode, rerank, ...(scope === "current" ? { readingPage: page } : {}) };
    token.current = request.token; setBusy(true);
    try { const value = await api.search(book.id, request); if (alive.current && token.current === request.token) setResult({ value, request }); }
    catch (e) { if (alive.current) setError(String(e)); }
    finally { token.current = ""; if (alive.current) setBusy(false); }
  }
  async function locate(id: string, jump: boolean) {
    if (!result) return;
    const current = generation.current; setError(""); setLocating(id);
    try {
      // Resolve again for jumps: an index may have been replaced since preview opened.
      const value = !jump && evidence[id] ? evidence[id] : await api.evidence(book.id, { version: result.value.version, id, readingPage: result.request.readingPage });
      if (!alive.current || generation.current !== current) return;
      setEvidence(previous => ({ ...previous, [id]: value }));
      if (jump && value.page !== undefined) { void useLibrary.getState().open(book, value.page, value.pageHighlight); onClose(); }
      else { setExpanded(id); if (jump) setError(value.locationError ?? "无法跳转至阅读页"); }
    } catch (e) { if (alive.current && generation.current === current) setError(String(e)); }
    finally { if (alive.current && generation.current === current) setLocating(""); }
  }
  return createPortal(<dialog className="library-model-dialog library-retrieval-dialog" ref={dialog} onCancel={onClose} aria-labelledby="library-search-title">
    <header><div><h2 id="library-search-title">查找原文</h2><p>{book.title}</p></div><button aria-label="关闭原文检索" onClick={onClose}><X size={18}/></button></header>
    <form className="library-retrieval-form" onSubmit={e => { e.preventDefault(); void search(); }}>
      <label className="library-retrieval-query"><Search size={17}/><input autoFocus aria-label="原文检索问题" placeholder="输入人名、原句或想查找的问题" maxLength={200} disabled={busy} value={query} onChange={e => { setQuery(e.target.value); clear(); }}/></label>
      <div className="library-retrieval-options">
        <label>范围<select aria-label="检索范围" disabled={busy} value={scope} onChange={e => { setScope(e.target.value); clear(); }}><option value="current">截至当前阅读页</option><option value="whole">全书</option></select></label>
        <label>检索方式<select aria-label="检索方式" disabled={busy} value={mode} onChange={e => { setMode(e.target.value as typeof mode); clear(); }}><option value="hybrid">混合检索</option><option value="keyword">仅关键词</option><option value="vector">仅语义</option></select></label>
        <label className="library-rerank-toggle"><input type="checkbox" disabled={busy} checked={rerank} onChange={e => { setRerank(e.target.checked); clear(); }}/>重排</label>
        {busy ? <button type="button" onClick={() => void api.cancelSearch(book.id, token.current).catch(e => setError(String(e)))}>停止检索</button> : <button type="submit" disabled={!query.trim()}>查找</button>}
      </div>
      <small>{scope === "current" ? `仅检索至“${book.chapters[page]?.title}”当前阅读页末尾，包含本页全部内容。` : "允许检索全书，结果可能包含尚未阅读的情节。"}</small>
    </form>
    <div className="library-model-body library-retrieval-body" aria-busy={busy}>
      {error && <p className="library-error" role="alert">{error}</p>}
      {busy && <p role="status">正在检索并核对本书原文…</p>}
      {!result && !busy && <div className="library-retrieval-intro"><p>先查证据，再看上下文</p><span>本阶段只展示原文，不生成答案。可关闭重排，比较关键词、语义和混合召回。</span><details onToggle={e => setRuntimeOpen(e.currentTarget.open)}><summary>本地模型服务</summary>{runtimeOpen && <LibraryRuntimeControls/>}</details></div>}
      {result && <><div className="library-retrieval-summary" role="status">{result.value.hits.length} 条候选 · {(result.value.elapsedMs / 1000).toFixed(2)} 秒<span>关键词召回 {result.value.keywordCount} · 语义召回 {result.value.vectorCount} · {result.value.reranked ? "已重排" : "未重排"}</span></div>
        {result.value.warnings.map((warning, i) => <p className="library-retrieval-warning" key={i} role="status">{warning}</p>)}
        {!result.value.hits.length && <p>未找到候选原文。可以换一个说法或调整阅读范围；这不代表书中没有答案。</p>}
        <ol className="library-retrieval-results">{result.value.hits.map((hit, i) => <li key={hit.id}>
          <div className="library-hit-heading"><strong><span>{i + 1}</span>{hit.title}</strong><button disabled={!!locating} onClick={() => void locate(hit.id, true)}><ArrowUpRight size={15}/>阅读原文</button></div>
          <p className="library-hit-excerpt">{hit.text}</p>
          <div className="library-hit-meta"><span>{hit.keywordRank ? `关键词 #${hit.keywordRank}　` : ""}{hit.vectorRank ? `语义 #${hit.vectorRank}　` : ""}{hit.rerankScore !== undefined ? `重排 ${hit.rerankScore.toFixed(4)}` : ""}</span><button aria-expanded={expanded === hit.id} onClick={() => expanded === hit.id ? setExpanded("") : void locate(hit.id, false)} disabled={!!locating}><ChevronDown size={14}/>{locating === hit.id ? "正在定位…" : expanded === hit.id ? "收起上下文" : "查看上下文"}</button></div>
          {expanded === hit.id && evidence[hit.id] && <div className="library-hit-context"><small>片段 {hit.ordinal + 1} · 字符 [{hit.start}, {hit.end}) · 高亮为命中片段</small><p><Highlight text={evidence[hit.id].text} range={evidence[hit.id].highlight}/></p>{evidence[hit.id].locationError && <p>{evidence[hit.id].locationError}</p>}</div>}
        </li>)}</ol></>}
    </div><footer><span>分数用于排序，不代表答案正确或书中存在答案。</span><button onClick={onClose}>完成</button></footer>
  </dialog>, document.body);
}
