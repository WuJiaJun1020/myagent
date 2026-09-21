import {
  BrainCircuit,
  Database,
  FileQuestion,
  Layers3,
  Search,
  Sparkles,
} from "lucide-react";

const PLANNED_CAPABILITIES = [
  {
    icon: Search,
    title: "按岗位与能力检索",
    description: "按技术方向、岗位、难度和能力维度组织题目。",
  },
  {
    icon: BrainCircuit,
    title: "面试前自主练习",
    description: "逐题作答、查看评分要点，并沉淀个人笔记与错题。",
  },
  {
    icon: Sparkles,
    title: "面试中受控抽题",
    description: "未来通过 RAG 召回候选题，再由面试规则筛选和记录来源。",
  },
] as const;

export function InterviewQuestionBank() {
  return (
    <section className="interview-learning-page" aria-labelledby="question-bank-title">
      <header className="interview-learning-header">
        <div className="interview-learning-icon"><FileQuestion size={22} /></div>
        <div>
          <span className="eyebrow">QUESTION LIBRARY</span>
          <h2 id="question-bank-title">面试问答题库</h2>
          <p>为面试前练习和后续面试 RAG 抽题准备统一、可追溯的题目来源。</p>
        </div>
        <span className="interview-coming-badge">规划中</span>
      </header>

      <div className="interview-learning-boundary">
        <Layers3 size={17} />
        <div>
          <strong>先保留入口，暂不提前生成题库或向量</strong>
          <p>后续题目正文、答案要点和来源将以 SQLite 为事实数据；LanceDB 只保存可重建的检索索引。</p>
        </div>
      </div>

      <div className="interview-learning-grid">
        {PLANNED_CAPABILITIES.map(({ icon: Icon, title, description }) => (
          <article key={title}>
            <Icon size={18} />
            <strong>{title}</strong>
            <p>{description}</p>
          </article>
        ))}
      </div>

      <footer className="interview-learning-footer">
        <span><Database size={15} />当前未创建题库数据，不会影响现有面试记录。</span>
        <button type="button" disabled>进入题库（后续开放）</button>
      </footer>
    </section>
  );
}
