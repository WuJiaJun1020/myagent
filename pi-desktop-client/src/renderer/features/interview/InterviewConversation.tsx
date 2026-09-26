import { AlertCircle, ArrowLeft, Bot, Bug, ClipboardCheck, Code2, Download, Globe2, Pause, Play, Send, Sparkles, UserRound } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_INTERVIEW_CHAT_MODEL, MAX_INTERVIEW_ROUNDS, type CandidateTurnResult, type InterviewChatModelInfo, type InterviewSession } from "../../../shared/contracts/interview";
import { interviewGateway } from "../../services/interview-gateway";
import { useInterviewStore } from "../../stores/interview-store";
import { useUiStore } from "../../stores/ui-store";
import { readInterviewChatSettings, useInterviewChatSettings } from "./interview-chat-preferences";
import { readInterviewChatPrompts, useInterviewChatPrompts } from "./interview-prompt-preferences";
import { readInterviewCandidatePreferences, useInterviewCandidatePreferences } from "./interview-candidate-preferences";
import { readInterviewDirectorPreferences, useInterviewDirectorPreferences } from "./interview-director-preferences";
import { formatInterviewTranscript } from "./interview-text-export";
import { InterviewCallDrawer } from "./InterviewCallDrawer";
import { buildInterviewCallGroups } from "./interview-call-groups";
import { InterviewScoreCard } from "./InterviewScoreCard";

