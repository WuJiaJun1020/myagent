import { useInterviewDeleteConfirmation } from "./use-interview-delete-confirmation";
import { HintButton } from "../../components/ui/tooltip";
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
  Trash2,
  UserRound,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_INTERVIEW_COMPETENCIES,
  DEFAULT_INTERVIEW_CHAT_SETTINGS,
  DEFAULT_CANDIDATE_CHAT_SETTINGS,
  DEFAULT_CANDIDATE_ERROR_RATE,
  DEFAULT_DIRECTOR_CHAT_SETTINGS,
  DEFAULT_SCORE_CHAT_SETTINGS,
  MAX_INTERVIEW_ROUNDS,
  type InterviewCreateRequest,
  type InterviewChatPrompts,
  type InterviewChatSettings,
  type InterviewChatModelInfo,
  type InterviewStatus,
  type JobPosting,
} from "../../../shared/contracts/interview";
import { DEFAULT_INTERVIEW_CHAT_PROMPTS } from "../../../shared/interview-chat-prompt";
import { DEFAULT_INTERVIEW_CANDIDATE_PROMPT } from "../../../shared/interview-candidate-prompt";
import { DEFAULT_INTERVIEW_DIRECTOR_PROMPT } from "../../../shared/interview-director-prompt";
import { interviewGateway } from "../../services/interview-gateway";
import { useInterviewStore } from "../../stores/interview-store";
import { useJobLibraryStore } from "../../stores/job-library-store";
import { useUiStore } from "../../stores/ui-store";
import { InterviewRoom } from "./InterviewRoom";
import { JobLibrary } from "./JobLibrary";
import { InterviewQuestionBank } from "./InterviewQuestionBank";
import { AlgorithmPractice } from "./AlgorithmPractice";
import { saveInterviewChatPrompts } from "./interview-prompt-preferences";
import { saveInterviewChatSettings } from "./interview-chat-preferences";
import { saveInterviewCandidatePreferences } from "./interview-candidate-preferences";
import { saveInterviewDirectorPreferences } from "./interview-director-preferences";
import { InterviewCreateDialog } from "./InterviewCreateDialog";
import { InterviewJobPicker } from "./InterviewJobPicker";
import { InterviewCreateAgentSettings } from "./InterviewCreateAgentSettings";
import { DEFAULT_INTERVIEW_SCORE_PROMPT } from "../../../shared/interview-score";
import { saveInterviewScorePrompt, saveInterviewScoreSettings } from "./interview-score-preferences";

const STATUS_LABELS: Record<InterviewStatus, string> = {
  draft: "草稿",
  preparing: "准备中",
  ready: "待开始",
  interviewing: "面试中",
  generating_report: "生成报告",
  completed: "已完成",
};

const TEST_RESUME = `【虚构测试人物 · 仅用于功能调试】
林澈，4 年后端与 AI 应用开发经验。近两年主要负责企业内部 Agent 应用，常用 Python、TypeScript、FastAPI、PostgreSQL、Redis 和 LangGraph。

项目一：企业知识与流程助手（2025 年至今）
面向售后团队，支持查询产品手册、定位工单、生成处理建议和提交审批。本人负责 Agent 工作流设计与主要后端实现：用 LangGraph 管理检索、工具调用、人工确认和结果整理的状态；将工单查询、知识库检索、草稿创建封装为权限受控的工具；对写操作设置人工确认。为了避免旧资料影响回答，参与实现了文档版本标记和引用来源展示。
团队每周抽样复核 100 条会话。上线三个月后，抽样中的“无需人工改写即可发送的建议”占比从约 48% 提升到 65%。这个指标受样本和人工判定影响，尚未做严格的因果实验。

项目二：客服工单分流 Agent（2024 年）
负责把来信归类并提取订单号、问题类型和优先级，再交给人工坐席。早期方案直接让模型返回自由文本，字段缺失和格式漂移较多；后来改为结构化输出与程序校验，并把低置信度样本转人工。参与建设离线回放集，记录误分流案例，定期检查提示词和模型升级后的表现。

其他经历：维护过普通 Web API、任务队列和日志告警。熟悉基本的接口设计、数据库查询优化和线上故障排查。简历未详细说明多 Agent 协作、模型微调或大规模训练经历。`;

