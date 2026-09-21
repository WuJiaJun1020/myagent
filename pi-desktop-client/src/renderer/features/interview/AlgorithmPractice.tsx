import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Code2,
  Eye,
  EyeOff,
  FileCode2,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  Search,
  Terminal,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  AlgorithmDifficulty,
  AlgorithmMode,
  AlgorithmProblemDetail,
  AlgorithmProblemSummary,
  AlgorithmReferenceAnswer,
  AlgorithmRunResult,
} from "../../../shared/contracts/algorithm-practice";
import { PanelResizeHandle } from "../../components/layout/PanelResizeHandle";
import {
  useAlgorithmPracticeStore,
  type AlgorithmDraftStatus,
  type AlgorithmWorkbenchView,
} from "../../stores/algorithm-practice-store";

const PYTHON_EXTENSIONS = [python()];

const DIFFICULTY_LABELS: Record<AlgorithmDifficulty, string> = {
  easy: "简单",
  medium: "中等",
  hard: "困难",
};

const VERDICT_LABELS: Record<AlgorithmRunResult["verdict"], string> = {
  accepted: "通过",
  wrong_answer: "答案错误",
  runtime_error: "运行错误",
  time_limit_exceeded: "超出时间限制",
  output_limit_exceeded: "超出输出限制",
  runtime_unavailable: "Python 不可用",
  internal_error: "判题器错误",
};

type ProgressFilter = "all" | "solved" | "unsolved";

function modeLabel(mode: AlgorithmMode): string {
  return mode === "leetcode" ? "LeetCode" : "ACM";
}

function saveStatusLabel(status: AlgorithmDraftStatus): string {
  if (status === "dirty") return "等待保存";
  if (status === "saving") return "保存中";
  if (status === "error") return "保存失败";
  return "已自动保存";
}

function formatTime(value?: number): string {
  if (value === undefined) return "—";
  return value < 1 ? "< 1 ms" : `${Math.round(value)} ms`;
}

