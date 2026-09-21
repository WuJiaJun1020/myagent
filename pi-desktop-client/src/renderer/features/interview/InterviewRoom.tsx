import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  FileText,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { InterviewStatus } from "../../../shared/contracts/interview";
import { useInterviewStore } from "../../stores/interview-store";
import { useUiStore } from "../../stores/ui-store";

const STATUS_LABELS: Record<InterviewStatus, string> = {
  draft: "草稿",
  preparing: "准备中",
  ready: "待开始",
  interviewing: "面试中",
  generating_report: "生成报告",
  completed: "已完成",
};

const KIND_LABELS = {
  technical: "技术题",
  project: "项目题",
  behavioral: "行为题",
  scenario: "场景题",
} as const;

const DIFFICULTY_LABELS = {
  introductory: "基础",
  intermediate: "进阶",
  advanced: "深入",
} as const;

export function InterviewRoom() {
  const selectedId = useInterviewStore((state) => state.selectedId);
  const session = useInterviewStore((state) => state.session);
  const loading = useInterviewStore((state) => state.sessionLoading);
  const error = useInterviewStore((state) => state.error);
  const preparingInterviewId = useInterviewStore((state) => state.preparingInterviewId);
  const progress = useInterviewStore((state) => state.preparationProgress);
  const openInterview = useInterviewStore((state) => state.openInterview);
  const prepareInterview = useInterviewStore((state) => state.prepareInterview);
  const setInterviewView = useUiStore((state) => state.setInterviewView);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);

  useEffect(() => {
    setPrivacyConfirmed(false);
    if (selectedId) void openInterview(selectedId);
  }, [openInterview, selectedId]);

  const isPreparing = Boolean(selectedId && preparingInterviewId === selectedId)
    || session?.interview.status === "preparing";
  const preparationError = session?.preparationError?.message ?? error;

  async function prepare(): Promise<void> {
    if (!selectedId || !privacyConfirmed) return;
    try {
      await prepareInterview(selectedId, true);
      setPrivacyConfirmed(false);
    } catch {
      // The store exposes the safe main-process failure and reloads persisted state.
      setPrivacyConfirmed(false);
    }
  }

  return (
    <div className="interview-page-scroll">
      <main className="interview-room">
        <button className="interview-room-back" type="button" onClick={() => setInterviewView("dashboard")}>
          <ArrowLeft size={15} />返回面试记录
        </button>

        {!selectedId ? (
          <section className="interview-room-empty">
            <ClipboardCheck size={24} />
            <strong>尚未选择面试</strong>
            <p>请返回面试记录，选择一场面试继续。</p>
          </section>
        ) : loading && !session ? (
          <section className="interview-room-loading" aria-live="polite">
            <LoaderCircle className="spin" size={19} />正在读取面试状态…
          </section>
        ) : !session ? (
          <section className="interview-room-empty" role="alert">
            <FileText size={23} />
            <strong>无法打开这场面试</strong>
            <p>{error ?? "面试记录不存在或暂时不可用。"}</p>
            <button type="button" onClick={() => void openInterview(selectedId)}><RotateCcw size={14} />重新读取</button>
          </section>
        ) : (
          <>
            <header className="interview-room-header">
              <div>
                <span className="eyebrow">INTERVIEW SESSION</span>
                <h1>{session.interview.title}</h1>
                <p><UserRound size={14} />{session.interview.candidateName}<span />{session.interview.positionTitle}</p>
              </div>
              <em data-status={session.interview.status}>{STATUS_LABELS[session.interview.status]}</em>
            </header>

            <section className="interview-room-overview" aria-label="面试配置">
              <article><small>计划题数</small><strong>{session.interview.questionCount}</strong></article>
              <article><small>已回答</small><strong>{session.answeredCount}</strong></article>
              <article><small>能力维度</small><strong>{session.interview.competencies.length}</strong></article>
            </section>

            {isPreparing ? (
              <section className="interview-preparing-card" aria-live="polite">
                <div className="interview-state-icon"><LoaderCircle className="spin" size={23} /></div>
                <span className="eyebrow">PREPARING</span>
                <h2>正在准备面试计划</h2>
                <p>{progress?.interviewId === selectedId ? progress.message : "正在生成并保存固定题目计划，请稍候…"}</p>
                <div className="interview-progress-track"><i /></div>
                <small>若客户端在生成期间关闭，会安全回到草稿或上一版计划，并提示重新准备。</small>
              </section>
            ) : session.interview.status === "draft" ? (
              <section className="interview-prepare-card">
                <header>
                  <div className="interview-state-icon"><Sparkles size={22} /></div>
                  <div><span className="eyebrow">PREPARE</span><h2>生成固定面试计划</h2><p>根据岗位、简历和能力维度生成本场面试的题目结构。</p></div>
                </header>

                <div className="interview-plan-inputs">
                  <div><FileText size={16} /><span><strong>岗位描述</strong><small>已保存到本地业务数据库</small></span><Check size={15} /></div>
                  <div><UserRound size={16} /><span><strong>候选人简历</strong><small>已保存到本地业务数据库</small></span><Check size={15} /></div>
                </div>

                {preparationError && (
                  <div className="interview-prepare-error" role="alert">
                    <strong>上次准备未完成</strong><p>{preparationError}</p>
                  </div>
                )}

                <label className="interview-privacy-confirmation">
                  <input
                    type="checkbox"
                    checked={privacyConfirmed}
                    onChange={(event) => setPrivacyConfirmed(event.target.checked)}
                  />
                  <span><ShieldCheck size={17} /><span><strong>确认发送必要材料</strong><small>岗位描述和简历将发送给当前配置的模型 Provider，仅用于生成本场题目；不会创建 Pi 会话，也不会写入普通会话上下文。</small></span></span>
                </label>

                <footer>
                  <small>每次重新生成都会要求单独确认。</small>
                  <button className="interview-primary-button" type="button" disabled={!privacyConfirmed} onClick={() => void prepare()}>
                    {preparationError ? <RotateCcw size={15} /> : <Sparkles size={15} />}
                    {preparationError ? "重新准备" : "准备面试"}
                  </button>
                </footer>
              </section>
            ) : session.plan ? (
              <section className="interview-ready-card">
                <header>
                  <div className="interview-state-icon ready"><Check size={23} /></div>
                  <div><span className="eyebrow">PLAN READY</span><h2>面试计划已就绪</h2><p>计划已固定并保存在本机，重新启动客户端后仍可继续。</p></div>
                </header>
                <div className="interview-plan-summary">
                  <article><small>计划版本</small><strong>第 {session.plan.version} 版</strong></article>
                  <article><small>题目数量</small><strong>{session.plan.questionCount} 题</strong></article>
                  <article><small>提示词版本</small><strong>{session.plan.promptVersion}</strong></article>
                </div>
                <div className="interview-plan-competencies">
                  <small>覆盖能力维度</small>
                  <div>{session.plan.competencies.map((competency) => <span key={competency}>{competency}</span>)}</div>
                </div>
                {session.currentQuestion && (
                  <article className="interview-current-question">
                    <header><span>第 {session.currentQuestion.ordinal + 1} / {session.currentQuestion.total} 题</span><small>{KIND_LABELS[session.currentQuestion.kind]} · {DIFFICULTY_LABELS[session.currentQuestion.difficulty]}</small></header>
                    <strong>{session.currentQuestion.prompt}</strong>
                    <p>{session.currentQuestion.competency}</p>
                  </article>
                )}
                <footer>
                  <span><ShieldCheck size={15} />未开始前不会一次性加载或展示全部题目。</span>
                  <button className="interview-primary-button" type="button" disabled>开始面试（下一阶段）</button>
                </footer>
              </section>
            ) : (
              <section className="interview-room-empty">
                <ClipboardCheck size={23} />
                <strong>{STATUS_LABELS[session.interview.status]}</strong>
                <p>该状态的交互将在下一阶段接入。</p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
