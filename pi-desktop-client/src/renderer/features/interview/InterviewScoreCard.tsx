import { INTERVIEW_SCORE_DIMENSIONS, type InterviewScoreReport, type InterviewSession } from "../../../shared/contracts/interview";
import { interviewAlgorithmScore } from "../../../shared/interview-score";

function ReportDetails({ report, session }: { report: InterviewScoreReport; session: InterviewSession }) {
  const answerNumbers = new Map(session.turns.filter((turn) => turn.role === "candidate")
    .map((turn, index) => [turn.id, index + 1]));
  return <div className="interview-score-dimensions">
    {INTERVIEW_SCORE_DIMENSIONS.map((definition) => {
      const dimension = report.dimensions.find((item) => item.key === definition.key);
      return <article key={definition.key}>
        <div><strong>{definition.label}</strong><b>{dimension?.score === null || !dimension ? "未考察"
          : `${dimension.score} / ${definition.maxScore}`}</b></div>
        <p>{dimension?.reason ?? "本轮评分未完成"}</p>
        {dimension?.evidence.map((evidence, index) => <blockquote key={`${evidence.turnId}-${index}`}>
          第 {answerNumbers.get(evidence.turnId) ?? "?"} 次回答：“{evidence.quote}”
        </blockquote>)}
      </article>;
    })}
  </div>;
}

export function InterviewScoreCard({ session, scoring, error, onRetry }: {
  session: InterviewSession; scoring: boolean; error: string | null; onRetry: () => void;
}) {
  const algorithmScore = interviewAlgorithmScore(session.algorithm);
  const reports = session.scoreReports ?? [];
  const latest = reports[0];
  const hasAnswers = session.turns.some((turn) => turn.role === "candidate");
  return <section className="interview-score-card" aria-label="本场面试评分">
    <header><div><span className="eyebrow">INTERVIEW SCORE</span><h2>本场评分</h2></div>
      <button type="button" disabled={scoring || !hasAnswers} onClick={onRetry}>
        {scoring ? "评分中…" : latest ? "重新评分" : "生成评分"}
      </button></header>
    <div className="interview-score-totals">
      <div><small>对话表现</small><strong>{latest?.status === "succeeded" && latest.total !== null
        ? `${latest.total} / 100` : latest?.status === "succeeded" ? "证据不足" : scoring ? "评分中…" : "待评分"}</strong></div>
      <div><small>算法题（独立）</small><strong>{algorithmScore === null ? "不适用" : `${algorithmScore} / 100`}</strong></div>
    </div>
    {session.algorithm && <p className="interview-score-note">算法题：{session.algorithm.problem.title} · {session.algorithm.problem.difficulty}
      {session.algorithm.passedMode ? ` · ${session.algorithm.passedMode.toUpperCase()} 通过` : " · 未通过或未完成"}</p>}
    {latest?.status === "succeeded" && <>
      {latest.coveredWeight < 100 && <p className="interview-score-note">可评估权重 {latest.coveredWeight} / 100；未考察的维度不计 0 分，因此暂不生成完整对话总分。</p>}
      <ReportDetails report={latest} session={session} />
      <details><summary>评分调用参数 · 第 {latest.version} 版</summary>
        <p>{latest.model.providerId} / {latest.model.modelId} · 思考 {latest.reasoning}</p><pre>{latest.prompt}</pre>
      </details>
      {latest.rawOutput && <details><summary>查看模型原始评分输出</summary><pre>{latest.rawOutput}</pre></details>}
    </>}
    {latest?.status === "failed" && <p className="interview-score-error" role="alert">评分失败：{latest.error}</p>}
    {error && <p className="interview-score-error" role="alert">{error}</p>}
    {!hasAnswers && <p className="interview-score-note">没有候选人回答，无法评价对话表现。</p>}
    {reports.length > 1 && <details><summary>查看历史评分（{reports.length - 1} 版）</summary>
      {reports.slice(1).map((report) => <details key={report.id}><summary>第 {report.version} 版 · {report.status === "failed" ? "失败" : report.total === null ? "证据不足" : `${report.total} / 100`}</summary>
        {report.status === "succeeded" ? <ReportDetails report={report} session={session} /> : <p>{report.error}</p>}
      </details>)}
    </details>}
    <p className="interview-score-note">模拟候选人的分数仅用于调试本场面试流程，不等于真实能力证明。</p>
  </section>;
}
