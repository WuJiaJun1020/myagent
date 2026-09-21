import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ClipboardList,
  Braces,
  Database,
  FileQuestion,
  FileText,
  LoaderCircle,
  LibraryBig,
  Plus,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_INTERVIEW_COMPETENCIES,
  type InterviewCreateRequest,
  type InterviewStatus,
  type JobPosting,
} from "../../../shared/contracts/interview";
import { interviewGateway } from "../../services/interview-gateway";
import { useInterviewStore } from "../../stores/interview-store";
import { useUiStore } from "../../stores/ui-store";
import { InterviewRoom } from "./InterviewRoom";
import { JobLibrary } from "./JobLibrary";
import { InterviewQuestionBank } from "./InterviewQuestionBank";
import { AlgorithmPractice } from "./AlgorithmPractice";

const STATUS_LABELS: Record<InterviewStatus, string> = {
  draft: "草稿",
  preparing: "准备中",
  ready: "待开始",
  interviewing: "面试中",
  generating_report: "生成报告",
  completed: "已完成",
};

const INITIAL_FORM: InterviewCreateRequest = {
  title: "",
  candidateName: "",
  positionTitle: "",
  jobDescription: "",
  resumeText: "",
  questionCount: 5,
  competencies: [...DEFAULT_INTERVIEW_COMPETENCIES],
};

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

