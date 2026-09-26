import type { InterviewCallTrace, InterviewSession } from "../../../shared/contracts/interview";

function formatDirectorReview(trace: InterviewCallTrace): string {
  const speaker = trace.operationId.includes(":director-verify-") ? "面试导演复核" : "面试导演";
  if (trace.status === "failed") return `${speaker}（审查失败）：${trace.error?.message ?? "未返回有效判断"}`;
  try {
    const decision: unknown = JSON.parse(trace.outputText ?? "");
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) throw new Error("invalid decision");
    const { action, reason, guidance } = decision as Record<string, unknown>;
    const label = action === "pass" ? "放行" : action === "correct" ? "要求修正纠错"
      : action === "redirect" ? "建议换话题"
      : action === "close" ? "建议收尾" : "已审查";
    const details = typeof reason === "string" && reason.trim() ? reason.trim() : "未提供判断依据";
    return `${speaker}（${label}）：${details}${typeof guidance === "string" && guidance.trim()
      ? `\n引导：${guidance.trim()}` : ""}`;
  } catch {
    return `${speaker}（审查结果）：${trace.outputText?.trim() || "未返回有效判断"}`;
  }
}

export function formatInterviewTranscript(session: InterviewSession): string {
  const dialogue = session.turns.map((turn) => {
      const speaker = turn.role === "interviewer" ? "面试官" : turn.source === "agent" ? "模拟候选人" : "候选人";
      return { ordinal: turn.ordinal, text: `${speaker}：${turn.content}` };
    });
  const directorReviews = (session.debugEvents ?? [])
    .filter((event) => event.trace.actor === "director")
    .map((event) => ({ ordinal: event.ordinal, text: formatDirectorReview(event.trace) }));
  const text = [...dialogue, ...directorReviews]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((item) => item.text).join("\n\n");
  return text ? `${text}\n` : "";
}
