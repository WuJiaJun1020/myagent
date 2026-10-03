import { useEffect, useRef, useState } from "react";
import type { LibraryLocalModels, LibraryModelProbe } from "../../../shared/contracts/smart-library";
import { LIBRARY_RERANK_CASES, LIBRARY_RERANKERS } from "../../../shared/contracts/library-model-cases";
import { LibraryRuntimeControls } from "./LibraryRuntimeControls";

export function LibraryModelPanel({ settings, onChange, onBusyChange, active, disabled = false }: {
  settings: LibraryLocalModels;
  onChange: (settings: LibraryLocalModels) => void;
  onBusyChange: (busy: boolean) => void;
  active: boolean;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Partial<Record<"embedding" | "reranker", string>>>({});
  const [caseId, setCaseId] = useState("direct");
  const [comparisons, setComparisons] = useState<Record<string, LibraryModelProbe>>({});
  const sample = LIBRARY_RERANK_CASES.find(c => c.id === caseId)!;
  const comparisonKey = (model: string) => `${settings.rerankerUrl}|${caseId}|${model}`;
  const current = comparisons[comparisonKey(settings.rerankerModel)];
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => { onBusyChange(!!busy); }, [busy, onBusyChange]);
  useEffect(() => { setResult({}); setError(""); }, [settings.embeddingUrl, settings.embeddingModel, settings.rerankerUrl, settings.rerankerModel]);
  function change(key: keyof LibraryLocalModels, value: string) {
    onChange({ ...settings, [key]: value }); setResult({}); setError("");
  }
  async function run(kind: "embedding" | "reranker") {
    if (disabled || busy || lock.current) return;
    lock.current = true; setBusy(kind); setError("");
    try {
      setResult(r => ({ ...r, [kind]: undefined }));
      const value = await window.piDesktop.library.testLocalModel(kind, settings, caseId);
      if (!alive.current) return;
      if (kind === "reranker") setComparisons(prev => ({ ...prev, [comparisonKey(settings.rerankerModel)]: value }));
      setResult(r => ({ ...r, [kind]: `${value.summary} 耗时 ${(value.elapsedMs / 1000).toFixed(2)} 秒。` }));
    } catch (e) { if (alive.current) setError(String(e)); }
    finally { lock.current = false; if (alive.current) setBusy(""); }
  }
  return <div className="library-model-body library-model-panel">
      <LibraryRuntimeControls active={active} disabled={disabled || !!busy}/>
      <p className="library-model-note">模型设置属于当前方案，点击“保存方案”后生效。测试使用当前填写值与下方自编案例，不读取已导入图书，也不会建立索引。</p>
      <fieldset disabled={disabled || !!busy}><legend>向量化 · 千问 GPU</legend>
        <label>完整接口地址<input aria-label="方案向量接口" value={settings.embeddingUrl} onChange={e => change("embeddingUrl", e.target.value)} spellCheck={false}/></label>
        <label>模型名称<input aria-label="方案向量模型" value={settings.embeddingModel} onChange={e => change("embeddingModel", e.target.value)} spellCheck={false}/></label>
        <div className="library-model-test"><button onClick={() => void run("embedding")}>{busy === "embedding" ? "正在测试…" : "测试向量化"}</button><span>官方 BF16 权重 · 本地 CUDA 推理</span></div>
        {result.embedding && <p role="status">{result.embedding}</p>}
      </fieldset>
      <fieldset disabled={disabled || !!busy}><legend>重排 · 多模型对比</legend>
        <label>完整接口地址<input aria-label="方案重排接口" value={settings.rerankerUrl} onChange={e => change("rerankerUrl", e.target.value)} spellCheck={false}/></label>
        <label>模型名称<input aria-label="方案重排模型" value={settings.rerankerModel} onChange={e => change("rerankerModel", e.target.value)} spellCheck={false}/></label>
        <div className="library-model-choices" role="group" aria-label="选择重排模型">{LIBRARY_RERANKERS.map(model => <button key={model.id} aria-pressed={settings.rerankerModel === model.id} onClick={() => change("rerankerModel", model.id)}>{model.label} · {model.precision}</button>)}</div>
        <p className="library-model-note">GPU 仅驻留一个重排模型，切换后首次测试会重新加载。BGE Base 上限 512 tokens，其余当前为 4096。</p>
        <details className="library-case-picker"><summary>测试案例：{sample.title}</summary><div className="library-model-choices">{LIBRARY_RERANK_CASES.map(c => <button key={c.id} aria-pressed={c.id === caseId} onClick={e => { setCaseId(c.id); setResult(r => ({ ...r, reranker: undefined })); e.currentTarget.closest("details")?.removeAttribute("open"); }}>{c.title}</button>)}</div></details>
        <p><strong>问题：</strong>{sample.query}</p>
        <ol className="library-case-documents">{sample.documents.map((text, i) => <li key={`${caseId}-${i}`}><span>原文 {i + 1}</span><p>{text}</p></li>)}</ol>
        <p className="library-model-note">预期优先：{sample.preferred.length ? sample.preferred.map(i => `原文 ${i + 1}`).join("、") : "无答案，不判定首位命中"}。{sample.explanation}</p>
        <div className="library-model-test"><button onClick={() => void run("reranker")}>{busy === "reranker" ? "正在测试…" : "测试重排"}</button><span>使用上方按钮启动本地服务</span></div>
        {result.reranker && <p role="status">{result.reranker}</p>}
        {current?.scores && <div className="library-score-list" aria-label="当前模型排序">{current.scores.map((row, rank) => <p key={row.index}>第 {rank + 1} 名 · 原文 {row.index + 1}<strong>{row.score.toFixed(6)}</strong></p>)}</div>}
        {LIBRARY_RERANKERS.some(m => comparisons[comparisonKey(m.id)]) && <div className="library-comparisons"><strong>本题已测模型</strong>{LIBRARY_RERANKERS.map(m => {
          const r = comparisons[comparisonKey(m.id)];
          return r && <p key={m.id}>{m.label}：{r.ranking?.map(i => i + 1).join(" → ")} · {r.matched === undefined ? "需人工检查" : r.matched ? "符合预期" : "不符合预期 / 并列"} · {(r.elapsedMs / 1000).toFixed(2)} 秒</p>;
        })}<p className="library-model-note">不同模型的分数尺度不同，不能直接比大小；重点比较排序和证据。耗时包含首次加载；记录仅在本次弹窗内保留。</p></div>}
      </fieldset>
      <p className="library-model-note">以上 8 组案例用于诊断，不是正式图书评测题。重排仅负责排序原文，候选排名不能证明书中存在答案。</p>
      {error && <p role="alert" className="library-model-error">{error}</p>}
      {busy && <p role="status">首次加载模型可能较慢，最多等待 90 秒。</p>}
    </div>;
}
