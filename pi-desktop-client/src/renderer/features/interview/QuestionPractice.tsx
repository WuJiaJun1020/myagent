import {
  AlertTriangle,
  ArrowLeft,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Eye,
  FileQuestion,
  History,
  ListChecks,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  Save,
  SkipForward,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  QuestionPracticeCurrentItem,
  QuestionPracticeHistoryItem,
  QuestionPracticeSelection,
  QuestionPracticeSelfRating,
  QuestionPracticeSession,
} from "../../../shared/contracts/interview-question-practice";
import type { QuestionBankListQuery } from "../../../shared/contracts/interview-question-bank";
import { PanelResizeHandle } from "../../components/layout/PanelResizeHandle";
import {
  useQuestionPracticeStore,
  type QuestionPracticeDraftStatus,
} from "../../stores/question-practice-store";

const RATING_OPTIONS: Array<{
  value: QuestionPracticeSelfRating;
  label: string;
  description: string;
}> = [
  { value: "needs_review", label: "待复习", description: "关键点缺失，需要再次练习" },
  { value: "developing", label: "基本掌握", description: "方向正确，但表达或细节可完善" },
  { value: "mastered", label: "已掌握", description: "回答完整，可以稳定复述" },
];

const DIFFICULTY_LABELS = {
  introductory: "入门",
  intermediate: "中级",
  advanced: "高级",
} as const;

const KIND_LABELS = {
  technical: "技术原理",
  project: "项目深挖",
  scenario: "场景分析",
  behavioral: "行为沟通",
} as const;

const QUEUE_STATUS_LABELS = {
  pending: "未开始",
  answering: "作答中",
  reviewing: "待自评",
  completed: "已完成",
  skipped: "已跳过",
} as const;

const TAXONOMY_LABELS: Record<string, string> = {
  api: "API",
  backend: "后端开发",
  collaboration: "团队协作",
  communication: "沟通表达",
  cpython: "CPython",
  "engineering-practice": "工程实践",
  evaluation: "评测能力",
  llm: "LLM",
  observability: "可观测性",
  ownership: "责任意识",
  performance: "性能优化",
  "problem-analysis": "问题分析",
  python: "Python",
  quality: "质量保障",
  rag: "RAG",
  reliability: "可靠性",
  security: "安全意识",
  sql: "SQL",
  "system-design": "系统设计",
  "technical-foundation": "技术基础",
  "tradeoff-analysis": "权衡分析",
};

function taxonomyLabel(value: string): string {
  return TAXONOMY_LABELS[value] ?? value.replaceAll("-", " ");
}

export type QuestionPracticeStartContext =
  | {
      kind: "single";
      questionId: string;
      expectedVersion: number;
      title: string;
    }
  | {
      kind: "filtered";
      query: Omit<QuestionBankListQuery, "limit" | "offset">;
      availableCount: number;
    };

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function saveLabel(status: QuestionPracticeDraftStatus): string {
  if (status === "dirty") return "等待保存";
  if (status === "saving") return "保存中";
  if (status === "error") return "保存失败";
  return "已保存";
}

function elapsedFor(item: QuestionPracticeCurrentItem | null, now: number, activeSince: number): number {
  if (!item) return 0;
  const recorded = item.elapsedSeconds ?? 0;
  if (item.review) return recorded;
  return recorded + Math.max(0, Math.floor((now - activeSince) / 1_000));
}