const QUESTION_TYPE_LABELS = { resume: "经历", role: "岗位", foundation: "知识", other: "其他" } as const;

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function InterviewConversation({ session }: { session: InterviewSession }) {
  const setInterviewView = useUiStore((state) => state.setInterviewView);
  const sendChat = useInterviewStore((state) => state.sendChat);
  const simulateCandidateTurn = useInterviewStore((state) => state.simulateCandidateTurn);
  const finishInterview = useInterviewStore((state) => state.finishInterview);
  const scoreInterview = useInterviewStore((state) => state.scoreInterview);
  const scoring = useInterviewStore((state) => state.scoringInterviewId === session.interview.id);
  const consumeAutoStart = useInterviewStore((state) => state.consumeAutoStart);
  const autoStartInterviewId = useInterviewStore((state) => state.autoStartInterviewId);
  const chatting = useInterviewStore((state) => state.chattingInterviewId === session.interview.id);
  const mutation = useInterviewStore((state) => state.mutation);
  const [draft, setDraft] = useState("");
  const settings = useInterviewChatSettings(session.interview.id);
  const prompts = useInterviewChatPrompts(session.interview.id);
  const candidate = useInterviewCandidatePreferences(session.interview.id);
  const director = useInterviewDirectorPreferences(session.interview.id);
  const [agentBusy, setAgentBusy] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const stopAgentRef = useRef(false);
  const agentBusyRef = useRef(false);
  const [modelInfo, setModelInfo] = useState<InterviewChatModelInfo | null>(null);
  const [modelInfoError, setModelInfoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [showDebugSummaries, setShowDebugSummaries] = useState(false);
  const [selectedCallGroupId, setSelectedCallGroupId] = useState<string | null>(null);
  const closeCallDrawer = useCallback(() => setSelectedCallGroupId(null), []);
  const autoScoreAttempted = useRef(new Set<string>());
  const transcriptRef = useRef<HTMLDivElement>(null);
  const autoStartAttemptedRef = useRef(false);
  const readOnly = session.interview.status !== "draft" && session.interview.status !== "ready" && session.interview.status !== "interviewing";
  const pendingCandidate = session.turns.at(-1)?.role === "candidate" && session.turns.at(-1)?.source === "agent"
    ? session.turns.at(-1) : undefined;

  useEffect(() => {
    if (session.interview.status !== "completed" || (session.scoreReports?.length ?? 0) > 0
      || !session.turns.some((turn) => turn.role === "candidate")
      || autoScoreAttempted.current.has(session.interview.id)) return;
    autoScoreAttempted.current.add(session.interview.id);
    void scoreInterview(session.interview.id).catch((failure: unknown) => {
      setScoreError(failure instanceof Error ? failure.message : String(failure));
    });
  }, [scoreInterview, session.interview.id, session.interview.status, session.scoreReports?.length, session.turns]);

  useEffect(() => () => { stopAgentRef.current = true; }, [session.interview.id]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [session.turns.length, chatting, session.scoreReports?.length]);

  useEffect(() => {
    let cancelled = false;
    void interviewGateway.getChatModelInfo().then((info) => {
      if (!cancelled) setModelInfo(info);
    }).catch((failure: unknown) => {
      if (!cancelled) setModelInfoError(failure instanceof Error ? failure.message : String(failure));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const pendingStart = autoStartInterviewId === session.interview.id
      && useInterviewStore.getState().autoStartInterviewId === session.interview.id;
    const resumedAfterAlgorithm = session.algorithm && session.algorithm.status !== "pending"
      && session.algorithm.status !== "active" && session.turns.length === 0
      && (session.debugEvents?.length ?? 0) === 0;
    if ((!pendingStart && !resumedAfterAlgorithm) || autoStartAttemptedRef.current) return;
    if (session.turns.length > 0 || readOnly) {
      consumeAutoStart(session.interview.id);
      return;
    }
    autoStartAttemptedRef.current = true;
    consumeAutoStart(session.interview.id);
    void sendChat(session.interview.id, "start", undefined, settings, prompts,
      { ...director, enabled: session.interview.directorEnabled === true }).catch((failure: unknown) => {
      setError(failure instanceof Error ? failure.message : String(failure));
    });
  }, [autoStartInterviewId, consumeAutoStart, director, prompts, readOnly, sendChat, session.algorithm,
    session.debugEvents?.length, session.interview.id, session.turns.length, settings]);

  const availableModels = modelInfo?.availableModels ?? [];
  const selectedModel = availableModels.find((model) => model.providerId === (settings.model?.providerId ?? DEFAULT_INTERVIEW_CHAT_MODEL.providerId)
    && model.modelId === (settings.model?.modelId ?? DEFAULT_INTERVIEW_CHAT_MODEL.modelId));
  const modelValid = !settings.model || !modelInfo || Boolean(selectedModel);
  const reasoningValid = settings.reasoning === "default" || !selectedModel
    || selectedModel.reasoningLevels.includes(settings.reasoning);
  const candidateSelectedModel = availableModels.find((model) => model.providerId === candidate.settings.model?.providerId
    && model.modelId === candidate.settings.model?.modelId);
  const candidateValid = (!candidate.settings.model || !modelInfo || Boolean(candidateSelectedModel))
    && (candidate.settings.reasoning === "default" || !candidateSelectedModel
      || candidateSelectedModel.reasoningLevels.includes(candidate.settings.reasoning));
  const callGroups = buildInterviewCallGroups(session);
  const callGroupsByTurn = new Map(callGroups.filter((group) => group.interviewerTurnId)
    .map((group) => [group.interviewerTurnId!, group]));
  const otherCallGroup = callGroups.find((group) => group.id === "other");
  const questionTypeCounts = session.turns.filter((turn) => turn.role === "interviewer" && turn.questionType)
    .reduce((counts, turn) => {
      counts[turn.questionType!] += 1;
      return counts;
    }, { resume: 0, role: 0, foundation: 0, other: 0 });
  const classifiedCount = Object.values(questionTypeCounts).reduce((total, count) => total + count, 0);
  const unclassifiedCount = session.turns.filter((turn) => turn.role === "interviewer" && !turn.questionType).length;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (readOnly || chatting || agentBusyRef.current || !modelValid || !reasoningValid) return;
    const kind = session.turns.length === 0 ? "start" : "reply";
    const text = draft.trim();
    if (kind === "reply" && (!text || pendingCandidate)) return;
    setError(null);
    try {
      await sendChat(session.interview.id, kind, kind === "reply" ? text : undefined, settings, prompts,
        { ...director, enabled: session.interview.directorEnabled === true });
      setDraft("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  async function retryInterviewer(): Promise<void> {
    if (!pendingCandidate || chatting || agentBusyRef.current) return;
    setError(null);
    try {
      await sendChat(session.interview.id, "reply", pendingCandidate.content, settings, prompts,
        { ...director, enabled: session.interview.directorEnabled === true });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function finish(): Promise<void> {
    if (readOnly || chatting || mutation || autoStartInterviewId === session.interview.id) return;
    if (!window.confirm("结束本场面试？结束后不能继续对话，已保存的简历和聊天记录会保留。")) return;
    setError(null);
    try {
      await finishInterview(session.interview.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  async function runCandidateAgent(multiple: boolean): Promise<void> {
    if (agentBusyRef.current || chatting || readOnly || !candidate.enabled || !candidateValid || !modelValid || !reasoningValid
      || session.turns.length === 0 || draft.trim()) return;
    agentBusyRef.current = true;
    stopAgentRef.current = false;
    setAgentBusy(true);
    setContinuous(multiple);
    setError(null);
    let current = session;
    let first = true;
    try {
      do {
        const candidateConfig = first ? candidate : readInterviewCandidatePreferences(current.interview.id);
        if (!candidateConfig.enabled) break;
        const result: CandidateTurnResult = await simulateCandidateTurn(current.interview.id,
          candidateConfig.settings, candidateConfig.prompt, candidateConfig.errorRate,
          first ? settings : readInterviewChatSettings(current.interview.id),
          first ? prompts : readInterviewChatPrompts(current.interview.id),
          { ...(first ? director : readInterviewDirectorPreferences(current.interview.id)),
            enabled: current.interview.directorEnabled === true });
        first = false;
        current = result.session;
        if (result.status === "interviewer_failed") {
          setError(`${result.error ?? "面试官回复失败"}。模拟回答已保存，可重试面试官回复。`);
          break;
        }
        if (!multiple || stopAgentRef.current || current.interview.status === "completed" || current.answeredCount >= MAX_INTERVIEW_ROUNDS) break;
      } while (true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      agentBusyRef.current = false;
      setAgentBusy(false);
      setContinuous(false);
    }
  }

  function exportText(): void {
    const content = formatInterviewTranscript(session);
    const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `面试记录-${session.interview.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80)}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="interview-conversation-shell">
    <header className="interview-conversation-header">
      <button className="interview-conversation-back" type="button" onClick={() => setInterviewView("records")} aria-label="返回面试记录"><ArrowLeft size={17} /></button>
      <div className="interview-conversation-heading">
        <span className="interview-conversation-avatar"><Bot size={19} /></span>
        <span><strong>{session.interview.title}</strong><small>{session.interview.candidateName} · {session.interview.positionTitle}</small></span>
      </div>
      <div className="interview-conversation-header-actions">
        <button type="button" className="interview-call-header-button" disabled={callGroups.length === 0}
          onClick={() => setSelectedCallGroupId(callGroups.at(-1)!.id)}
          title="按轮次查看完整提示词、模型调用和导演审查" aria-label="调试记录"><Bug size={15} /><span>调试记录</span></button>
        <button type="button" disabled={session.turns.length === 0} onClick={exportText}><Download size={15} />导出会话</button>
        {readOnly ? <span className="interview-conversation-ended-label">已结束</span>
          : <button type="button" disabled={chatting || agentBusy || mutation || autoStartInterviewId === session.interview.id} onClick={() => { void finish(); }}>结束面试</button>}
      </div>
    </header>

    <div className="interview-conversation-meta" aria-label="本场面试概况">
      <span><UserRound size={14} />已回答 {session.answeredCount}/{MAX_INTERVIEW_ROUNDS} 轮</span>
      {(classifiedCount > 0 || unclassifiedCount > 0) && <span aria-label="面试官消息分类统计"><ClipboardCheck size={14} />
        经历 {questionTypeCounts.resume} · 岗位 {questionTypeCounts.role} · 知识 {questionTypeCounts.foundation} · 其他 {questionTypeCounts.other}
        {unclassifiedCount > 0 ? ` · 旧记录未分类 ${unclassifiedCount}` : ""}</span>}
      {session.algorithm && <span><Code2 size={14} />算法：{session.algorithm.status === "passed" ? "已通过"
        : session.algorithm.status === "timed_out" ? "限时结束"
          : session.algorithm.status === "unavailable" ? "运行环境不可用，已跳过" : "已结束"}</span>}
    </div>

    <div className="interview-conversation-transcript" ref={transcriptRef} role="log" aria-label="面试对话" aria-live="polite">
      <div className="interview-conversation-column">
        {session.turns.length === 0 && <div className="interview-conversation-welcome">
          <span className="interview-conversation-welcome-icon"><Sparkles size={21} /></span>
          <h2>{readOnly ? "面试已结束" : "正在准备首个问题"}</h2>
          <p>{readOnly ? "这场面试没有对话记录。" : "新建面试后会自动发送简历并生成首个问题；若调用失败，可在下方重试。"}</p>
        </div>}
        {session.turns.length > 0 && <div className="interview-conversation-divider"><span>本场对话 · 已保存</span></div>}
        {session.turns.map((turn) => {
          const callGroup = turn.role === "interviewer" ? callGroupsByTurn.get(turn.id) : undefined;
          return <article className={`interview-conversation-message ${turn.role === "candidate" ? "candidate" : "interviewer"}`} key={turn.id}>
          {turn.role === "interviewer" && <span className="interview-message-avatar"><Bot size={16} /></span>}
          <div className="interview-message-main"><div className="interview-message-byline"><strong>{turn.role === "candidate" ? turn.source === "agent" ? "模拟候选人" : "我" : "AI 面试官"}</strong><span>{timeLabel(turn.createdAt)}</span>
            {turn.role === "interviewer" && turn.questionType && <span className="interview-question-type-badge"
              title="这条面试官消息的最终分类">{QUESTION_TYPE_LABELS[turn.questionType]}</span>}
            {turn.role === "candidate" && turn.source === "agent" && turn.candidateOutcome?.mistakeMade
              && <span className="interview-candidate-mistake-badge" title={`模型自报故意误答，原文匹配：“${turn.candidateOutcome.mistakeQuote}”；未经独立技术核验`}>故意误答</span>}
            {callGroup && <button type="button" className="interview-call-trigger" onClick={() => setSelectedCallGroupId(callGroup.id)}
              aria-label={`查看${callGroup.label}调用详情`}><Bug size={12} />调用详情</button>}
            {callGroup?.hasFailure && <span className="interview-call-status failure"><AlertCircle size={12} />含失败记录</span>}
            {!callGroup?.hasFailure && callGroup?.directorAction && <span className="interview-call-status">导演已{callGroup.directorAction === "correct" ? "要求纠错" : callGroup.directorAction === "close" ? "要求收尾" : "改写问题"}</span>}
          </div>
            <div className="interview-message-content">{turn.content}</div>
            {showDebugSummaries && callGroup && <button type="button" className="interview-call-summary" onClick={() => setSelectedCallGroupId(callGroup.id)}>
              {callGroup.label} · {callGroup.entries.length} 个步骤 · {callGroup.modelCalls} 次模型调用{callGroup.hasFailure ? " · 含失败" : ""}
            </button>}
            {turn.search && <details className="interview-message-search"><summary><Globe2 size={14} />联网搜索：{turn.search.query} · {turn.search.sources.length} 个来源</summary>
              <ul>{turn.search.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a><small>{source.snippet}</small></li>)}</ul>
            </details>}
          </div>
          {turn.role === "candidate" && <span className="interview-message-avatar"><UserRound size={16} /></span>}
        </article>;
        })}
        {otherCallGroup && (otherCallGroup.hasFailure || showDebugSummaries) && <button type="button"
          className={`interview-call-pending ${otherCallGroup.hasFailure ? "failure" : ""}`}
          onClick={() => setSelectedCallGroupId(otherCallGroup.id)}>
          {otherCallGroup.hasFailure ? <AlertCircle size={15} /> : <Bug size={15} />}
          {otherCallGroup.hasFailure ? "有未完成的调用失败记录" : otherCallGroup.label}
          <span>{otherCallGroup.entries.length} 条 · 查看详情</span>
        </button>}
        {chatting && <div className="interview-conversation-waiting"><Sparkles size={16} />{agentBusy
          ? pendingCandidate ? "模拟回答已保存，面试官正在回复…" : "模拟候选人正在回答…"
          : "本轮请求处理中…"}</div>}
        {session.interview.status === "completed" && <InterviewScoreCard session={session} scoring={scoring} error={scoreError}
          onRetry={() => { setScoreError(null); void scoreInterview(session.interview.id).catch((failure: unknown) => {
            setScoreError(failure instanceof Error ? failure.message : String(failure));
          }); }} />}
      </div>
    </div>

    <div className="interview-conversation-compose-area">
      {readOnly ? <p className="interview-conversation-ended-notice">本场面试已结束，聊天记录已保留，不能继续发送回答。</p> : <>
      {modelInfoError && <p className="interview-conversation-model-note">模型列表暂不可用：{modelInfoError}。仍可使用默认模型。</p>}
      {(!modelValid || !reasoningValid) && <p className="interview-conversation-model-note" role="alert">本场模型或固定思考深度当前不可用，请新建面试并选择兼容模型。</p>}
      {pendingCandidate && !readOnly && <div className="interview-candidate-actions">
        <button type="button" disabled={chatting || agentBusy || !modelValid || !reasoningValid}
          onClick={() => { void retryInterviewer(); }}><Play size={14} />重试面试官回复</button>
      </div>}
      {candidate.enabled && !pendingCandidate && <div className="interview-candidate-actions">
        {continuous ? <button type="button" onClick={() => { stopAgentRef.current = true; setContinuous(false); }}> <Pause size={14} />本轮后暂停</button> : <>
          <button type="button" disabled={chatting || agentBusy || !candidateValid || !modelValid || !reasoningValid || session.turns.length === 0 || Boolean(draft.trim())}
            onClick={() => { void runCandidateAgent(false); }}><Sparkles size={14} />代答一轮</button>
          <button type="button" disabled={chatting || agentBusy || !candidateValid || !modelValid || !reasoningValid || session.turns.length === 0 || Boolean(draft.trim())}
            onClick={() => { void runCandidateAgent(true); }}><Play size={14} />连续代答</button>
        </>}
      </div>}
      {candidate.enabled && !candidateValid && <p className="interview-conversation-model-note" role="alert">模拟候选人模型或固定思考深度当前不可用，请新建面试并选择兼容模型。</p>}
      <form className="interview-conversation-composer" onSubmit={(event) => { void submit(event); }}>
        <label htmlFor="interview-message-draft" className="sr-only">输入面试回答</label>
        <textarea id="interview-message-draft" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown}
          rows={3} disabled={readOnly || chatting || agentBusy || session.turns.length === 0 || Boolean(pendingCandidate)}
          placeholder={session.turns.length === 0 ? "等待面试官提出首个问题…" : "输入你的回答…"} />
        <div className="interview-conversation-composer-footer">
          <button type="submit" disabled={readOnly || chatting || agentBusy || Boolean(pendingCandidate) || autoStartInterviewId === session.interview.id || !modelValid || !reasoningValid || (session.turns.length > 0 && !draft.trim())}>
            {session.turns.length === 0 ? <Sparkles size={15} /> : <Send size={15} />}{chatting ? "生成中…" : session.turns.length === 0 ? "重试开场" : "发送回答"}
          </button>
        </div>
      </form>
      {error && <p className="interview-conversation-error" role="alert">{error}</p>}
      </>}
    </div>
    {selectedCallGroupId && <InterviewCallDrawer groups={callGroups} selectedId={selectedCallGroupId}
      onSelect={setSelectedCallGroupId} onClose={closeCallDrawer} showSummaries={showDebugSummaries}
      onToggleSummaries={() => setShowDebugSummaries((value) => !value)} topicFlow={session.topicFlow} />}
  </div>;
}
