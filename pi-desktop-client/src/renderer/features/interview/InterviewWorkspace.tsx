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
  const [jobQuery, setJobQuery] = useState("");
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
  const jobOptions = useMemo(() => {
    const query = jobQuery.trim().toLocaleLowerCase();
    const filtered = jobs.filter((job) => !query || [job.title, job.company, job.city, job.category]
      .some((value) => value.toLocaleLowerCase().includes(query))).slice(0, 100);
    const selectedOption = jobs.find((job) => job.id === form.jobPostingId);
    return selectedOption && !filtered.some((job) => job.id === selectedOption.id)
      ? [selectedOption, ...filtered] : filtered;
  }, [jobs, jobQuery, form.jobPostingId]);
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
      setJobQuery("");
      setPromptDraft(DEFAULT_INTERVIEW_CHAT_PROMPTS);
      setCandidatePromptDraft(DEFAULT_INTERVIEW_CANDIDATE_PROMPT);
      setInterviewView("session");
    } catch {
      // The store exposes the validated main-process error next to the form.
    }
  }

  async function removeInterview(id: string, title: string): Promise<void> {
    if (!window.confirm(`确定永久删除面试“${title}”吗？简历、对话和调试记录会一并删除，无法撤销。`)) return;
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
    setJobQuery("");
    setInterviewView("dashboard");
  }

  if (section === "session") return <InterviewRoom />;

  return (
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
          : section === "question-bank" ? <InterviewQuestionBank onBack={() => setInterviewView("records")} />
            : section === "algorithms" ? <AlgorithmPractice onBack={() => setInterviewView("records")} />
              : section === "dashboard" ? <form className="interview-create-card" onSubmit={(event) => void submit(event)}>
            <header>
              <div><span className="eyebrow">NEW INTERVIEW</span><h2>新建面试</h2><p>已预填一份虚构的 Agent 应用开发测试简历；开启算法考核时先完成限时题，再进入简历对话。</p></div>
            </header>

            <div className="interview-form-grid">
              <label><span>候选人姓名</span><input required maxLength={100} value={form.candidateName} onChange={(event) => setField("candidateName", event.target.value)} placeholder="例如：张三" /></label>
              <div className="interview-job-picker"><label><span>目标岗位 <small>从本地岗位库选择</small></span><input value={jobQuery} onChange={(event) => setJobQuery(event.target.value)} placeholder="搜索岗位、公司、城市或方向" /></label>
                <select required aria-label="选择目标岗位" value={form.jobPostingId ?? ""} onChange={(event) => {
                  const job = jobs.find((item) => item.id === event.target.value);
                  setForm((current) => ({ ...current, jobPostingId: job?.id, positionTitle: job?.title ?? "" }));
                }}><option value="">{jobsLoading ? "正在读取岗位库…" : "请选择目标岗位"}</option>
                  {jobOptions.map((job) => <option key={job.id} value={job.id}>{job.company} · {job.title}{job.city ? ` · ${job.city}` : ""}</option>)}
                </select>
                {selectedJob && <small className="interview-job-picker-selected">已选：{selectedJob.company} · {selectedJob.title}；创建时会保存岗位资料快照。</small>}
                {!jobsLoading && jobs.length === 0 && <button type="button" onClick={() => setInterviewView("jobs")}>岗位库为空，先去采集岗位</button>}
                {jobsError && <small className="interview-form-error">岗位库读取失败：{jobsError}</small>}
              </div>
              <label className="wide"><span>面试名称 <small>可选</small></span><input maxLength={160} value={form.title ?? ""} onChange={(event) => setField("title", event.target.value)} placeholder="留空时自动使用岗位与候选人名称" /></label>
              <label className="wide"><span>简历内容 <small>虚构测试数据，可编辑</small></span><textarea required value={form.resumeText} onChange={(event) => setField("resumeText", event.target.value)} placeholder="粘贴候选人简历，数据仅保存在本机…" /></label>
              <label className="wide interview-algorithm-toggle"><input type="checkbox" checked={form.algorithmEnabled ?? false}
                onChange={(event) => setField("algorithmEnabled", event.target.checked)} />
                <span>正式对话前考核一道算法题 <small>默认关闭 · 随机抽题 · 限时 10 分钟 · 力扣或 ACM 任一模式通过即可</small></span></label>
              <label className="wide interview-algorithm-toggle"><input type="checkbox" checked={candidateEnabled}
                onChange={(event) => setCandidateEnabled(event.target.checked)} />
                <span>启用模拟候选人 Agent <small>默认开启 · 可手动回答、代答一轮或连续代答；创建后仍可调整</small></span></label>
              {candidateEnabled && <label><span>模拟候选人技术误答概率 <small>每个问题独立抽签；0% 表示关闭</small></span>
                <input type="number" min={0} max={100} step={1} value={candidateErrorRate}
                  onChange={(event) => setCandidateErrorRate(Number(event.target.value))} />
                <small>默认 20%；只作用于 Agent 代答。模型若遇到非技术问题会正常回答。</small></label>}
              <label className="wide interview-algorithm-toggle"><input type="checkbox" checked={directorEnabled}
                onChange={(event) => setDirectorEnabled(event.target.checked)} />
                <span>启用面试导演 Agent <small>默认开启 · 只在创建时选择，面试中不能切换；重复追问时才引导换话题或收尾</small></span></label>
              <InterviewCreateAgentSettings settings={{ interviewer: interviewerSettings, candidate: candidateSettings,
                director: directorSettings, score: scoreSettings }} models={availableModels} onChange={(actor, settings) => {
                  if (actor === "interviewer") setInterviewerSettings(settings);
                  else if (actor === "candidate") setCandidateSettings(settings);
                  else if (actor === "director") setDirectorSettings(settings);
                  else setScoreSettings(settings);
                }} />
            </div>

            <details className="interview-create-prompts">
              <summary>面试 Agent 提示词（可在面试中继续编辑）</summary>
              <p>创建后自动开场将使用这里的文本；每条规则独占一行。</p>
              <label>基础系统提示词<textarea maxLength={100_000} rows={16} value={promptDraft.systemPrompt}
                onChange={(event) => { setPromptError(null); setPromptDraft((current) => ({ ...current, systemPrompt: event.target.value })); }} /></label>
              <label>开场控制词<textarea maxLength={20_000} rows={5} value={promptDraft.startInstruction}
                onChange={(event) => { setPromptError(null); setPromptDraft((current) => ({ ...current, startInstruction: event.target.value })); }} /></label>
              <label>续谈控制词<textarea maxLength={20_000} rows={5} value={promptDraft.replyInstruction}
                onChange={(event) => { setPromptError(null); setPromptDraft((current) => ({ ...current, replyInstruction: event.target.value })); }} /></label>
              <button type="button" onClick={() => setPromptDraft(DEFAULT_INTERVIEW_CHAT_PROMPTS)}>恢复默认提示词</button>
            </details>

            <details className="interview-create-prompts">
              <summary>模拟候选人 Agent 提示词（可在面试中继续编辑）</summary>
              <p>启用代答时使用这里的文本；允许在虚构简历已有经历内补足合理细节。程序固定追加 JSON 输出协议，逐轮抽签控制作为独立消息发送，不修改系统提示词。每条规则独占一行。</p>
              <label>候选人系统提示词<textarea maxLength={100_000} rows={18} value={candidatePromptDraft}
                onChange={(event) => { setPromptError(null); setCandidatePromptDraft(event.target.value); }} /></label>
              <button type="button" onClick={() => { setPromptError(null); setCandidatePromptDraft(DEFAULT_INTERVIEW_CANDIDATE_PROMPT); }}>恢复默认提示词</button>
            </details>

            <details className="interview-create-prompts">
              <summary>面试导演 Agent 提示词（仅启用时调用）</summary>
              <p>导演只审查尚未发送的面试官草稿，不直接与候选人交谈。模型与思考深度在上方设置；思考深度创建后固定。</p>
              <label>导演系统提示词<textarea maxLength={100_000} rows={18} value={directorPromptDraft}
                onChange={(event) => { setPromptError(null); setDirectorPromptDraft(event.target.value); }} /></label>
              <button type="button" onClick={() => setDirectorPromptDraft(DEFAULT_INTERVIEW_DIRECTOR_PROMPT)}>恢复默认提示词</button>
            </details>

            <details className="interview-create-prompts">
              <summary>面试评分 Agent 提示词（结束后调用）</summary>
              <p>对话表现：技术理解 40 分、实际工作与解决问题 45 分、回答与沟通 15 分；算法题单独按通过 100 / 未通过 0 计分。</p>
              <label>评分提示词<textarea maxLength={100_000} rows={16} value={scorePromptDraft}
                onChange={(event) => { setPromptError(null); setScorePromptDraft(event.target.value); }} /></label>
              <button type="button" onClick={() => setScorePromptDraft(DEFAULT_INTERVIEW_SCORE_PROMPT)}>恢复默认评分提示词</button>
            </details>

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
                  <button className="interview-record-delete" type="button" title={`删除面试：${interview.title}`}
                    aria-label={`删除面试：${interview.title}`}
                    disabled={mutation || chattingInterviewId === interview.id}
                    onClick={() => void removeInterview(interview.id, interview.title)}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </section>
        </div>}
      </main>
    </div>
  );
}
