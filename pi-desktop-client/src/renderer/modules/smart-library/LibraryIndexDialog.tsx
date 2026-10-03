import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { LibraryBook, LibraryIndexChunk, LibraryIndexStatus } from "../../../shared/contracts/smart-library";
import { LibraryRuntimeControls } from "./LibraryRuntimeControls";
import { LibraryAutoRuntimeNotice, useLibraryAutoRuntime } from "./LibraryAutoRuntime";
const labels = { empty: "尚未建立索引", prepared: "已准备，等待开始", running: "正在建立索引", paused: "已暂停", failed: "等待重试", ready: "索引可用" };
export function LibraryIndexDialog({ book, onClose, profileId = "standard-rag", embedded = false }: { book: LibraryBook; onClose: () => void; profileId?: string; embedded?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<LibraryIndexStatus>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [ordinal, setOrdinal] = useState(0);
  const [chunk, setChunk] = useState<LibraryIndexChunk | null>(null);
  const mounted = useRef(true);
  const actionLock = useRef(false);
  const generation = useRef(0);
  const api = window.piDesktop.library;
  const runtime = useLibraryAutoRuntime(profileId);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    if(!embedded)dialog.current?.showModal();
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const poll = async () => {
      const current = generation.current;
      try { const value = await api.indexAction(book.id, "status", profileId); if (alive && !actionLock.current && current === generation.current) setStatus(value); }
      catch (e) { if (alive) setError(String(e)); }
      if (alive) timer = setTimeout(poll, 1200);
    };
    void poll();
    return () => { mounted.current = false; alive = false; clearTimeout(timer); if(!embedded)previous?.focus(); };
  }, [book.id, profileId]);
  useEffect(() => {
    let alive = true; setChunk(null);
    if (status?.version) void api.indexChunk(book.id, ordinal, profileId).then(value => { if (alive) setChunk(value); }).catch(e => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, [book.id, profileId, ordinal, status?.version]);
  async function act(action: "prepare" | "start" | "pause" | "rebuild") {
    if (action === "start" && !runtime.available) return;
    if (actionLock.current) return;
    actionLock.current = true; generation.current++; setBusy(true); setError("");
    try {
      const value = await api.indexAction(book.id, action, profileId);
      if (mounted.current) { setStatus(value); setConfirm(false); if (action === "rebuild") setOrdinal(0); }
    } catch (e) { if (mounted.current) setError(String(e)); }
    finally { actionLock.current = false; if (mounted.current) setBusy(false); }
  }
  const content = <>
    {!embedded&&<header><div><h2 id="library-index-title">图书索引</h2><p>{book.title} · 原文定位与索引</p></div>{!embedded && <button aria-label="关闭图书索引" onClick={onClose}><X size={19}/></button>}</header>}
    <div className="library-model-body">
      <LibraryAutoRuntimeNotice snapshot={runtime.snapshot}/>
      {!embedded&&<LibraryRuntimeControls runtimeStatus={runtime.snapshot.status} disabled={runtime.snapshot.checking || status?.state === "running" || busy}/>}
      <p>使用已保存的本地向量模型。先准备原文并查看处理量，再开始向量化；关闭此窗口或切换模块不会停止任务。</p>
      {error && <p className="library-error" role="alert">{error}</p>}
      <section className="library-index-summary" aria-live="polite">
        <h3>{status ? labels[status.state] : "正在读取状态…"}</h3>
        {status?.version && <><p>{status.chapters.toLocaleString()} 个原文章节 · {status.total.toLocaleString()} 个检索片段 · 预计 {Math.ceil(status.total / 2).toLocaleString()} 批向量请求</p>
          <p>{status.model}{status.dimensions ? ` · ${status.dimensions} 维` : ""}</p>
          <progress value={status.completed} max={Math.max(1, status.total)} aria-label="索引进度"/><p>{status.completed.toLocaleString()} / {status.total.toLocaleString()} 片段已保存</p></>}
        {status?.stale && <p className="library-error" role="alert">切片或向量模型已变化，请重建该方案的索引后再用于问答和评测。</p>}
        {status?.error && <p role="status">{status.error}</p>}
        {status?.activeVersion && status.activeVersion !== status.version && <p>旧索引仍保留；新版本全部完成后才会切换。</p>}
        <div className="library-index-actions">
          {status?.state === "empty" && <button disabled={busy} onClick={() => void act("prepare")}>{busy ? "正在解析原文…" : "准备索引"}</button>}
          {status && ["prepared", "paused", "failed"].includes(status.state) && <button disabled={busy || !runtime.available} onClick={() => void act("start")}>{status.completed ? "继续索引" : "开始索引"}</button>}
          {status?.state === "running" && <button disabled={busy} onClick={() => void act("pause")}>暂停索引</button>}
          {status?.version && status.state !== "running" && <button disabled={busy} onClick={() => setConfirm(!confirm)}>重建索引</button>}
        </div>
        {confirm && <div className="library-index-confirm"><p>重新准备一个独立版本，之后需点击“开始索引”重新向量化。原书、阅读位置及已生效索引会保留。</p><button disabled={busy} onClick={() => void act("rebuild")}>确认准备新版本</button><button onClick={() => setConfirm(false)}>取消</button></div>}
      </section>
      {!!status?.total && <section className="library-index-preview"><h3>原文定位核对</h3>
        <label>检索片段 <input type="number" aria-label="检索片段编号" min={1} max={status.total} value={ordinal + 1} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= status.total) setOrdinal(n - 1); }}/></label>
        <div className="library-index-actions"><button disabled={!ordinal} onClick={() => setOrdinal(n => n - 1)}>上一片段</button><button disabled={ordinal + 1 >= status.total} onClick={() => setOrdinal(n => n + 1)}>下一片段</button></div>
        {chunk ? <><strong>{chunk.title}</strong><p>内部章节序号 {chunk.chapter + 1} · 段落 {chunk.paragraphId} · 字符位置 [{chunk.start}, {chunk.end})</p><blockquote>{chunk.text}</blockquote><small>内部序号包含前言等内容，不等于书中章号。位置按规范化章节的 UTF-16 字符计数，独立于阅读分页。片段保留少量重叠。</small></> : <p>正在读取原文…</p>}
      </section>}
      <p>索引完成后可从“查找原文”检索证据，图书问答与评测会使用所选方案的索引。不会调用回答模型或上传到云端。替换同名模型权重或修改向量配置后，请重建索引。</p>
    </div>{!embedded&&<footer><span>已完成批次会持久保存，客户端重启后可继续。</span><button onClick={onClose}>完成</button></footer>}
  </>;
  return embedded ? <section className="library-index-embedded">{content}</section> : createPortal(<dialog className="library-model-dialog" ref={dialog} onCancel={onClose} aria-labelledby="library-index-title">{content}</dialog>,document.body);
}
