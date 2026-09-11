import { AlertTriangle, BrainCircuit, CheckCircle2, Database, FileText, LoaderCircle, LockKeyhole, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useAgentStore } from "../../stores/agent-store";
import { useResourceStore } from "../../stores/resource-store";

const scopeLabels = { user: "用户级", workspace: "工作区", ancestor: "上级目录" };
const kindLabels = { instructions: "Agent 指令", system: "System Prompt", "append-system": "追加 System Prompt" };

export function MemoryPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const status = useAgentStore((state) => state.processStatus);
  const semanticMemory = useResourceStore((state) => state.semanticMemory);
  const memories = useResourceStore((state) => state.memories);
  const issues = useResourceStore((state) => state.issues);
  const loading = useResourceStore((state) => state.loading);
  const error = useResourceStore((state) => state.error);
  const initialize = useResourceStore((state) => state.initialize);

  useEffect(() => {
    if (!memories.some((memory) => memory.id === selectedId)) setSelectedId(memories[0]?.id ?? null);
  }, [memories, selectedId]);

  const selected = memories.find((memory) => memory.id === selectedId);

  return (
    <div className="resource-page-scroll">
      <main className="resource-page">
        <header className="resource-page-header">
          <div className="resource-page-mark memory"><Database size={21} /></div>
          <div><span className="eyebrow">CONTEXT MEMORY</span><h1>Memory 与上下文来源</h1><p>浏览 Pi 实际注入模型上下文的持久指令，了解其作用域和来源。</p></div>
          <button type="button" disabled={loading || status.state !== "running"} onClick={() => void initialize(status.cwd)}>
            {loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}刷新
          </button>
        </header>

        <section className="memory-summary-grid">
          <article><BrainCircuit size={17} /><span><small>语义/向量 Memory</small><strong>{semanticMemory ? "运行时已启用" : "当前未提供"}</strong></span></article>
          <article><FileText size={17} /><span><small>已加载上下文</small><strong>{memories.length} 个来源</strong></span></article>
          <article><CheckCircle2 size={17} /><span><small>启用范围</small><strong>{new Set(memories.map((memory) => memory.scope)).size} 个层级</strong></span></article>
        </section>

        <div className="resource-security-note memory"><LockKeyhole size={16} /><div><strong>隐私说明</strong><p>这里展示的是 Pi 启动时加载的 `AGENTS.md`、`CLAUDE.md`、`SYSTEM.md` 等上下文文件，不是独立的聊天记录，也不是向量数据库。内容可能包含项目规则或敏感说明，仅保留在本机进程中，桌面端不会另行持久化。</p></div></div>

        {(error || issues.length > 0) && (
          <section className="resource-issues" role="alert"><header><AlertTriangle size={15} /><strong>资源加载问题</strong></header>{error && <p>{error}</p>}{issues.map((issue) => <p key={`${issue.source}:${issue.message}`}><span>{issue.source}</span>{issue.message}</p>)}</section>
        )}

        <section className="resource-section memory-section">
          <header><div><span className="eyebrow">LOADED SOURCES</span><h2>上下文浏览器</h2></div><small>只读</small></header>
          {memories.length === 0 ? (
            <div className="resource-empty"><Database size={22} /><strong>没有加载上下文 Memory</strong><p>当前工作区与用户目录中没有被 Pi 识别的上下文文件，或上下文加载已被关闭。</p></div>
          ) : (
            <div className="memory-browser">
              <nav aria-label="Memory 来源">
                {memories.map((memory) => (
                  <button className={memory.id === selectedId ? "active" : ""} type="button" key={memory.id} onClick={() => setSelectedId(memory.id)}>
                    <FileText size={15} /><span><strong>{memory.name}</strong><small>{scopeLabels[memory.scope]} · {kindLabels[memory.kind]}</small></span><i aria-label="已启用" />
                  </button>
                ))}
              </nav>
              <article className="memory-preview">
                {selected && <><header><div><strong>{selected.name}</strong><code>{selected.source}</code></div><aside><span>{scopeLabels[selected.scope]}</span><span>{kindLabels[selected.kind]}</span><span>已启用</span></aside></header><pre>{selected.content || "（文件为空）"}</pre>{selected.truncated && <footer>内容过长，桌面端仅展示安全截断后的前部内容。</footer>}</>}
              </article>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