export function QuestionPracticeStartDialog({
  context,
  onClose,
}: {
  context: QuestionPracticeStartContext;
  onClose: () => void;
}) {
  const startSession = useQuestionPracticeStore((state) => state.startSession);
  const mutation = useQuestionPracticeStore((state) => state.mutation);
  const operationError = useQuestionPracticeStore((state) => state.operationError);
  const clearOperationError = useQuestionPracticeStore((state) => state.clearOperationError);
  const maximum = context.kind === "single" ? 1 : Math.max(1, Math.min(30, context.availableCount));
  const [count, setCount] = useState(Math.min(5, maximum));
  const [order, setOrder] = useState<"random" | "latest">("random");

  useEffect(() => () => clearOperationError(), [clearOperationError]);

  async function begin(): Promise<void> {
    const selection: QuestionPracticeSelection = context.kind === "single"
      ? {
          kind: "single",
          questionId: context.questionId,
          expectedVersion: context.expectedVersion,
        }
      : {
          kind: "filtered",
          query: context.query,
          count,
          order,
        };
    const session = await startSession(selection);
    if (session) onClose();
  }

  return (
    <div className="question-practice-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && mutation !== "start") onClose();
    }}>
      <section className="question-practice-dialog" role="dialog" aria-modal="true" aria-labelledby="question-practice-setup-title">
        <header>
          <div><Sparkles size={17} /><span><strong id="question-practice-setup-title">开始问答练习</strong><small>回答提交后才会显示参考内容</small></span></div>
          <button type="button" aria-label="关闭" disabled={mutation === "start"} onClick={onClose}><X size={15} /></button>
        </header>
        <div className="question-practice-dialog-body">
          {context.kind === "single" ? (
            <div className="question-practice-selection-card"><FileQuestion size={17} /><span><small>练习本题</small><strong>{context.title}</strong></span></div>
          ) : (
            <>
              <div className="question-practice-selection-card"><ListChecks size={17} /><span><small>当前筛选范围</small><strong>共有 {context.availableCount} 道匹配题目</strong></span></div>
              <div className="question-practice-setup-grid">
                <label><span>练习题数</span><input type="number" min={1} max={maximum} value={count} onChange={(event) => setCount(Math.max(1, Math.min(maximum, Number(event.target.value) || 1)))} /></label>
                <label><span>出题顺序</span><select value={order} onChange={(event) => setOrder(event.target.value as "random" | "latest")}><option value="random">随机抽题</option><option value="latest">按题库顺序</option></select></label>
              </div>
            </>
          )}
          <div className="question-practice-privacy-note"><CheckCircle2 size={14} /><span>回答和自评仅保存在本机面试数据库，不会进入普通 Pi 会话。</span></div>
          {operationError && <p className="question-practice-dialog-error" role="alert"><AlertTriangle size={14} />{operationError}</p>}
        </div>
        <footer><button type="button" disabled={mutation === "start"} onClick={onClose}>取消</button><button className="primary" type="button" disabled={mutation === "start"} onClick={() => void begin()}>{mutation === "start" ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}{mutation === "start" ? "正在创建" : "开始练习"}</button></footer>
      </section>
    </div>
  );
}

function PracticeQueue({ session, onClose }: { session: QuestionPracticeSession; onClose: () => void }) {
  return (
    <aside className="question-practice-queue" aria-label="本轮题目进度">
      <header><span><ListChecks size={15} /><strong>本轮题目</strong></span><button type="button" aria-label="收起题目进度" onClick={onClose}><X size={14} /></button></header>
      <div>
        {session.queue.map((item) => (
          <article key={item.id} className={item.ordinal === session.currentOrdinal ? "active" : ""} data-status={item.status}>
            <span>{item.ordinal + 1}</span>
            <div><strong>{item.title}</strong><small>{DIFFICULTY_LABELS[item.difficulty]} · {QUEUE_STATUS_LABELS[item.status]}</small></div>
            {item.status === "completed" ? <Check size={13} /> : item.status === "skipped" ? <SkipForward size={13} /> : item.ordinal === session.currentOrdinal ? <ChevronRight size={13} /> : null}
          </article>
        ))}
      </div>
    </aside>
  );
}

function QuestionPane({ item }: { item: QuestionPracticeCurrentItem }) {
  return (
    <section className="question-practice-question-pane" aria-label="练习题目">
      <header>
        <div><span>第 {item.ordinal + 1} 题</span><h2>{item.title}</h2></div>
        <em data-difficulty={item.difficulty}>{DIFFICULTY_LABELS[item.difficulty]}</em>
      </header>
      <div className="question-practice-tags"><span>{KIND_LABELS[item.kind]}</span>{item.skills.map((skill) => <span key={skill}>{taxonomyLabel(skill)}</span>)}</div>
      <div className="question-practice-question-scroll" tabIndex={0}>
        <section><h3>题目</h3><p>{item.prompt}</p></section>
        <section className="question-practice-question-facts">
          <span><Clock3 size={14} /><small>建议作答</small><strong>{Math.max(1, Math.round(item.estimatedSeconds / 60))} 分钟</strong></span>
          <span><Target size={14} /><small>能力维度</small><strong>{item.competencies.map(taxonomyLabel).join("、") || "通用能力"}</strong></span>
        </section>
        <div className="question-practice-hidden-answer"><Eye size={16} /><div><strong>参考内容暂时隐藏</strong><p>提交回答后再查看答案提纲、评分点与常见误区，保留真实练习效果。</p></div></div>
      </div>
    </section>
  );
}