const INITIAL_FORM: InterviewCreateRequest = {
  title: "",
  candidateName: "林澈（测试）",
  positionTitle: "",
  jobDescription: "",
  resumeText: TEST_RESUME,
  questionCount: MAX_INTERVIEW_ROUNDS,
  competencies: [...DEFAULT_INTERVIEW_COMPETENCIES],
  algorithmEnabled: false,
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
  const { confirm, confirmationDialog } = useInterviewDeleteConfirmation();
  const interviews = useInterviewStore((state) => state.interviews);
  const counts = useInterviewStore((state) => state.counts);
  const initialized = useInterviewStore((state) => state.initialized);
  const loading = useInterviewStore((state) => state.loading);
  const mutation = useInterviewStore((state) => state.mutation);
  const error = useInterviewStore((state) => state.error);
  const selectedId = useInterviewStore((state) => state.selectedId);
  const initialize = useInterviewStore((state) => state.initialize);
  const createInterview = useInterviewStore((state) => state.createInterview);
  const deleteInterview = useInterviewStore((state) => state.deleteInterview);
  const chattingInterviewId = useInterviewStore((state) => state.chattingInterviewId);
  const selectInterview = useInterviewStore((state) => state.selectInterview);
  const jobs = useJobLibraryStore((state) => state.jobs);
  const jobsLoading = useJobLibraryStore((state) => state.loading);
  const jobsError = useJobLibraryStore((state) => state.error);
  const initializeJobs = useJobLibraryStore((state) => state.initialize);
  const section = useUiStore((state) => state.moduleViews.interview);
  const setInterviewView = useUiStore((state) => state.setInterviewView);
  const [form, setForm] = useState<InterviewCreateRequest>(INITIAL_FORM);
  const [editor, setEditor] = useState<"resume" | "models" | "interviewer" | "candidate" | "director" | "score" | null>(null);
  const [promptDraft, setPromptDraft] = useState<InterviewChatPrompts>(DEFAULT_INTERVIEW_CHAT_PROMPTS);
  const [candidatePromptDraft, setCandidatePromptDraft] = useState(DEFAULT_INTERVIEW_CANDIDATE_PROMPT);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [candidateEnabled, setCandidateEnabled] = useState(true);
  const [candidateErrorRate, setCandidateErrorRate] = useState(DEFAULT_CANDIDATE_ERROR_RATE);
  const [directorEnabled, setDirectorEnabled] = useState(true);
  const [directorPromptDraft, setDirectorPromptDraft] = useState(DEFAULT_INTERVIEW_DIRECTOR_PROMPT);
  const [scorePromptDraft, setScorePromptDraft] = useState(DEFAULT_INTERVIEW_SCORE_PROMPT);
  const [interviewerSettings, setInterviewerSettings] = useState<InterviewChatSettings>(DEFAULT_INTERVIEW_CHAT_SETTINGS);
  const [candidateSettings, setCandidateSettings] = useState<InterviewChatSettings>(DEFAULT_CANDIDATE_CHAT_SETTINGS);
  const [directorSettings, setDirectorSettings] = useState<InterviewChatSettings>(DEFAULT_DIRECTOR_CHAT_SETTINGS);
  const [scoreSettings, setScoreSettings] = useState<InterviewChatSettings>(DEFAULT_SCORE_CHAT_SETTINGS);
  const [availableModels, setAvailableModels] = useState<InterviewChatModelInfo["availableModels"]>([]);
  const selected = useMemo(
    () => interviews.find((interview) => interview.id === selectedId) ?? null,
    [interviews, selectedId],
  );
  const selectedJob = jobs.find((job) => job.id === form.jobPostingId);
  const focusedView = section === "algorithms" || section === "question-bank";

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (section === "dashboard") void initializeJobs();
  }, [section, initializeJobs]);

  useEffect(() => {
    let cancelled = false;
    void interviewGateway.getChatModelInfo().then((info) => {
      if (!cancelled) setAvailableModels(info.availableModels);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function setField<Key extends keyof InterviewCreateRequest>(key: Key, value: InterviewCreateRequest[Key]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedJob) {
      setPromptError("请先从岗位库选择目标岗位。");
      return;
    }
    if (!form.resumeText.trim()) { setPromptError("请填写候选人简历。"); setEditor("resume"); return; }
    if (!promptDraft.systemPrompt.trim() || !promptDraft.startInstruction.trim() || !promptDraft.replyInstruction.trim()) {
      setPromptError("基础系统提示词、开场控制词和续谈控制词都不能为空。");
      return;
    }
    if (!candidatePromptDraft.trim()) {
      setPromptError("模拟候选人提示词不能为空。");
      return;
    }
    if (directorEnabled && !directorPromptDraft.trim()) {
      setPromptError("面试导演提示词不能为空。");
      return;
    }
    if (!scorePromptDraft.trim()) {
      setPromptError("评分提示词不能为空。");
      return;
    }
    setPromptError(null);
    try {
      const interview = await createInterview({ ...form, directorEnabled });
      saveInterviewChatPrompts(interview.id, promptDraft);
      saveInterviewChatSettings(interview.id, interviewerSettings);
      saveInterviewCandidatePreferences(interview.id, { enabled: candidateEnabled,
        settings: candidateSettings, prompt: candidatePromptDraft, errorRate: candidateErrorRate });
      saveInterviewDirectorPreferences(interview.id, { enabled: directorEnabled,
        settings: directorSettings, prompt: directorPromptDraft });
      saveInterviewScorePrompt(interview.id, scorePromptDraft);
      saveInterviewScoreSettings(interview.id, scoreSettings);
      setForm(INITIAL_FORM);
      setCandidateEnabled(true);
      setCandidateErrorRate(DEFAULT_CANDIDATE_ERROR_RATE);
      setDirectorEnabled(true);
      setDirectorPromptDraft(DEFAULT_INTERVIEW_DIRECTOR_PROMPT);
      setScorePromptDraft(DEFAULT_INTERVIEW_SCORE_PROMPT);
      setInterviewerSettings(DEFAULT_INTERVIEW_CHAT_SETTINGS);
      setCandidateSettings(DEFAULT_CANDIDATE_CHAT_SETTINGS);
      setDirectorSettings(DEFAULT_DIRECTOR_CHAT_SETTINGS);
      setScoreSettings(DEFAULT_SCORE_CHAT_SETTINGS);
      setPromptDraft(DEFAULT_INTERVIEW_CHAT_PROMPTS);
      setCandidatePromptDraft(DEFAULT_INTERVIEW_CANDIDATE_PROMPT);
      setInterviewView("session");
    } catch {
      // The store exposes the validated main-process error next to the form.
    }
  }

  async function removeInterview(id: string, title: string): Promise<void> {
    if (!await confirm(title)) return;
    try {
      await deleteInterview(id);
    } catch {
      // The store displays the main-process error above the records.
    }
  }

  function useCollectedJob(job: JobPosting): void {
    setForm({
      ...INITIAL_FORM,
      jobPostingId: job.id,
      positionTitle: job.title,
    });
    setInterviewView("dashboard");
  }

  if (section === "session") return <InterviewRoom />;

  return (
    <>
      {confirmationDialog}
    <div key={section} className={`interview-page-scroll${focusedView ? " interview-focus-host" : ""}`}>
      <main className={`interview-page${focusedView ? " interview-focus-page" : ""}`}>
        <nav className="interview-section-tabs" aria-label="智能面试功能">
          <button className={section === "dashboard" ? "active" : ""} type="button" onClick={() => setInterviewView("dashboard")}><Plus size={15} />新建面试</button>
          <button className={section === "records" ? "active" : ""} type="button" onClick={() => setInterviewView("records")}><ClipboardList size={15} />面试记录</button>
          <button className={section === "jobs" ? "active" : ""} type="button" onClick={() => setInterviewView("jobs")}><LibraryBig size={15} />岗位库与采集</button>
          <button className={section === "question-bank" ? "active" : ""} type="button" onClick={() => setInterviewView("question-bank")}><FileQuestion size={15} />面试问答题库</button>
          <button className={section === "algorithms" ? "active" : ""} type="button" onClick={() => setInterviewView("algorithms")}><Braces size={15} />算法练习</button>
        </nav>

        {section === "jobs" ? <JobLibrary onUseJob={useCollectedJob} />
          : section === "question-bank" ? <InterviewQuestionBank />
            : section === "algorithms" ? <AlgorithmPractice />
              : section === "dashboard" ? <form className="interview-create-card" onSubmit={(event) => void submit(event)}>
            <header>
              <h2>新建面试</h2>
            </header>

            <div className="interview-form-grid">
              <label><span>候选人姓名</span><input required maxLength={100} value={form.candidateName} onChange={(event) => setField("candidateName", event.target.value)} placeholder="例如：张三" /></label>
              <div className="interview-job-picker"><span>目标岗位</span>
                <InterviewJobPicker jobs={jobs} value={form.jobPostingId} loading={jobsLoading} onChange={job => setForm(current => ({ ...current, jobPostingId: job.id, positionTitle: job.title }))} />
                {!jobsLoading && jobs.length === 0 && <button type="button" onClick={() => setInterviewView("jobs")}>去岗位库添加岗位</button>}
                {jobsError && <small className="interview-form-error">{jobsError}</small>}
              </div>
              <label><span>面试名称 <small>可选</small></span><input maxLength={160} value={form.title ?? ""} onChange={(event) => setField("title", event.target.value)} placeholder="留空时自动使用岗位与候选人名称" /></label>
              <div className="interview-create-resume"><span>候选人简历</span><button type="button" onClick={() => setEditor("resume")}><FileText size={16} /><span>{form.resumeText.trim() ? "查看 / 编辑简历" : "添加简历"}</span><small>{form.resumeText.length} 字</small><ArrowRight size={14} /></button></div>
              <section className="wide interview-create-options" aria-label="面试选项">
                <div><label><span>算法考核 <small>1 题 · 10 分钟</small></span><input type="checkbox" checked={form.algorithmEnabled ?? false} onChange={event => setField("algorithmEnabled", event.target.checked)} /></label></div>
                <div><label><span>模拟候选人</span><input type="checkbox" checked={candidateEnabled} onChange={event => setCandidateEnabled(event.target.checked)} /></label>
                  {candidateEnabled && <label className="interview-create-error-rate"><span>技术误答概率</span><span><input aria-label="技术误答概率" type="number" min={0} max={100} step={1} value={candidateErrorRate} onChange={event => setCandidateErrorRate(Number(event.target.value))} /> %</span></label>}
                </div>
                <div><label><span>面试导演 <small>创建后固定</small></span><input type="checkbox" checked={directorEnabled} onChange={event => setDirectorEnabled(event.target.checked)} /></label></div>
              </section>
              <section className="wide interview-create-config" aria-label="Agent 配置">
                <button type="button" onClick={() => setEditor("models")}><span>模型与思考深度</span><ArrowRight size={14} /></button>
                <div className="interview-create-prompt-links"><span>提示词</span><button type="button" onClick={() => setEditor("interviewer")}>面试官</button><button type="button" onClick={() => setEditor("candidate")}>模拟候选人</button><button type="button" onClick={() => setEditor("director")}>面试导演</button><button type="button" onClick={() => setEditor("score")}>面试评分</button></div>
              </section>
              {editor === "resume" && <InterviewCreateDialog title="候选人简历" onClose={() => setEditor(null)}><label>简历内容<textarea aria-label="简历内容" value={form.resumeText} onChange={event => setField("resumeText", event.target.value)} placeholder="粘贴候选人简历" /></label></InterviewCreateDialog>}
              {editor === "models" && <InterviewCreateDialog title="模型与思考深度" onClose={() => setEditor(null)}>
              <InterviewCreateAgentSettings settings={{ interviewer: interviewerSettings, candidate: candidateSettings,
                director: directorSettings, score: scoreSettings }} models={availableModels} onChange={(actor, settings) => {
                  if (actor === "interviewer") setInterviewerSettings(settings);
                  else if (actor === "candidate") setCandidateSettings(settings);
                  else if (actor === "director") setDirectorSettings(settings);
                  else setScoreSettings(settings);
                }} />
              </InterviewCreateDialog>}
            </div>

            {editor === "interviewer" && <InterviewCreateDialog title="面试官提示词" onClose={() => setEditor(null)}>
              <label>基础系统提示词<textarea maxLength={100_000} rows={16} value={promptDraft.systemPrompt}
                onChange={(event) => { setPromptError(null); setPromptDraft((current) => ({ ...current, systemPrompt: event.target.value })); }} /></label>
              <label>开场控制词<textarea maxLength={20_000} rows={5} value={promptDraft.startInstruction}
                onChange={(event) => { setPromptError(null); setPromptDraft((current) => ({ ...current, startInstruction: event.target.value })); }} /></label>
              <label>续谈控制词<textarea maxLength={20_000} rows={5} value={promptDraft.replyInstruction}
                onChange={(event) => { setPromptError(null); setPromptDraft((current) => ({ ...current, replyInstruction: event.target.value })); }} /></label>
              <button type="button" onClick={() => setPromptDraft(DEFAULT_INTERVIEW_CHAT_PROMPTS)}>恢复默认提示词</button>
            </InterviewCreateDialog>}

            {editor === "candidate" && <InterviewCreateDialog title="模拟候选人提示词" onClose={() => setEditor(null)}>
              <label>候选人系统提示词<textarea maxLength={100_000} rows={18} value={candidatePromptDraft}
                onChange={(event) => { setPromptError(null); setCandidatePromptDraft(event.target.value); }} /></label>
              <button type="button" onClick={() => { setPromptError(null); setCandidatePromptDraft(DEFAULT_INTERVIEW_CANDIDATE_PROMPT); }}>恢复默认提示词</button>
            </InterviewCreateDialog>}

            {editor === "director" && <InterviewCreateDialog title="面试导演提示词" onClose={() => setEditor(null)}>
              <label>导演系统提示词<textarea maxLength={100_000} rows={18} value={directorPromptDraft}
                onChange={(event) => { setPromptError(null); setDirectorPromptDraft(event.target.value); }} /></label>
              <button type="button" onClick={() => setDirectorPromptDraft(DEFAULT_INTERVIEW_DIRECTOR_PROMPT)}>恢复默认提示词</button>
            </InterviewCreateDialog>}

            {editor === "score" && <InterviewCreateDialog title="评分提示词" onClose={() => setEditor(null)}>
              <label>评分提示词<textarea maxLength={100_000} rows={16} value={scorePromptDraft}
                onChange={(event) => { setPromptError(null); setScorePromptDraft(event.target.value); }} /></label>
              <button type="button" onClick={() => setScorePromptDraft(DEFAULT_INTERVIEW_SCORE_PROMPT)}>恢复默认评分提示词</button>
            </InterviewCreateDialog>}

            {(promptError || error) && <p className="interview-form-error" role="alert">{promptError || error}</p>}
            <footer><button className="primary" type="submit" disabled={mutation}>{mutation ? <LoaderCircle className="spin" size={14} /> : <Database size={14} />}{mutation ? "正在创建" : "创建并开始"}</button></footer>
          </form> : <div className="interview-records-page">
        <section className="interview-summary-grid" aria-label="面试概览">
          <article><ClipboardList size={18} /><span><small>全部面试</small><strong>{interviews.length}</strong></span></article>
          <article><UserRound size={18} /><span><small>进行中</small><strong>{counts.draft + counts.preparing + counts.ready + counts.interviewing}</strong></span></article>
          <article><Check size={18} /><span><small>已完成</small><strong>{counts.completed}</strong></span></article>
        </section>
        {error && <div className="interview-page-error" role="alert">
          <span>{error}</span>
          <button type="button" disabled={loading} onClick={() => void initialize(true)}>重试</button>
        </div>}
        <section className="interview-records">
          <header><div><span className="eyebrow">LOCAL RECORDS</span><h2>面试记录</h2></div><small>本机持久化</small></header>
          {loading && !initialized ? (
            <div className="interview-loading"><LoaderCircle className="spin" size={17} />正在读取面试数据库…</div>
          ) : interviews.length === 0 ? (
            <div className="interview-empty">
              <div><BriefcaseBusiness size={22} /></div><strong>从一场文本面试开始</strong><p>创建草稿后，即使关闭客户端，简历和面试记录也会保留。</p>
              <button type="button" onClick={() => setInterviewView("dashboard")}><Plus size={14} />创建第一场面试</button>
            </div>
          ) : (
            <div className="interview-record-grid">
              {interviews.map((interview) => (
                <div className="interview-record-row" key={interview.id}>
                  <button
                    className={`interview-record-open${interview.id === selected?.id ? " selected" : ""}`}
                    type="button"
                    onClick={() => {
                      selectInterview(interview.id);
                      setInterviewView("session");
                    }}
                  >
                    <span className="interview-record-icon"><FileText size={17} /></span>
                    <span className="interview-record-copy"><strong>{interview.title}</strong><small>{interview.candidateName} · {interview.positionTitle}</small></span>
                    <span className="interview-record-meta"><em data-status={interview.status}>{STATUS_LABELS[interview.status]}</em><small>{formatDate(interview.updatedAt)}</small><ArrowRight size={15} /></span>
                  </button>
                  <HintButton className="interview-record-delete" type="button" hint={`删除面试：${interview.title}`}
                    aria-label={`删除面试：${interview.title}`}
                    disabled={mutation || chattingInterviewId === interview.id}
                    onClick={() => void removeInterview(interview.id, interview.title)}><Trash2 size={16} /></HintButton>
                </div>
              ))}
            </div>
          )}
        </section>
        </div>}
      </main>
    </div>
    </>
  );
}