export function InterviewWorkspace() {
  const interviews = useInterviewStore((state) => state.interviews);
  const counts = useInterviewStore((state) => state.counts);
  const initialized = useInterviewStore((state) => state.initialized);
  const loading = useInterviewStore((state) => state.loading);
  const mutation = useInterviewStore((state) => state.mutation);
  const error = useInterviewStore((state) => state.error);
  const selectedId = useInterviewStore((state) => state.selectedId);
  const initialize = useInterviewStore((state) => state.initialize);
  const createInterview = useInterviewStore((state) => state.createInterview);
  const selectInterview = useInterviewStore((state) => state.selectInterview);
  const setPreparationProgress = useInterviewStore((state) => state.setPreparationProgress);
  const section = useUiStore((state) => state.moduleViews.interview);
  const setInterviewView = useUiStore((state) => state.setInterviewView);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<InterviewCreateRequest>(INITIAL_FORM);
  const selected = useMemo(
    () => interviews.find((interview) => interview.id === selectedId) ?? null,
    [interviews, selectedId],
  );
  const focusedView = section === "algorithms" || section === "question-bank";

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => interviewGateway.onPreparationProgress(setPreparationProgress), [setPreparationProgress]);

  function setField<Key extends keyof InterviewCreateRequest>(key: Key, value: InterviewCreateRequest[Key]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleCompetency(competency: string): void {
    setForm((current) => ({
      ...current,
      competencies: current.competencies.includes(competency)
        ? current.competencies.filter((item) => item !== competency)
        : [...current.competencies, competency],
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      await createInterview(form);
      setForm(INITIAL_FORM);
      setCreating(false);
      setInterviewView("session");
    } catch {
      // The store exposes the validated main-process error next to the form.
    }
  }

  function useCollectedJob(job: JobPosting): void {
    setForm({
      ...INITIAL_FORM,
      positionTitle: job.title,
      jobDescription: job.rawText,
    });
    setInterviewView("dashboard");
    setCreating(true);
  }

  if (section === "session") return <InterviewRoom />;

  return (
    <div className={`interview-page-scroll${focusedView ? " interview-focus-host" : ""}`}>
      <main className={`interview-page${focusedView ? " interview-focus-page" : ""}`}>
        {!focusedView && <header className="interview-page-header">
          <div>
            <span className="eyebrow">INTERVIEW PILOT</span>
            <h1>智能面试</h1>
            <p>独立保存岗位、简历与面试进度，再按场次通过独立模型调用生成必要内容。</p>
          </div>
          {section === "dashboard" && <button className="interview-primary-button" type="button" onClick={() => setCreating(true)}>
            <Plus size={15} />新建面试
          </button>}
        </header>}

        <nav className="interview-section-tabs" aria-label="智能面试功能">
          <button className={section === "dashboard" ? "active" : ""} type="button" onClick={() => setInterviewView("dashboard")}><ClipboardList size={15} />面试记录</button>
          <button className={section === "jobs" ? "active" : ""} type="button" onClick={() => setInterviewView("jobs")}><LibraryBig size={15} />岗位库与采集</button>
          <button className={section === "question-bank" ? "active" : ""} type="button" onClick={() => setInterviewView("question-bank")}><FileQuestion size={15} />面试问答题库</button>
          <button className={section === "algorithms" ? "active" : ""} type="button" onClick={() => setInterviewView("algorithms")}><Braces size={15} />算法练习</button>
        </nav>

        {section === "jobs" ? <JobLibrary onUseJob={useCollectedJob} />
          : section === "question-bank" ? <InterviewQuestionBank onBack={() => setInterviewView("dashboard")} />
            : section === "algorithms" ? <AlgorithmPractice onBack={() => setInterviewView("dashboard")} /> : <>
        <section className="interview-summary-grid" aria-label="面试概览">
          <article><ClipboardList size={18} /><span><small>全部面试</small><strong>{interviews.length}</strong></span></article>
          <article><UserRound size={18} /><span><small>进行中</small><strong>{counts.preparing + counts.ready + counts.interviewing}</strong></span></article>
          <article><Check size={18} /><span><small>已完成</small><strong>{counts.completed}</strong></span></article>
        </section>

        <div className="interview-architecture-note">
          <ShieldCheck size={17} />
          <div><strong>面试记录不会进入普通 Pi 会话</strong><p>SQLite 保存正式业务数据，LanceDB 仅保存可重新生成的检索索引。</p></div>
        </div>

        {error && !creating && (
          <div className="interview-page-error" role="alert">
            <span>{error}</span>
            <button type="button" disabled={loading} onClick={() => void initialize(true)}>重试</button>
          </div>
        )}

        {creating && (
          <form className="interview-create-card" onSubmit={(event) => void submit(event)}>
            <header>
              <div><span className="eyebrow">NEW INTERVIEW</span><h2>创建面试草稿</h2><p>首版先完成文本面试所需的最小输入。</p></div>
              <button type="button" aria-label="关闭创建表单" onClick={() => setCreating(false)}><X size={17} /></button>
            </header>

            <div className="interview-form-grid">
              <label><span>候选人姓名</span><input required maxLength={100} value={form.candidateName} onChange={(event) => setField("candidateName", event.target.value)} placeholder="例如：张三" /></label>
              <label><span>目标岗位</span><input required maxLength={120} value={form.positionTitle} onChange={(event) => setField("positionTitle", event.target.value)} placeholder="例如：后端开发工程师" /></label>
              <label className="wide"><span>面试名称 <small>可选</small></span><input maxLength={160} value={form.title ?? ""} onChange={(event) => setField("title", event.target.value)} placeholder="留空时自动使用岗位与候选人名称" /></label>
              <label className="wide"><span>岗位描述</span><textarea required value={form.jobDescription} onChange={(event) => setField("jobDescription", event.target.value)} placeholder="粘贴 JD，首版支持纯文本…" /></label>
              <label className="wide"><span>简历内容</span><textarea required value={form.resumeText} onChange={(event) => setField("resumeText", event.target.value)} placeholder="粘贴候选人简历，数据仅保存在本机…" /></label>
            </div>

            <div className="interview-form-options">
              <label><span>计划题数</span><select value={form.questionCount} onChange={(event) => setField("questionCount", Number(event.target.value))}><option value={3}>3 题</option><option value={5}>5 题</option><option value={8}>8 题</option><option value={10}>10 题</option></select></label>
              <fieldset><legend>能力维度</legend><div>{DEFAULT_INTERVIEW_COMPETENCIES.map((competency) => <button className={form.competencies.includes(competency) ? "active" : ""} type="button" key={competency} aria-pressed={form.competencies.includes(competency)} onClick={() => toggleCompetency(competency)}>{form.competencies.includes(competency) && <Check size={13} />}{competency}</button>)}</div></fieldset>
            </div>

            {error && <p className="interview-form-error" role="alert">{error}</p>}
            <footer><button type="button" onClick={() => setCreating(false)}>取消</button><button className="primary" type="submit" disabled={mutation || form.competencies.length === 0}>{mutation ? <LoaderCircle className="spin" size={14} /> : <Database size={14} />}{mutation ? "正在保存" : "保存草稿"}</button></footer>
          </form>
        )}

        <section className="interview-records">
          <header><div><span className="eyebrow">LOCAL RECORDS</span><h2>面试记录</h2></div><small>本机持久化</small></header>
          {loading && !initialized ? (
            <div className="interview-loading"><LoaderCircle className="spin" size={17} />正在读取面试数据库…</div>
          ) : interviews.length === 0 ? (
            <div className="interview-empty">
              <div><BriefcaseBusiness size={22} /></div><strong>从一场文本面试开始</strong><p>创建草稿后，即使关闭客户端，岗位、简历和面试配置也会保留。</p>
              <button type="button" onClick={() => setCreating(true)}><Plus size={14} />创建第一场面试</button>
            </div>
          ) : (
            <div className="interview-record-grid">
              {interviews.map((interview) => (
                <button
                  className={interview.id === selected?.id ? "selected" : ""}
                  type="button"
                  key={interview.id}
                  onClick={() => {
                    selectInterview(interview.id);
                    setInterviewView("session");
                  }}
                >
                  <span className="interview-record-icon"><FileText size={17} /></span>
                  <span className="interview-record-copy"><strong>{interview.title}</strong><small>{interview.candidateName} · {interview.positionTitle}</small><span>{interview.competencies.map((item) => <i key={item}>{item}</i>)}</span></span>
                  <span className="interview-record-meta"><em data-status={interview.status}>{STATUS_LABELS[interview.status]}</em><small>{interview.questionCount} 题 · {formatDate(interview.updatedAt)}</small><ArrowRight size={15} /></span>
                </button>
              ))}
            </div>
          )}
        </section>
        </>}
      </main>
    </div>
  );
}
