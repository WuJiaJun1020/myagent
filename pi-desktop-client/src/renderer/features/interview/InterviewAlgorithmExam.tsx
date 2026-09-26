import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { ArrowLeft, CheckCircle2, Clock3, LoaderCircle, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InterviewAlgorithmMode, InterviewSession } from "../../../shared/contracts/interview";
import { interviewGateway } from "../../services/interview-gateway";
import { useInterviewStore } from "../../stores/interview-store";
import { useUiStore } from "../../stores/ui-store";

const PYTHON_EXTENSIONS = [python()];
const DIFFICULTY = { easy: "简单", medium: "中等", hard: "困难" } as const;
const VERDICT = {
  accepted: "通过", wrong_answer: "答案错误", runtime_error: "运行错误",
  time_limit_exceeded: "运行超时", output_limit_exceeded: "输出超限",
  runtime_unavailable: "Python 不可用", internal_error: "判题器错误",
} as const;

function timeRemaining(deadlineAt: string | null, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(deadlineAt ?? "") - now) / 1_000) || 0);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function InterviewAlgorithmExam({ session }: { session: InterviewSession }) {
  const exam = session.algorithm!;
  const setInterviewView = useUiStore((state) => state.setInterviewView);
  const startExam = useInterviewStore((state) => state.startAlgorithmExam);
  const submitCode = useInterviewStore((state) => state.submitAlgorithmCode);
  const finishInterview = useInterviewStore((state) => state.finishInterview);
  const openInterview = useInterviewStore((state) => state.openInterview);
  const submitting = useInterviewStore((state) => state.algorithmSubmittingId === session.interview.id);
  const [mode, setMode] = useState<InterviewAlgorithmMode>("leetcode");
  const [drafts, setDrafts] = useState(exam.drafts);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [editorTheme, setEditorTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const [starting, setStarting] = useState(false);
  const startedRef = useRef(false);
  const expiredRef = useRef(false);
  const savedDraftsRef = useRef(exam.drafts);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  function queueSave(currentMode: InterviewAlgorithmMode, code: string): Promise<void> {
    const task = saveQueueRef.current.then(async () => {
      if (savedDraftsRef.current[currentMode] === code) return;
      await interviewGateway.saveAlgorithmDraft({ interviewId: session.interview.id, mode: currentMode, code });
      savedDraftsRef.current = { ...savedDraftsRef.current, [currentMode]: code };
    });
    saveQueueRef.current = task.catch((failure: unknown) => {
      setError(failure instanceof Error ? failure.message : String(failure));
    });
    return saveQueueRef.current;
  }

  useEffect(() => {
    const observer = new MutationObserver(() => setEditorTheme(
      document.documentElement.dataset.theme === "light" ? "light" : "dark"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const beginExam = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarting(true);
    setError(null);
    void startExam(session.interview.id).catch((failure: unknown) => {
      setError(failure instanceof Error ? failure.message : String(failure));
    }).finally(() => setStarting(false));
  }, [session.interview.id, startExam]);

  useEffect(() => {
    if (exam.status === "pending") beginExam();
  }, [exam.status, beginExam]);

  useEffect(() => {
    if (exam.status !== "active") return;
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(clock);
  }, [exam.status]);

  useEffect(() => {
    if (exam.status !== "active" || !exam.deadlineAt || submitting || expiredRef.current
      || now < Date.parse(exam.deadlineAt)) return;
    expiredRef.current = true;
    void openInterview(session.interview.id).catch((failure: unknown) => {
      expiredRef.current = false;
      setError(failure instanceof Error ? failure.message : String(failure));
    });
  }, [exam.status, exam.deadlineAt, now, openInterview, session.interview.id, submitting]);

  useEffect(() => {
    if (exam.status !== "active") return;
    const timer = window.setTimeout(() => {
      for (const currentMode of ["leetcode", "acm"] as const) {
        if (drafts[currentMode] === exam.drafts[currentMode]) continue;
        void queueSave(currentMode, drafts[currentMode]);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [drafts, exam.drafts, exam.status, session.interview.id]);

  async function submit(): Promise<void> {
    if (submitting || exam.status !== "active") return;
    setError(null);
    try {
      await queueSave(mode, drafts[mode]);
      await submitCode({ interviewId: session.interview.id,
        operationId: globalThis.crypto?.randomUUID?.() ?? `algorithm-${Date.now()}`,
        mode, code: drafts[mode] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  async function endInterview(): Promise<void> {
    if (submitting || !window.confirm("结束本场面试？算法考核和后续对话都将停止。")) return;
    try {
      await Promise.all((["leetcode", "acm"] as const).map((currentMode) => queueSave(currentMode, drafts[currentMode])));
      await finishInterview(session.interview.id);
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  }

  const problem = exam.problem;
  const latest = exam.attempts.at(-1);
  const expired = exam.status === "active" && now >= Date.parse(exam.deadlineAt ?? "");

  async function backToRecords(): Promise<void> {
    await Promise.all((["leetcode", "acm"] as const).map((currentMode) => queueSave(currentMode, drafts[currentMode])));
    setInterviewView("records");
  }

  return <main className="interview-algorithm-page">
    <header className="interview-algorithm-header">
      <button type="button" onClick={() => { void backToRecords(); }}><ArrowLeft size={16} />面试记录</button>
      <div><small>面试第一阶段 · 算法考核</small><h1>{problem.title}</h1>
        <p>{DIFFICULTY[problem.difficulty]} · 力扣或 ACM 任一模式通过即可进入简历对话</p></div>
      <div className="interview-algorithm-header-actions"><span className="interview-algorithm-timer"><Clock3 size={16} />{exam.status === "pending" ? "10:00" : timeRemaining(exam.deadlineAt, now)}</span>
        <button type="button" disabled={submitting} onClick={() => void endInterview()}>结束面试</button></div>
    </header>
    {exam.status === "pending" && <div className="interview-algorithm-banner">
      {starting && <LoaderCircle className="spin" size={16} />}{error ?? (starting ? "正在启动 10 分钟考核…" : "准备算法考核…")}
      {error && !starting && <button type="button" onClick={() => { startedRef.current = false; beginExam(); }}>重试启动</button>}
    </div>}
    {exam.status === "active" && <div className="interview-algorithm-layout">
      <section className="interview-algorithm-statement">
        <h2>题目说明</h2><p className="interview-algorithm-description">{problem.description}</p>
        {problem.constraints.length > 0 && <><h3>约束</h3><ul>{problem.constraints.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
        <h3>示例</h3>{problem.examples.map((example, index) => <article key={index}>
          <strong>示例 {index + 1}</strong>
          <pre>输入：{mode === "leetcode" ? example.leetcodeInput : example.acmStdin}{"\n"}输出：{mode === "leetcode" ? example.output : example.acmStdout}</pre>
          {example.explanation && <p>{example.explanation}</p>}
          {example.imageDataUrl && <img src={example.imageDataUrl} alt={`示例 ${index + 1}`} />}
        </article>)}
        {mode === "acm" && problem.acm.description && <><h3>ACM 输入输出</h3><p>{problem.acm.description}</p></>}
      </section>
      <section className="interview-algorithm-workspace">
        <div className="interview-algorithm-tabs" role="tablist" aria-label="算法作答模式">
          {(["leetcode", "acm"] as const).map((candidateMode) => <button type="button" role="tab" aria-selected={mode === candidateMode}
            className={mode === candidateMode ? "active" : ""} key={candidateMode} onClick={() => setMode(candidateMode)}>
            {candidateMode === "leetcode" ? "LeetCode" : "ACM"}</button>)}
        </div>
        <div className="interview-algorithm-editor"><CodeMirror key={mode} value={drafts[mode]} extensions={PYTHON_EXTENSIONS} theme={editorTheme}
          onChange={(code) => setDrafts((current) => ({ ...current, [mode]: code }))}
          basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }} /></div>
        <div className="interview-algorithm-actions"><small>代码自动保存到本场面试；只返回判题摘要，不展示完整测试用例。</small>
          <button type="button" disabled={submitting || expired || starting} onClick={() => void submit()}>
            {submitting ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}{submitting ? "判题中…" : "运行并提交"}</button></div>
        {error && <p className="interview-algorithm-error" role="alert">{error}</p>}
        {latest && <div className="interview-algorithm-result"><strong>{latest.mode === "leetcode" ? "LeetCode" : "ACM"} · {VERDICT[latest.verdict]}</strong>
          <span>通过 {latest.passed}/{latest.total} 个测试 · {Math.round(latest.durationMs)} ms · 共提交 {exam.attempts.length} 次</span></div>}
        {expired && <div className="interview-algorithm-banner"><LoaderCircle className="spin" size={15} />时间已到，正在保存结果并进入正式面试…</div>}
      </section>
    </div>}
    <footer><CheckCircle2 size={15} />这道算法题只属于本场面试，不会改变算法练习记录。</footer>
  </main>;
}