function useEditorTheme(): "dark" | "light" {
  const readTheme = () => document.documentElement.dataset.theme === "light" ? "light" : "dark";
  const [theme, setTheme] = useState<"dark" | "light">(readTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

function signatureFor(problem: AlgorithmProblemDetail): string {
  const method = problem.leetcode.methodName ?? "solve";
  const parameters = problem.leetcode.parameters
    .map((parameter) => `${parameter.name}: ${parameter.type}`)
    .join(", ");
  const argumentsText = parameters ? `, ${parameters}` : "";
  const returnType = problem.leetcode.returnType ? ` -> ${problem.leetcode.returnType}` : "";
  return `class ${problem.leetcode.className}:\n    def ${method}(self${argumentsText})${returnType}:`;
}

type ProblemNavigatorProps = {
  problems: AlgorithmProblemSummary[];
  categories: Array<{ name: string; count: number }>;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
};

function ProblemNavigator({ problems, categories, selectedSlug, onSelect }: ProblemNavigatorProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState<"all" | AlgorithmDifficulty>("all");
  const [progress, setProgress] = useState<ProgressFilter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    const filtered = problems.filter((problem) => {
      const searchable = [String(problem.id), problem.slug, problem.title, ...problem.tags]
        .join(" ")
        .toLocaleLowerCase("zh-CN");
      const solved = problem.progress.leetcode.solved || problem.progress.acm.solved;
      return (!needle || searchable.includes(needle))
        && (category === "all" || problem.category === category)
        && (difficulty === "all" || problem.difficulty === difficulty)
        && (progress === "all" || (progress === "solved" ? solved : !solved));
    });

    const groups = new Map<string, AlgorithmProblemSummary[]>();
    for (const problem of filtered) {
      const entries = groups.get(problem.category) ?? [];
      entries.push(problem);
      groups.set(problem.category, entries);
    }
    return [...groups.entries()];
  }, [category, difficulty, problems, progress, query]);

  function toggleGroup(name: string): void {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <aside className="algorithm-navigator" aria-label="算法题目目录">
      <header className="algorithm-panel-heading">
        <div><BookOpen size={15} /><strong>题目列表</strong></div>
        <small>{problems.length} 题</small>
      </header>
      <div className="algorithm-navigator-tools">
        <label className="algorithm-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索题目"
            placeholder="搜索题号、标题、标签…"
          />
          {query && <button type="button" aria-label="清除搜索" onClick={() => setQuery("")}><X size={13} /></button>}
        </label>
        <div className="algorithm-filter-grid">
          <select aria-label="按分类筛选" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">全部分类</option>
            {categories.map((item) => <option key={item.name} value={item.name}>{item.name} · {item.count}</option>)}
          </select>
          <select
            aria-label="按难度筛选"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as "all" | AlgorithmDifficulty)}
          >
            <option value="all">全部难度</option>
            <option value="easy">简单</option>
            <option value="medium">中等</option>
            <option value="hard">困难</option>
          </select>
          <select
            aria-label="按完成状态筛选"
            value={progress}
            onChange={(event) => setProgress(event.target.value as ProgressFilter)}
          >
            <option value="all">全部进度</option>
            <option value="solved">已完成</option>
            <option value="unsolved">未完成</option>
          </select>
        </div>
      </div>
      <div className="algorithm-problem-list" tabIndex={0}>
        {filteredGroups.length === 0 ? (
          <div className="algorithm-list-empty"><Search size={18} /><span>没有匹配的题目</span></div>
        ) : filteredGroups.map(([name, items]) => {
          const isCollapsed = collapsed.has(name);
          return (
            <section className="algorithm-problem-group" key={name}>
              <button type="button" className="algorithm-group-toggle" onClick={() => toggleGroup(name)}>
                {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                <strong>{name}</strong><small>{items.length}</small>
              </button>
              {!isCollapsed && items.map((problem) => (
                <button
                  key={problem.slug}
                  type="button"
                  className={problem.slug === selectedSlug ? "algorithm-problem-row active" : "algorithm-problem-row"}
                  onClick={() => onSelect(problem.slug)}
                >
                  <span className="algorithm-problem-number">{problem.id}</span>
                  <span className="algorithm-problem-copy">
                    <strong>{problem.title}</strong>
                    <small data-difficulty={problem.difficulty}>{DIFFICULTY_LABELS[problem.difficulty]}</small>
                  </span>
                  <span className="algorithm-mode-badges" aria-label="完成状态">
                    <i className={problem.progress.leetcode.solved ? "solved" : ""} title="LeetCode 模式">力</i>
                    <i className={problem.progress.acm.solved ? "solved" : ""} title="ACM 模式">A</i>
                  </span>
                </button>
              ))}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

type ProblemStatementProps = {
  problem: AlgorithmProblemDetail;
  mode: AlgorithmMode;
};

function ProblemStatement({ problem, mode }: ProblemStatementProps) {
  return (
    <section className="algorithm-statement" aria-label="题目描述">
      <header className="algorithm-statement-title">
        <div>
          <span>#{problem.id}</span>
          <h2>{problem.title}</h2>
        </div>
        <em data-difficulty={problem.difficulty}>{DIFFICULTY_LABELS[problem.difficulty]}</em>
      </header>
      <div className="algorithm-statement-tags">
        <span>{problem.category}</span>
        {problem.tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <div className="algorithm-statement-scroll" tabIndex={0}>
        <section>
          <h3>题目描述</h3>
          <p className="algorithm-description">{problem.description}</p>
        </section>

        {mode === "leetcode" ? (
          <section>
            <h3>函数签名</h3>
            <pre className="algorithm-signature">{signatureFor(problem)}</pre>
          </section>
        ) : (
          <section>
            <h3>输入输出</h3>
            {problem.acm.description && <p>{problem.acm.description}</p>}
            <dl className="algorithm-io-fields">
              {problem.acm.inputFields.map((field) => (
                <div key={field.name}><dt>{field.name}</dt><dd>{field.type}</dd></div>
              ))}
              <div><dt>输出</dt><dd>{problem.acm.outputType}</dd></div>
            </dl>
          </section>
        )}

        {problem.examples.length > 0 && (
          <section>
            <h3>示例</h3>
            <div className="algorithm-examples">
              {problem.examples.map((example, index) => (
                <article key={index}>
                  <strong>示例 {index + 1}</strong>
                  <div><small>{mode === "leetcode" ? "输入" : "标准输入"}</small><pre>{mode === "leetcode" ? example.leetcodeInput : example.acmStdin}</pre></div>
                  <div><small>{mode === "leetcode" ? "输出" : "标准输出"}</small><pre>{mode === "leetcode" ? example.output : example.acmStdout}</pre></div>
                  {example.explanation && <p><b>解释：</b>{example.explanation}</p>}
                  {(example.imageDataUrl || example.imageFile) && (
                    <img src={example.imageDataUrl ?? example.imageFile} alt={`示例 ${index + 1} 图示`} />
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {problem.constraints.length > 0 && (
          <section>
            <h3>提示</h3>
            <ul>{problem.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}</ul>
          </section>
        )}
        {problem.followUp && <section><h3>进阶</h3><p>{problem.followUp}</p></section>}
      </div>
    </section>
  );
}

type JudgeResultsProps = {
  running: boolean;
  result: AlgorithmRunResult | null;
  error: string | null;
};

function JudgeResults({ running, result, error }: JudgeResultsProps) {
  if (running) {
    return <div className="algorithm-result-state"><LoaderCircle className="spin" size={16} />正在本地运行测试用例…</div>;
  }
  if (error) {
    return <div className="algorithm-result-state error"><CircleAlert size={16} /><span>{error}</span></div>;
  }
  if (!result) {
    return <div className="algorithm-result-state muted"><Terminal size={16} />运行代码后在这里查看逐项结果</div>;
  }

  const accepted = result.verdict === "accepted";
  return (
    <div className="algorithm-judge-results">
      <header className={accepted ? "accepted" : "failed"}>
        {accepted ? <CheckCircle2 size={17} /> : <CircleAlert size={17} />}
        <strong>{VERDICT_LABELS[result.verdict]}</strong>
        <span>{result.passed} / {result.total} 通过</span>
        <small><Clock3 size={12} />{formatTime(result.durationMs)}</small>
      </header>
      {result.error && <pre className="algorithm-run-error">{result.error}</pre>}
      {result.cases.length > 0 && (
        <div className="algorithm-case-list">
          {result.cases.map((testCase) => (
            <details key={testCase.index} open={!testCase.ok}>
              <summary>
                {testCase.ok ? <Check size={13} /> : <X size={13} />}
                <strong>测试 {testCase.index}</strong>
                <span>{testCase.ok ? "通过" : "未通过"}</span>
                <small>{formatTime(testCase.timeMs)}</small>
              </summary>
              <div>
                <label>输入<pre>{testCase.input || "（空）"}</pre></label>
                <label>期望<pre>{testCase.expected || "（空）"}</pre></label>
                <label>实际<pre>{testCase.actual || "（空）"}</pre></label>
                {testCase.error && <label className="wide">错误<pre>{testCase.error}</pre></label>}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

type ReferenceWorkspaceProps = {
  answers: AlgorithmReferenceAnswer[];
  selectedFile: string | null;
  onSelect: (file: string) => void;
  editorTheme: "dark" | "light";
};

function ReferenceWorkspace({ answers, selectedFile, onSelect, editorTheme }: ReferenceWorkspaceProps) {
  const selected = answers.find((answer) => answer.file === selectedFile) ?? answers[0] ?? null;
  if (!selected) {
    return (
      <div className="algorithm-reference-empty">
        <FileCode2 size={23} /><strong>这道题暂无参考实现</strong><span>可以先完成 LeetCode 或 ACM 模式。</span>
      </div>
    );
  }
  return (
    <>
      <div className="algorithm-reference-picker">
        <label>
          <span>参考实现</span>
          <select value={selected.file} onChange={(event) => onSelect(event.target.value)}>
            {answers.map((answer) => (
              <option key={answer.file} value={answer.file}>{modeLabel(answer.mode)} · {answer.name}</option>
            ))}
          </select>
        </label>
        <small>只读 · 可直接运行验证</small>
      </div>
      <div className="algorithm-editor-surface readonly">
        <CodeMirror
          className="algorithm-code-editor"
          value={selected.code}
          extensions={PYTHON_EXTENSIONS}
          theme={editorTheme}
          editable={false}
          basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: false }}
        />
      </div>
    </>
  );
}

type AlgorithmPracticeProps = {
  onBack: () => void;
};

export function AlgorithmPractice({ onBack }: AlgorithmPracticeProps) {
  const snapshot = useAlgorithmPracticeStore((state) => state.snapshot);
  const initialized = useAlgorithmPracticeStore((state) => state.initialized);
  const loading = useAlgorithmPracticeStore((state) => state.loading);
  const error = useAlgorithmPracticeStore((state) => state.error);
  const selectedSlug = useAlgorithmPracticeStore((state) => state.selectedSlug);
  const problem = useAlgorithmPracticeStore((state) => state.problem);
  const problemLoading = useAlgorithmPracticeStore((state) => state.problemLoading);
  const problemError = useAlgorithmPracticeStore((state) => state.problemError);
  const view = useAlgorithmPracticeStore((state) => state.view);
  const activeMode = useAlgorithmPracticeStore((state) => state.activeMode);
  const draftStatus = useAlgorithmPracticeStore((state) => state.draftStatus);
  const saveError = useAlgorithmPracticeStore((state) => state.saveError);
  const running = useAlgorithmPracticeStore((state) => state.running);
  const runningContext = useAlgorithmPracticeStore((state) => state.runningContext);
  const runResult = useAlgorithmPracticeStore((state) => state.runResult);
  const runResultContext = useAlgorithmPracticeStore((state) => state.runResultContext);
  const runError = useAlgorithmPracticeStore((state) => state.runError);
  const initialize = useAlgorithmPracticeStore((state) => state.initialize);
  const selectProblem = useAlgorithmPracticeStore((state) => state.selectProblem);
  const setView = useAlgorithmPracticeStore((state) => state.setView);
  const updateDraft = useAlgorithmPracticeStore((state) => state.updateDraft);
  const saveDraft = useAlgorithmPracticeStore((state) => state.saveDraft);
  const resetDraft = useAlgorithmPracticeStore((state) => state.resetDraft);
  const run = useAlgorithmPracticeStore((state) => state.run);
  const clearRunResult = useAlgorithmPracticeStore((state) => state.clearRunResult);
  const editorTheme = useEditorTheme();
  const workbenchRef = useRef<HTMLDivElement>(null);
  const navigationSequenceRef = useRef(0);
  const [navigatorWidth, setNavigatorWidth] = useState(260);
  const [statementWidth, setStatementWidth] = useState<number | null>(null);
  const [workbenchWidth, setWorkbenchWidth] = useState(0);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(true);
  const [selectedAnswerFile, setSelectedAnswerFile] = useState<string | null>(null);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useLayoutEffect(() => {
    const workbench = workbenchRef.current;
    if (!workbench) return;
    const updateWidth = (): void => {
      const width = Math.round(workbench.getBoundingClientRect().width);
      if (width <= 0) return;
      setWorkbenchWidth((current) => current === width ? current : width);
      setStatementWidth((current) => current ?? Math.max(300, Math.round((width - 4) / 2)));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(workbench);
    return () => observer.disconnect();
  }, [initialized]);

  useEffect(() => {
    if (!problem) {
      setSelectedAnswerFile(null);
      return;
    }
    setSelectedAnswerFile((current) => {
      if (current && problem.answers.some((answer) => answer.file === current)) return current;
      return problem.answers.find((answer) => answer.mode === activeMode)?.file
        ?? problem.answers[0]?.file
        ?? null;
    });
  }, [activeMode, problem]);

  const selectedAnswer = useMemo(
    () => problem?.answers.find((answer) => answer.file === selectedAnswerFile) ?? problem?.answers[0] ?? null,
    [problem, selectedAnswerFile],
  );
  const displayMode = view === "answers" ? selectedAnswer?.mode ?? activeMode : activeMode;
  const currentStatus = draftStatus[activeMode];

  useEffect(() => {
    if (!problem || currentStatus !== "dirty") return;
    const request = { slug: problem.slug, mode: activeMode, code: problem.drafts[activeMode] };
    const timeout = window.setTimeout(() => {
      void saveDraft(request).catch(() => undefined);
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [activeMode, currentStatus, problem, saveDraft]);

  useEffect(() => () => {
    const state = useAlgorithmPracticeStore.getState();
    if (state.problem && (state.draftStatus[state.activeMode] === "dirty" || state.draftStatus[state.activeMode] === "error")) {
      void state.saveDraft({
        slug: state.problem.slug,
        mode: state.activeMode,
        code: state.problem.drafts[state.activeMode],
      }).catch(() => undefined);
    }
  }, []);

  async function flushCurrentDraft(): Promise<void> {
    const state = useAlgorithmPracticeStore.getState();
    const detail = state.problem;
    if (!detail) return;
    const status = state.draftStatus[state.activeMode];
    if (status === "saved") return;
    await state.saveDraft({
      slug: detail.slug,
      mode: state.activeMode,
      code: detail.drafts[state.activeMode],
    });
  }

  async function chooseProblem(slug: string): Promise<void> {
    if (slug === selectedSlug) return;
    const navigationSequence = ++navigationSequenceRef.current;
    try {
      await flushCurrentDraft();
      if (navigationSequence !== navigationSequenceRef.current) return;
      await selectProblem(slug);
    } catch {
      // Keep the current problem visible when its draft could not be persisted.
    }
  }

  async function returnToInterview(): Promise<void> {
    navigationSequenceRef.current += 1;
    try {
      await flushCurrentDraft();
      onBack();
    } catch {
      // Keep the workbench open when the latest draft could not be persisted.
    }
  }

  async function chooseView(nextView: AlgorithmWorkbenchView): Promise<void> {
    if (nextView === view) return;
    const navigationSequence = ++navigationSequenceRef.current;
    try {
      if (view !== "answers") await flushCurrentDraft();
      if (navigationSequence !== navigationSequenceRef.current) return;
      if (nextView === "answers" && problem) {
        const preferred = problem.answers.find((answer) => answer.mode === activeMode) ?? problem.answers[0];
        setSelectedAnswerFile(preferred?.file ?? null);
      }
      setView(nextView);
    } catch {
      // Avoid switching away from an unsaved draft after a persistence failure.
    }
  }

  async function resetCurrentDraft(): Promise<void> {
    if (!problem || view === "answers") return;
    const confirmed = window.confirm(`确认将 ${modeLabel(activeMode)} 代码恢复为初始模板？已通过记录和尝试次数会保留。`);
    if (!confirmed) return;
    try {
      await resetDraft({ slug: problem.slug, mode: activeMode });
    } catch {
      // The store restores the previous draft and exposes the failure inline.
    }
  }

  function runCurrent(): void {
    if (!problem || running) return;
    if (view === "answers") {
      if (!selectedAnswer) return;
      void run({
        slug: problem.slug,
        mode: selectedAnswer.mode,
        code: selectedAnswer.code,
        answerFile: selectedAnswer.file,
      }, "answer");
      return;
    }
    void run({
      slug: problem.slug,
      mode: activeMode,
      code: problem.drafts[activeMode],
    }, "draft");
  }

  const resultMatches = Boolean(
    runResult
      && runResultContext
      && problem
      && runResultContext.slug === problem.slug
      && (view === "answers"
        ? runResultContext.source === "answer" && runResultContext.answerFile === selectedAnswer?.file
        : runResultContext.source === "draft" && runResultContext.mode === activeMode),
  );
  const runningMatches = Boolean(
    running
      && runningContext
      && problem
      && runningContext.slug === problem.slug
      && (view === "answers"
        ? runningContext.source === "answer" && runningContext.answerFile === selectedAnswer?.file
        : runningContext.source === "draft" && runningContext.mode === activeMode),
  );
  const visibleResult = resultMatches ? runResult : null;
  // The store only records runError when the failed request still belongs to
  // the visible problem/view, and clears it whenever that context changes.
  const visibleError = runError;
  const statementMaximum = Math.max(
    300,
    workbenchWidth - (navigatorOpen ? navigatorWidth + 4 : 0) - 420 - 4,
  );
  const workbenchStyle = {
    "--algorithm-navigator-width": `${navigatorWidth}px`,
    "--algorithm-statement-width": statementWidth === null ? "50%" : `${statementWidth}px`,
  } as CSSProperties;

  if (loading && !initialized) {
    return <section className="algorithm-practice-page algorithm-page-state"><LoaderCircle className="spin" size={19} />正在载入本地题库…</section>;
  }
  if (error && !snapshot) {
    return (
      <section className="algorithm-practice-page algorithm-page-state error">
        <CircleAlert size={20} /><strong>题库加载失败</strong><span>{error}</span>
        <button type="button" onClick={() => void initialize(true)}>重新加载</button>
      </section>
    );
  }

  return (
    <section className="algorithm-practice-page" aria-label="算法练习工作台">
      <header className="algorithm-overview">
        <button className="algorithm-back-button" type="button" onClick={() => void returnToInterview()} title="返回智能面试">
          <ArrowLeft size={14} />返回智能面试
        </button>
        <div className="algorithm-overview-title">
          <Code2 size={16} />
          <span><strong>{snapshot?.collection.title ?? "算法题库"}</strong><small>{snapshot?.collection.description}</small></span>
        </div>
        <div className="algorithm-progress-summary">
          <span><i>力</i><strong>{snapshot?.solved.leetcode ?? 0}</strong><small>/ {snapshot?.problems.length ?? 0}</small></span>
          <span><i>A</i><strong>{snapshot?.solved.acm ?? 0}</strong><small>/ {snapshot?.problems.length ?? 0}</small></span>
        </div>
        <span className={snapshot?.runtime.available ? "algorithm-runtime ready" : "algorithm-runtime unavailable"}>
          <i />{snapshot?.runtime.available ? snapshot.runtime.displayName : "Python 不可用"}
        </span>
        <div className="algorithm-pane-toggles">
          <button
            type="button"
            className={navigatorOpen ? "active" : ""}
            onClick={() => setNavigatorOpen((open) => !open)}
            title={navigatorOpen ? "收起题目列表" : "展开题目列表"}
            aria-label={navigatorOpen ? "收起题目列表" : "展开题目列表"}
          >
            {navigatorOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
          <button
            type="button"
            className={statementOpen ? "active" : ""}
            onClick={() => setStatementOpen((open) => !open)}
            title={statementOpen ? "收起题目描述" : "展开题目描述"}
            aria-label={statementOpen ? "收起题目描述" : "展开题目描述"}
          >
            {statementOpen ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </header>

      <div
        className="algorithm-workbench"
        ref={workbenchRef}
        style={workbenchStyle}
        data-navigator-open={navigatorOpen}
        data-statement-open={statementOpen}
      >
        {navigatorOpen && snapshot && (
          <>
            <ProblemNavigator
              problems={snapshot.problems}
              categories={snapshot.categories}
              selectedSlug={selectedSlug}
              onSelect={(slug) => void chooseProblem(slug)}
            />
            <PanelResizeHandle
              label="调整题目列表宽度"
              value={navigatorWidth}
              min={220}
              max={390}
              direction="right"
              oppositeMin={560}
              previewTarget={workbenchRef}
              previewProperty="--algorithm-navigator-width"
              onCommit={setNavigatorWidth}
            />
          </>
        )}

        {problemLoading || (!problem && selectedSlug) ? (
          <div className="algorithm-workbench-loading"><LoaderCircle className="spin" size={17} />正在读取题目…</div>
        ) : problemError || !problem ? (
          <div className="algorithm-workbench-loading error">
            <CircleAlert size={18} /><strong>题目读取失败</strong><span>{problemError ?? "题库中没有可用题目。"}</span>
            {selectedSlug && <button type="button" onClick={() => void selectProblem(selectedSlug, true)}>重试</button>}
          </div>
        ) : (
          <>
            {statementOpen && (
              <>
                <ProblemStatement problem={problem} mode={displayMode} />
                <PanelResizeHandle
                  label="调整题目描述宽度"
                  value={statementWidth ?? Math.max(300, Math.round((workbenchWidth - 4) / 2))}
                  min={300}
                  max={statementMaximum}
                  direction="right"
                  oppositeMin={420}
                  previewTarget={workbenchRef}
                  previewProperty="--algorithm-statement-width"
                  onCommit={setStatementWidth}
                />
              </>
            )}

            <section
              className="algorithm-coding-panel"
              onKeyDown={(event) => {
                if (!(event.ctrlKey || event.metaKey)) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  runCurrent();
                } else if (event.key.toLocaleLowerCase() === "s" && view !== "answers") {
                  event.preventDefault();
                  void flushCurrentDraft().catch(() => undefined);
                }
              }}
            >
              <header className="algorithm-editor-toolbar">
                <nav aria-label="代码模式">
                  <button type="button" className={view === "leetcode" ? "active" : ""} onClick={() => void chooseView("leetcode")}>
                    LeetCode
                    {problem.progress.leetcode.solved && <CheckCircle2 size={12} />}
                  </button>
                  <button type="button" className={view === "acm" ? "active" : ""} onClick={() => void chooseView("acm")}>
                    ACM
                    {problem.progress.acm.solved && <CheckCircle2 size={12} />}
                  </button>
                  <button type="button" className={view === "answers" ? "active" : ""} onClick={() => void chooseView("answers")}>
                    参考答案 <small>{problem.answers.length}</small>
                  </button>
                </nav>
                <div className="algorithm-editor-actions">
                  {view !== "answers" && (
                    <>
                      <span className={`algorithm-save-state ${currentStatus}`}>
                        {currentStatus === "saving" && <LoaderCircle className="spin" size={12} />}
                        {currentStatus === "saved" && <Check size={12} />}
                        {saveStatusLabel(currentStatus)}
                      </span>
                      <button type="button" onClick={() => void resetCurrentDraft()} disabled={currentStatus === "saving"} title="恢复初始模板">
                        <RotateCcw size={14} />重置
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="algorithm-run-button"
                    disabled={running || !snapshot?.runtime.available || (view === "answers" && !selectedAnswer)}
                    onClick={runCurrent}
                    title="运行代码（Ctrl + Enter）"
                  >
                    {runningMatches ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}
                    {runningMatches ? "运行中" : "运行"}
                  </button>
                </div>
              </header>

              {saveError && <div className="algorithm-inline-error"><CircleAlert size={13} />{saveError}</div>}
              {!snapshot?.runtime.available && (
                <div className="algorithm-inline-error runtime"><CircleAlert size={13} />{snapshot?.runtime.message ?? "未找到可用的 Python 运行时。"}</div>
              )}

              <div className="algorithm-editor-area">
                {view === "answers" ? (
                  <ReferenceWorkspace
                    answers={problem.answers}
                    selectedFile={selectedAnswerFile}
                    editorTheme={editorTheme}
                    onSelect={(file) => {
                      clearRunResult();
                      setSelectedAnswerFile(file);
                    }}
                  />
                ) : (
                  <div className="algorithm-editor-surface">
                    <CodeMirror
                      key={`${problem.slug}:${activeMode}`}
                      className="algorithm-code-editor"
                      value={problem.drafts[activeMode]}
                      extensions={PYTHON_EXTENSIONS}
                      theme={editorTheme}
                      onChange={(value) => updateDraft(activeMode, value)}
                      basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
                    />
                  </div>
                )}
              </div>

              <section className="algorithm-results-panel" aria-label="运行结果">
                <header>
                  <span><Terminal size={14} /><strong>运行结果</strong></span>
                  <small>本地 Python 进程设有时间与输出限制，但不是完整安全沙箱。</small>
                </header>
                <div className="algorithm-results-scroll">
                  <JudgeResults running={runningMatches} result={visibleResult} error={visibleError} />
                </div>
              </section>
            </section>
          </>
        )}
      </div>
    </section>
  );
}
