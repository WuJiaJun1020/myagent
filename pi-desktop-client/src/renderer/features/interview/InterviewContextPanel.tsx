import { BriefcaseBusiness, ChevronRight, FileText, Info, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { InterviewChatModelInfo, InterviewChatPrompts } from "../../../shared/contracts/interview";
import { DEFAULT_INTERVIEW_CHAT_PROMPTS, INTERVIEW_CHAT_TIMEOUT_MS } from "../../../shared/interview-chat-prompt";
import { candidateSystemPrompt, DEFAULT_INTERVIEW_CANDIDATE_PROMPT } from "../../../shared/interview-candidate-prompt";
import { DEFAULT_INTERVIEW_DIRECTOR_PROMPT } from "../../../shared/interview-director-prompt";
import { interviewGateway } from "../../services/interview-gateway";
import { useInterviewStore } from "../../stores/interview-store";
import { useUiStore } from "../../stores/ui-store";
import { saveInterviewChatPrompts, useInterviewChatPrompts } from "./interview-prompt-preferences";
import { saveInterviewCandidatePreferences, useInterviewCandidatePreferences } from "./interview-candidate-preferences";
import { saveInterviewDirectorPreferences, useInterviewDirectorPreferences } from "./interview-director-preferences";
import { useInterviewChatSettings } from "./interview-chat-preferences";
import { InterviewAgentUsage, InterviewUsageSummary } from "./InterviewAgentUsage";
import { InterviewAgentModelLine } from "./InterviewAgentModelLine";
import { DEFAULT_INTERVIEW_SCORE_PROMPT } from "../../../shared/interview-score";
import { saveInterviewScorePrompt, useInterviewScorePrompt,
  useInterviewScoreSettings } from "./interview-score-preferences";

function InfoTip({ text }: { text: string }) {
  return <span className="interview-insight-help" tabIndex={0} role="note" title={text} aria-label={text}><Info size={13} /></span>;
}

export function InterviewContextPanel() {
  const section = useUiStore((state) => state.moduleViews.interview);
  const selectedId = useInterviewStore((state) => state.selectedId);
  const prompts = useInterviewChatPrompts(selectedId ?? "");
  const candidate = useInterviewCandidatePreferences(selectedId ?? "");
  const director = useInterviewDirectorPreferences(selectedId ?? "");
  const interviewerSettings = useInterviewChatSettings(selectedId ?? "");
  const scorePrompt = useInterviewScorePrompt(selectedId ?? "");
  const scoreSettings = useInterviewScoreSettings(selectedId ?? "");
  const [editingScorePrompt, setEditingScorePrompt] = useState(false);
  const [scorePromptDraft, setScorePromptDraft] = useState(scorePrompt);
  const [candidateModels, setCandidateModels] = useState<InterviewChatModelInfo["availableModels"]>([]);
  const [editingCandidatePrompt, setEditingCandidatePrompt] = useState(false);
  const [candidatePromptDraft, setCandidatePromptDraft] = useState(candidate.prompt);
  const [directorPromptDraft, setDirectorPromptDraft] = useState(director.prompt);
  const [editingDirectorPrompt, setEditingDirectorPrompt] = useState(false);
  const [editingPrompts, setEditingPrompts] = useState(false);
  const [promptDraft, setPromptDraft] = useState<InterviewChatPrompts>(prompts);
  const session = useInterviewStore((state) => state.session);
  const scoringInterviewId = useInterviewStore((state) => state.scoringInterviewId);
  const activeSession = section === "session" && session?.interview.id === selectedId ? session : null;
  const latestScore = activeSession?.scoreReports?.[0];
  const resume = activeSession?.interview.documents.find((document) => document.kind === "resume");
  const job = activeSession?.interview.documents.find((document) => document.kind === "job_description");
  const candidateOutcomes = activeSession?.turns.flatMap((turn) => turn.source === "agent" && turn.candidateOutcome
    ? [turn.candidateOutcome] : []) ?? [];

  useEffect(() => {
    setEditingPrompts(false);
    setEditingCandidatePrompt(false);
    setEditingDirectorPrompt(false);
    setEditingScorePrompt(false);
    setPromptDraft(prompts);
  }, [selectedId]);

  useEffect(() => {
    if (!editingPrompts) setPromptDraft(prompts);
  }, [editingPrompts, prompts]);

  useEffect(() => {
    let cancelled = false;
    void interviewGateway.getChatModelInfo().then((info) => { if (!cancelled) setCandidateModels(info.availableModels); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (!editingCandidatePrompt) setCandidatePromptDraft(candidate.prompt); }, [candidate.prompt, editingCandidatePrompt]);
  useEffect(() => { if (!editingDirectorPrompt) setDirectorPromptDraft(director.prompt); }, [director.prompt, editingDirectorPrompt]);
  useEffect(() => { if (!editingScorePrompt) setScorePromptDraft(scorePrompt); }, [scorePrompt, editingScorePrompt]);

  function savePrompts(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selectedId || !promptDraft.systemPrompt.trim() || !promptDraft.startInstruction.trim()
      || !promptDraft.replyInstruction.trim()) return;
    saveInterviewChatPrompts(selectedId, promptDraft);
    setEditingPrompts(false);
  }

  return <aside className="interview-context-panel interview-insight-panel">
    <header><span className="eyebrow">INTERVIEW DESK</span><strong>面试侧栏</strong></header>
    {activeSession ? <div className="interview-insight-scroll">
      <section className="interview-insight-person">
        <span className="interview-insight-person-icon"><UserRound size={19} /></span>
        <div><small>当前候选人</small><strong>{activeSession.interview.candidateName}</strong><span>{activeSession.interview.positionTitle}</span></div>
      </section>
      <section className="interview-insight-section">
        <div className="interview-insight-heading"><span>整场模型用量
          <InfoTip text="累计输入汇总本场各 Agent 的实际模型调用，含格式修复、未采用草稿与评分；各 Agent 下方的最新一轮完整上下文是最近一次成功请求的全部输入，包含此前对话，并与该请求的模型窗口比较。缓存命中率按缓存读取 tokens ÷ 输入总 tokens 计算。" /></span></div>
        <InterviewUsageSummary session={activeSession} models={candidateModels} />
      </section>
      <section className="interview-insight-section">
        <div className="interview-insight-heading"><span><FileText size={15} />候选人简历 <InfoTip text="当前面试官参考岗位资料、简历和本场对话；自动证据抽取尚未接入。" /></span><small>对话 {activeSession.turns.length} 条</small></div>
        {resume && <details className="interview-insight-document"><summary><FileText size={15} /><span>查看简历原文</span><ChevronRight size={14} /></summary><p>{resume.content}</p></details>}
      </section>
      <section className="interview-insight-section interview-agent-prompt">
        <div className="interview-insight-heading"><span><Sparkles size={15} />面试 Agent 参数 <InfoTip text={`每轮单次请求依次包含稳定系统提示词、岗位资料、完整简历与本场对话；追问时附上候选人本轮回答，末尾再附程序维护的话题状态和导演控制。不设置应用侧输入 token 上限；超时 ${Math.round(INTERVIEW_CHAT_TIMEOUT_MS / 1_000)} 秒。思考深度在创建面试时固定；实际发送的消息可在对话中展开查看。`} /></span><small>当前生效</small></div>
        <InterviewAgentModelLine settings={interviewerSettings} models={candidateModels} />
        <InterviewAgentUsage session={activeSession} actor="interviewer" models={candidateModels} />
        <details className="interview-insight-document"><summary><FileText size={15} /><span>查看当前提示词与本轮控制</span><ChevronRight size={14} /></summary><pre>{`【每轮基础系统提示词】\n${prompts.systemPrompt}\n\n【开场时追加，仅首轮】\n${prompts.startInstruction}\n\n【续谈时追加，仅后续轮次】\n${prompts.replyInstruction}`}</pre></details>
        {activeSession.interview.status !== "completed" && (editingPrompts ? <form className="interview-prompt-editor" onSubmit={savePrompts}>
          <label>基础系统提示词<textarea required maxLength={100_000} rows={16} value={promptDraft.systemPrompt}
            onChange={(event) => setPromptDraft((current) => ({ ...current, systemPrompt: event.target.value }))} /></label>
          <label>开场控制词<textarea required maxLength={20_000} rows={5} value={promptDraft.startInstruction}
            onChange={(event) => setPromptDraft((current) => ({ ...current, startInstruction: event.target.value }))} /></label>
          <label>续谈控制词<textarea required maxLength={20_000} rows={5} value={promptDraft.replyInstruction}
            onChange={(event) => setPromptDraft((current) => ({ ...current, replyInstruction: event.target.value }))} /></label>
          <div><button type="button" onClick={() => setPromptDraft(DEFAULT_INTERVIEW_CHAT_PROMPTS)}>恢复默认</button>
            <button type="button" onClick={() => setEditingPrompts(false)}>取消</button><button type="submit">保存提示词</button></div>
        </form> : <button className="interview-prompt-edit-trigger" type="button" onClick={() => setEditingPrompts(true)}>编辑提示词</button>)}
      </section>
      <section className="interview-insight-section interview-agent-prompt">
        <div className="interview-insight-heading"><span><Sparkles size={15} />面试导演 Agent <InfoTip text="启用状态在创建面试时确定，面试中不可切换。导演审查未发送的面试官草稿；重复追问或应当收尾时才介入。调用过程折叠记录在对话中。" /></span><small>{activeSession.interview.directorEnabled ? "已启用" : "未启用"}</small></div>
        {activeSession.interview.directorEnabled && <>
          <InterviewAgentModelLine settings={director.settings} models={candidateModels} />
          <InterviewAgentUsage session={activeSession} actor="director" models={candidateModels} />
          <details className="interview-insight-document"><summary><FileText size={15} /><span>查看导演提示词</span><ChevronRight size={14} /></summary><pre>{director.prompt}</pre></details>
          {activeSession.interview.status !== "completed" && (editingDirectorPrompt ? <form className="interview-prompt-editor" onSubmit={(event) => {
            event.preventDefault();
            if (selectedId && directorPromptDraft.trim()) saveInterviewDirectorPreferences(selectedId, { ...director, prompt: directorPromptDraft });
            setEditingDirectorPrompt(false);
          }}><label>导演系统提示词<textarea required maxLength={100_000} rows={14} value={directorPromptDraft}
            onChange={(event) => setDirectorPromptDraft(event.target.value)} /></label>
            <div><button type="button" onClick={() => setDirectorPromptDraft(DEFAULT_INTERVIEW_DIRECTOR_PROMPT)}>恢复默认</button>
              <button type="button" onClick={() => setEditingDirectorPrompt(false)}>取消</button><button type="submit">保存提示词</button></div>
          </form> : <button className="interview-prompt-edit-trigger" type="button" onClick={() => setEditingDirectorPrompt(true)}>编辑导演提示词</button>)}
        </>}
      </section>
      <section className="interview-insight-section interview-agent-prompt">
        <div className="interview-insight-heading"><span><UserRound size={15} />模拟候选人 Agent <InfoTip text="调试用候选人只读取岗位、简历与可见对话，不读取面试官的系统提示词或内部调用记录。代答会发送到当前模型 Provider，并保存可展开的调用详情。" /></span><small>{candidate.enabled ? "已启用" : "未启用"}</small></div>
        <label className="interview-candidate-enabled"><input type="checkbox" checked={candidate.enabled} disabled={activeSession.interview.status === "completed"}
          onChange={(event) => selectedId && saveInterviewCandidatePreferences(selectedId, { ...candidate, enabled: event.target.checked })} />启用模拟候选人</label>
        <p className="interview-insight-setting">技术误答抽签：{candidate.errorRate}% · 只作用于 Agent 代答；同一问题重试沿用首次结果</p>
        <p className="interview-insight-setting" title="实施情况来自候选人 JSON 自报，程序校验误答原文出现在回答中；不是独立技术事实核验。">已完成代答 {candidateOutcomes.length} 轮 · 抽中误答 {candidateOutcomes.filter((item) => item.requestedMode === "mistake").length} 轮 · 自报实际误答 {candidateOutcomes.filter((item) => item.mistakeMade).length} 轮</p>
        <InterviewAgentModelLine settings={candidate.settings} models={candidateModels} />
        <InterviewAgentUsage session={activeSession} actor="candidate" models={candidateModels} />
        <details className="interview-insight-document"><summary><FileText size={15} /><span>查看候选人提示词</span><ChevronRight size={14} /></summary><pre>{candidateSystemPrompt(candidate.prompt)}</pre></details>
        {activeSession.interview.status !== "completed" && (editingCandidatePrompt ? <form className="interview-prompt-editor" onSubmit={(event) => {
          event.preventDefault();
          if (selectedId && candidatePromptDraft.trim()) saveInterviewCandidatePreferences(selectedId, { ...candidate, prompt: candidatePromptDraft });
          setEditingCandidatePrompt(false);
        }}><label>候选人系统提示词<textarea required maxLength={100_000} rows={12} value={candidatePromptDraft}
          onChange={(event) => setCandidatePromptDraft(event.target.value)} /></label>
          <div><button type="button" onClick={() => setCandidatePromptDraft(DEFAULT_INTERVIEW_CANDIDATE_PROMPT)}>恢复默认</button>
            <button type="button" onClick={() => setEditingCandidatePrompt(false)}>取消</button><button type="submit">保存提示词</button></div>
        </form> : <button className="interview-prompt-edit-trigger" type="button" onClick={() => setEditingCandidatePrompt(true)}>编辑候选人提示词</button>)}
      </section>
      {job && <section className="interview-insight-section">
        <div className="interview-insight-heading"><span><BriefcaseBusiness size={15} />目标岗位资料 <InfoTip text="这份资料会作为独立消息放在系统提示词与简历之间，随每轮请求发送给模型；它不是候选人发言。" /></span><small>创建时快照</small></div>
        <details className="interview-insight-document"><summary><FileText size={15} /><span>查看原文</span><ChevronRight size={14} /></summary><p>{job.content}</p></details>
      </section>}
      <section className="interview-insight-section interview-agent-prompt">
        <div className="interview-insight-heading"><span><ShieldCheck size={15} />面试评分 Agent <InfoTip text="面试结束后独立调用模型评分；岗位与简历只作背景，分数须引用候选人回答。模型与思考深度在新建面试时设置，侧栏仅展示。算法题独立按通过 100 / 未通过 0 计分；调用详情记录在对话中。" /></span><small>{scoringInterviewId === selectedId ? "评分中"
          : latestScore?.status === "succeeded" ? `已评分 · 第 ${latestScore.version} 版`
            : latestScore?.status === "failed" ? "评分失败 · 可重试" : "结束后调用"}</small></div>
        <InterviewAgentModelLine settings={scoreSettings} models={candidateModels} />
        <InterviewAgentUsage session={activeSession} actor="score" models={candidateModels} />
        <details className="interview-insight-document"><summary><FileText size={15} /><span>查看评分 Agent 提示词</span><ChevronRight size={14} /></summary><pre>{scorePrompt}</pre></details>
        {editingScorePrompt ? <form className="interview-prompt-editor" onSubmit={(event) => {
          event.preventDefault();
          if (selectedId && scorePromptDraft.trim()) saveInterviewScorePrompt(selectedId, scorePromptDraft);
          setEditingScorePrompt(false);
        }}><label>评分提示词<textarea required maxLength={100_000} rows={16} value={scorePromptDraft}
          onChange={(event) => setScorePromptDraft(event.target.value)} /></label>
          <div><button type="button" onClick={() => setScorePromptDraft(DEFAULT_INTERVIEW_SCORE_PROMPT)}>恢复默认</button>
            <button type="button" onClick={() => setEditingScorePrompt(false)}>取消</button><button type="submit">保存评分提示词</button></div>
        </form> : <button className="interview-prompt-edit-trigger" type="button" onClick={() => setEditingScorePrompt(true)}>编辑评分提示词</button>}
      </section>
    </div> : <div className="interview-insight-scroll">
      <div className="interview-context-state" title="简历与面试记录保存在本机，不进入普通 Pi 会话。"><ShieldCheck size={20} /><strong>面试资料独立保存</strong></div>
    </div>}
    <footer title="面试记录独立保存在本机；开启算法考核时，完成算法题后才会发送岗位资料与简历开始对话。"><ShieldCheck size={14} />本地保存 <Info size={12} /></footer>
  </aside>;
}
