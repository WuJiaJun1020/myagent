import { Database, Layers3, ShieldCheck } from "lucide-react";

export function InterviewContextPanel() {
  return (
    <aside className="interview-context-panel">
      <header><span className="eyebrow">INTERVIEW MEMORY</span><strong>面试业务记忆</strong></header>
      <div className="interview-context-state"><ShieldCheck size={20} /><strong>已与 Pi 会话隔离</strong><p>候选人、岗位、问答和评分由面试模块独立持久化。</p></div>
      <section>
        <div><Database size={16} /><span><strong>SQLite</strong><small>业务事实来源</small></span></div>
        <div><Layers3 size={16} /><span><strong>LanceDB</strong><small>可重建向量索引</small></span></div>
      </section>
      <footer>后续调用模型时，只会按当前面试 ID 组装必要上下文。</footer>
    </aside>
  );
}