function AnswerPane({
  item,
  elapsedSeconds,
  isLastQuestion,
  onShowQuestion,
}: {
  item: QuestionPracticeCurrentItem;
  elapsedSeconds: number;
  isLastQuestion: boolean;
  onShowQuestion: () => void;
}) {
  const draftAnswer = useQuestionPracticeStore((state) => state.draftAnswer);
  const draftStatus = useQuestionPracticeStore((state) => state.draftStatus);
  const draftError = useQuestionPracticeStore((state) => state.draftError);
  const operationError = useQuestionPracticeStore((state) => state.operationError);
  const mutation = useQuestionPracticeStore((state) => state.mutation);
  const updateDraft = useQuestionPracticeStore((state) => state.updateDraft);
  const saveDraft = useQuestionPracticeStore((state) => state.saveDraft);
  const submitAnswer = useQuestionPracticeStore((state) => state.submitAnswer);
  const completeReview = useQuestionPracticeStore((state) => state.completeReview);
  const skipQuestion = useQuestionPracticeStore((state) => state.skipQuestion);
  const clearOperationError = useQuestionPracticeStore((state) => state.clearOperationError);
  const [rating, setRating] = useState<QuestionPracticeSelfRating | null>(item.selfRating ?? null);
  const [covered, setCovered] = useState<Set<string>>(() => new Set(item.coveredRubricIds));
  const [note, setNote] = useState(item.selfNote ?? "");

  useEffect(() => {
    setRating(item.selfRating ?? null);
    setCovered(new Set(item.coveredRubricIds));
    setNote(item.selfNote ?? "");
    clearOperationError();
  }, [clearOperationError, item.id, item.coveredRubricIds, item.selfNote, item.selfRating]);

  useEffect(() => {
    if (draftStatus !== "dirty") return;
    const timer = window.setTimeout(() => void saveDraft(elapsedSeconds), 700);
    return () => window.clearTimeout(timer);
  }, [draftAnswer, draftStatus, saveDraft]);

  function toggleRubric(id: string): void {
    setCovered((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const review = item.review;
  if (!review) {
    return (
      <section className="question-practice-answer-pane" aria-label="回答输入区">
        <header className="question-practice-answer-toolbar"><div><ClipboardCheck size={15} /><strong>我的回答</strong></div><span className={`question-practice-save-state ${draftStatus}`}>{draftStatus === "saving" ? <LoaderCircle className="spin" size={12} /> : draftStatus === "saved" ? <Check size={12} /> : <Save size={12} />}{saveLabel(draftStatus)}</span></header>
        <textarea autoFocus readOnly={Boolean(mutation)} value={draftAnswer} onChange={(event) => updateDraft(event.target.value)} placeholder="用自己的语言组织答案。提交后才会显示参考框架和评分点…" aria-label="我的回答" />
        {(draftError || operationError) && <div className="question-practice-inline-error" role="alert"><AlertTriangle size={14} /><span>{draftError ?? operationError}</span>{draftError && <button type="button" onClick={() => void saveDraft(elapsedSeconds)}><RefreshCw size={13} />重试保存</button>}</div>}
        <footer>
          <button className="question-practice-mobile-question" type="button" onClick={onShowQuestion}><FileQuestion size={14} />查看题目</button>
          <button type="button" disabled={Boolean(mutation)} onClick={() => void skipQuestion()}>{mutation === "skip" ? <LoaderCircle className="spin" size={14} /> : <SkipForward size={14} />}跳过本题</button>
          <button className="primary" type="button" disabled={Boolean(mutation) || !draftAnswer.trim()} onClick={() => void submitAnswer(elapsedSeconds)}>{mutation === "submit" ? <LoaderCircle className="spin" size={14} /> : <Eye size={14} />}{mutation === "submit" ? "正在提交" : "提交并查看参考"}</button>
        </footer>
      </section>
    );
  }

  return (
    <section className="question-practice-answer-pane reviewing" aria-label="参考内容与自评">
      <header className="question-practice-answer-toolbar"><div><BookOpenCheck size={15} /><strong>参考内容与自评</strong></div><span className="question-practice-submitted"><CheckCircle2 size={12} />回答已提交</span></header>
      <div className="question-practice-review-scroll" tabIndex={0}>
        <section className="question-practice-own-answer"><h3>我的回答</h3><p>{item.answerText || draftAnswer}</p></section>
        {review.intent && <section className="question-practice-review-intent"><h3><Sparkles size={14} />考察意图</h3><p>{review.intent}</p></section>}
        <section><h3>答案提纲</h3>{review.answerOutline.length ? <ol>{review.answerOutline.map((line, index) => <li key={`${index}:${line}`}><span>{index + 1}</span><p>{line}</p></li>)}</ol> : <p className="muted">暂未配置答案提纲。</p>}</section>
        <section><h3>评分点自查</h3><div className="question-practice-rubric">{review.rubric.map((rubric) => <label key={rubric.id} className={covered.has(rubric.id) ? "checked" : ""}><input type="checkbox" disabled={Boolean(mutation)} checked={covered.has(rubric.id)} onChange={() => toggleRubric(rubric.id)} /><span><strong>{rubric.label}{rubric.critical ? " · 关键" : ""}</strong><small>{rubric.description}</small></span></label>)}</div></section>
        {review.commonMistakes.length > 0 && <section className="question-practice-mistakes"><h3>常见误区</h3><ul>{review.commonMistakes.map((mistake) => <li key={mistake}>{mistake}</li>)}</ul></section>}
        <section><h3>自我评价</h3><div className="question-practice-ratings" role="radiogroup" aria-label="掌握程度">{RATING_OPTIONS.map((option) => <button key={option.value} type="button" role="radio" disabled={Boolean(mutation)} aria-checked={rating === option.value} className={rating === option.value ? "active" : ""} onClick={() => setRating(option.value)}><strong>{option.label}</strong><small>{option.description}</small></button>)}</div><label className="question-practice-note"><span>复习备注 <small>可选</small></span><textarea disabled={Boolean(mutation)} value={note} onChange={(event) => setNote(event.target.value)} placeholder="记录仍然模糊的知识点…" /></label></section>
        {operationError && <div className="question-practice-inline-error" role="alert"><AlertTriangle size={14} /><span>{operationError}</span></div>}
      </div>
      <footer><button className="question-practice-mobile-question" type="button" onClick={onShowQuestion}><FileQuestion size={14} />查看题目</button><button className="primary" type="button" disabled={!rating || Boolean(mutation)} onClick={() => rating && void completeReview({ selfRating: rating, coveredRubricIds: [...covered], note })}>{mutation === "review" ? <LoaderCircle className="spin" size={14} /> : <ChevronRight size={14} />}{mutation === "review" ? "正在保存" : isLastQuestion ? "完成本轮练习" : "保存自评并下一题"}</button></footer>
    </section>
  );
}

function PracticeWorkbench() {
  const session = useQuestionPracticeStore((state) => state.session);
  const draftStatus = useQuestionPracticeStore((state) => state.draftStatus);
  const draftError = useQuestionPracticeStore((state) => state.draftError);
  const operationError = useQuestionPracticeStore((state) => state.operationError);
  const mutation = useQuestionPracticeStore((state) => state.mutation);
  const returnToLibrary = useQuestionPracticeStore((state) => state.returnToLibrary);
  const saveDraft = useQuestionPracticeStore((state) => state.saveDraft);
  const submitAnswer = useQuestionPracticeStore((state) => state.submitAnswer);
  const abandonSession = useQuestionPracticeStore((state) => state.abandonSession);
  const workbenchRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef(0);
  const [workbenchWidth, setWorkbenchWidth] = useState(0);
  const [questionWidth, setQuestionWidth] = useState<number | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<"question" | "answer">("answer");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [activeSince, setActiveSince] = useState(Date.now());
  const item = session?.currentItem ?? null;
  const elapsedSeconds = elapsedFor(item, now, activeSince);
  elapsedRef.current = elapsedSeconds;

  useLayoutEffect(() => {
    const workbench = workbenchRef.current;
    if (!workbench) return;
    const update = (): void => {
      const width = Math.round(workbench.getBoundingClientRect().width);
      if (width <= 0) return;
      setWorkbenchWidth((current) => current === width ? current : width);
      setQuestionWidth((current) => current ?? Math.max(300, Math.round((width - 4) / 2)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(workbench);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setMobilePane("answer");
    const resumedAt = Date.now();
    setActiveSince(resumedAt);
    setNow(resumedAt);
  }, [item?.id, item?.review]);

  useEffect(() => {
    if (!item || item.review) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [item]);

  useEffect(() => {
    if (!item || item.review) return;
    const timer = window.setInterval(() => {
      const state = useQuestionPracticeStore.getState();
      if (!state.mutation) void state.saveDraft(elapsedFor(item, Date.now(), activeSince));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [activeSince, item]);

  useEffect(() => () => {
    const state = useQuestionPracticeStore.getState();
    if (!state.mutation && state.session?.currentItem && !state.session.currentItem.review) {
      void state.saveDraft(elapsedRef.current);
    }
  }, []);

  if (!session || !item) return null;
  const queueWidth = queueOpen && workbenchWidth > 980 ? 250 : 0;
  const questionMaximum = Math.max(300, workbenchWidth - queueWidth - 424);
  const style = { "--question-practice-question-width": questionWidth === null ? "50%" : `${questionWidth}px` } as CSSProperties;

  return (
    <section className="question-practice-page" aria-label="面试问答练习工作台">
      <header className="question-practice-overview">
        <button className="question-practice-back" type="button" disabled={Boolean(mutation) || draftStatus === "saving"} onClick={() => void returnToLibrary(elapsedSeconds)}><ArrowLeft size={14} />返回题库</button>
        <div className="question-practice-overview-title"><ClipboardCheck size={16} /><span><strong>问答练习</strong><small>{item.title}</small></span></div>
        <span className="question-practice-progress">{item.ordinal + 1}<small>/ {session.questionCount}</small></span>
        <span className="question-practice-clock"><Clock3 size={13} />{formatElapsed(elapsedSeconds)}</span>
        <button className={queueOpen ? "question-practice-icon-button active" : "question-practice-icon-button"} type="button" aria-label={queueOpen ? "收起题目进度" : "展开题目进度"} title={queueOpen ? "收起题目进度" : "展开题目进度"} onClick={() => setQueueOpen((open) => !open)}><ListChecks size={15} /></button>
        <button className="question-practice-end-button" type="button" disabled={Boolean(mutation) || draftStatus === "saving"} onClick={() => setConfirmEnd(true)}><Pause size={13} />结束</button>
      </header>
      <div className="question-practice-mobile-tabs" role="tablist"><button type="button" role="tab" aria-selected={mobilePane === "question"} className={mobilePane === "question" ? "active" : ""} onClick={() => setMobilePane("question")}>题目</button><button type="button" role="tab" aria-selected={mobilePane === "answer"} className={mobilePane === "answer" ? "active" : ""} onClick={() => setMobilePane("answer")}>{item.review ? "参考与自评" : "我的回答"}</button></div>
      <div
        className="question-practice-workbench"
        ref={workbenchRef}
        style={style}
        data-mobile-pane={mobilePane}
        onKeyDown={(event) => {
          if (!(event.ctrlKey || event.metaKey) || event.nativeEvent.isComposing) return;
          if (mutation) return;
          if (event.key.toLowerCase() === "s" && !item.review) {
            event.preventDefault();
            void saveDraft(elapsedSeconds);
          } else if (event.key === "Enter" && !item.review) {
            event.preventDefault();
            void submitAnswer(elapsedSeconds);
          }
        }}
      >
        {queueOpen && <PracticeQueue session={session} onClose={() => setQueueOpen(false)} />}
        <QuestionPane item={item} />
        <PanelResizeHandle label="调整题目与作答区域宽度" value={questionWidth ?? Math.max(300, Math.round((workbenchWidth - 4) / 2))} min={300} max={questionMaximum} direction="right" oppositeMin={420} previewTarget={workbenchRef} previewProperty="--question-practice-question-width" onCommit={setQuestionWidth} />
        <AnswerPane item={item} elapsedSeconds={elapsedSeconds} isLastQuestion={item.ordinal + 1 >= session.questionCount} onShowQuestion={() => setMobilePane("question")} />
      </div>
      {confirmEnd && <div className="question-practice-dialog-backdrop" role="presentation"><section className="question-practice-dialog compact" role="alertdialog" aria-modal="true" aria-labelledby="question-practice-end-title"><header><div><AlertTriangle size={17} /><span><strong id="question-practice-end-title">结束本轮练习？</strong><small>已保存的回答仍会保留在练习历史中</small></span></div></header><div className="question-practice-dialog-body"><p>结束后本轮会标记为“已终止”，不能继续作答。若只是暂时离开，请使用“返回题库”。</p>{(draftError || operationError) && <p className="question-practice-dialog-error" role="alert"><AlertTriangle size={14} />{draftError ?? operationError}</p>}</div><footer><button type="button" disabled={Boolean(mutation) || draftStatus === "saving"} onClick={() => setConfirmEnd(false)}>继续练习</button><button className="danger" type="button" disabled={Boolean(mutation) || draftStatus === "saving"} onClick={async () => { if (await abandonSession(elapsedSeconds)) setConfirmEnd(false); }}>{mutation === "abandon" ? <LoaderCircle className="spin" size={14} /> : null}{mutation === "abandon" ? "正在结束" : "确认结束"}</button></footer></section></div>}
    </section>
  );
}

function PracticeSummaryView({ session }: { session: QuestionPracticeSession }) {
  const returnToLibrary = useQuestionPracticeStore((state) => state.returnToLibrary);
  const openHistory = useQuestionPracticeStore((state) => state.openHistory);
  const summary = session.summary;
  return (
    <section className="question-practice-page question-practice-summary-page">
      <header className="question-practice-overview"><button className="question-practice-back" type="button" onClick={() => void returnToLibrary()}><ArrowLeft size={14} />返回题库</button><div className="question-practice-overview-title"><ClipboardCheck size={16} /><span><strong>练习总结</strong><small>{session.status === "completed" ? "本轮练习已完成" : "本轮练习已结束"}</small></span></div><button className="question-practice-history-button" type="button" onClick={() => void openHistory()}><History size={14} />练习历史</button></header>
      <div className="question-practice-summary-scroll">
        <section className="question-practice-summary-hero"><div className={session.status === "completed" ? "complete" : "abandoned"}>{session.status === "completed" ? <CheckCircle2 size={25} /> : <Pause size={23} />}</div><span><small>{session.status === "completed" ? "PRACTICE COMPLETE" : "PRACTICE ENDED"}</small><h2>{session.status === "completed" ? "本轮练习完成" : "本轮练习已结束"}</h2><p>本轮结果和题目版本已经保存，可在练习历史中查看统计。</p></span></section>
        <section className="question-practice-summary-grid"><article><strong>{summary.answered}</strong><small>已回答</small></article><article><strong>{summary.reviewed}</strong><small>已自评</small></article><article><strong>{summary.skipped}</strong><small>已跳过</small></article><article><strong>{formatElapsed(summary.totalElapsedSeconds)}</strong><small>累计用时</small></article></section>
        <section className="question-practice-rating-summary"><h3>掌握程度</h3><div>{RATING_OPTIONS.map((rating) => <span key={rating.value} data-rating={rating.value}><strong>{summary.ratingCounts[rating.value]}</strong><small>{rating.label}</small></span>)}</div></section>
        {(summary.weakSkills.length > 0 || summary.weakCompetencies.length > 0) && <section className="question-practice-weakness"><h3><Target size={15} />建议复习</h3><div>{summary.weakSkills.map((item) => <span key={`skill:${item.value}`}>{taxonomyLabel(item.value)}<small>{item.count}</small></span>)}{summary.weakCompetencies.map((item) => <span key={`competency:${item.value}`}>{taxonomyLabel(item.value)}<small>{item.count}</small></span>)}</div></section>}
        <footer><button type="button" onClick={() => void openHistory()}><History size={14} />查看练习历史</button><button className="primary" type="button" onClick={() => void returnToLibrary()}><ArrowLeft size={14} />返回题库继续准备</button></footer>
      </div>
    </section>
  );
}

function historyStatus(item: QuestionPracticeHistoryItem): string {
  if (item.status === "active") return "进行中";
  if (item.status === "completed") return "已完成";
  return "已结束";
}

function PracticeHistoryView() {
  const history = useQuestionPracticeStore((state) => state.history);
  const historyTotal = useQuestionPracticeStore((state) => state.historyTotal);
  const historyHasMore = useQuestionPracticeStore((state) => state.historyHasMore);
  const historyLoading = useQuestionPracticeStore((state) => state.historyLoading);
  const historyLoadingMore = useQuestionPracticeStore((state) => state.historyLoadingMore);
  const historyError = useQuestionPracticeStore((state) => state.historyError);
  const sessionError = useQuestionPracticeStore((state) => state.sessionError);
  const closeHistory = useQuestionPracticeStore((state) => state.closeHistory);
  const openHistory = useQuestionPracticeStore((state) => state.openHistory);
  const loadMoreHistory = useQuestionPracticeStore((state) => state.loadMoreHistory);
  const resumeSession = useQuestionPracticeStore((state) => state.resumeSession);
  return (
    <section className="question-practice-page question-practice-history-page">
      <header className="question-practice-overview"><button className="question-practice-back" type="button" onClick={closeHistory}><ArrowLeft size={14} />返回题库</button><div className="question-practice-overview-title"><History size={16} /><span><strong>练习历史</strong><small>继续未完成练习或回看往期总结</small></span></div><span className="question-practice-history-total">共 {historyTotal} 次</span></header>
      <div className="question-practice-history-scroll">
        {historyLoading ? <div className="question-practice-state"><LoaderCircle className="spin" size={18} />正在读取练习历史…</div>
          : historyError && history.length === 0 ? <div className="question-practice-state error"><AlertTriangle size={19} /><strong>历史记录加载失败</strong><span>{historyError}</span><button type="button" onClick={() => void openHistory()}><RefreshCw size={13} />重试</button></div>
            : history.length === 0 ? <div className="question-practice-state"><History size={20} /><strong>还没有练习记录</strong><span>从题库选择题目开始第一轮练习。</span></div>
              : <div className="question-practice-history-list">{history.map((item) => <button key={item.id} type="button" onClick={() => void resumeSession(item.id)}><span className="question-practice-history-icon" data-status={item.status}>{item.status === "completed" ? <CheckCircle2 size={17} /> : item.status === "active" ? <Play size={17} /> : <Pause size={17} />}</span><span className="question-practice-history-copy"><strong>{item.selectionKind === "single" ? "单题练习" : `${item.questionCount} 题练习`}</strong><small>{formatDate(item.startedAt)} · 回答 {item.answered} · 自评 {item.reviewed} · 跳过 {item.skipped}</small></span><em data-status={item.status}>{historyStatus(item)}</em><ChevronRight size={15} /></button>)}</div>}
        {historyError && history.length > 0 && <div className="question-practice-inline-error"><AlertTriangle size={14} /><span>{historyError}</span></div>}
        {sessionError && <div className="question-practice-inline-error" role="alert"><AlertTriangle size={14} /><span>{sessionError}</span></div>}
        {historyHasMore && <button className="question-practice-history-more" type="button" disabled={historyLoadingMore} onClick={() => void loadMoreHistory()}>{historyLoadingMore && <LoaderCircle className="spin" size={14} />}{historyLoadingMore ? "正在加载" : "加载更多记录"}</button>}
      </div>
    </section>
  );
}

export function QuestionPracticeExperience() {
  const screen = useQuestionPracticeStore((state) => state.screen);
  const session = useQuestionPracticeStore((state) => state.session);
  const sessionLoading = useQuestionPracticeStore((state) => state.sessionLoading);
  const sessionError = useQuestionPracticeStore((state) => state.sessionError);
  const closeHistory = useQuestionPracticeStore((state) => state.closeHistory);
  const resumeSession = useQuestionPracticeStore((state) => state.resumeSession);

  if (sessionLoading) return <section className="question-practice-page"><div className="question-practice-state"><LoaderCircle className="spin" size={18} />正在恢复练习…</div></section>;
  if (screen === "history") return <PracticeHistoryView />;
  if (sessionError && !session) return <section className="question-practice-page"><div className="question-practice-state error"><AlertTriangle size={19} /><strong>练习读取失败</strong><span>{sessionError}</span><div><button type="button" onClick={closeHistory}><ArrowLeft size={13} />返回题库</button>{useQuestionPracticeStore.getState().overview?.activeSession && <button type="button" onClick={() => void resumeSession(useQuestionPracticeStore.getState().overview!.activeSession!.id)}><RefreshCw size={13} />重试</button>}</div></div></section>;
  if (!session) return null;
  if (screen === "summary" || session.status !== "active") return <PracticeSummaryView session={session} />;
  return <PracticeWorkbench />;
}
