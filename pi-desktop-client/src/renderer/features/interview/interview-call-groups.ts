import type { InterviewCallTrace, InterviewSession } from "../../../shared/contracts/interview";

export type InterviewCallEntry = { id: string; ordinal: number; trace: InterviewCallTrace };
export type InterviewCallGroup = {
  id: string;
  label: string;
  interviewerTurnId?: string;
  entries: InterviewCallEntry[];
  modelCalls: number;
  hasFailure: boolean;
  directorAction: "correct" | "redirect" | "close" | null;
};

function directorAction(trace: InterviewCallTrace): InterviewCallGroup["directorAction"] {
  if (trace.actor !== "director" || trace.status !== "succeeded") return null;
  try {
    const output = JSON.parse(trace.outputText ?? "") as { action?: string };
    return output.action === "correct" || output.action === "redirect" || output.action === "close"
      ? output.action : null;
  } catch { return null; }
}

function group(id: string, label: string, entries: InterviewCallEntry[], interviewerTurnId?: string): InterviewCallGroup {
  // Published interviewer traces are saved after director review, although their model call ran before it.
  const sorted = entries.sort((left, right) => {
    const leftStarted = Date.parse(left.trace.startedAt);
    const rightStarted = Date.parse(right.trace.startedAt);
    return Number.isFinite(leftStarted) && Number.isFinite(rightStarted) && leftStarted !== rightStarted
      ? leftStarted - rightStarted : left.ordinal - right.ordinal;
  });
  return {
    id, label, ...(interviewerTurnId ? { interviewerTurnId } : {}), entries: sorted,
    modelCalls: sorted.reduce((count, entry) => count + entry.trace.attempts.length, 0),
    hasFailure: sorted.some((entry) => entry.trace.status === "failed"),
    directorAction: sorted.map((entry) => directorAction(entry.trace)).find((action) => action !== null) ?? null,
  };
}

/** A round starts with an interviewer question and ends with its candidate answer. */
export function buildInterviewCallGroups(session: InterviewSession): InterviewCallGroup[] {
  const calls: InterviewCallEntry[] = [
    ...(session.debugEvents ?? []).map((event) => ({ id: event.id, ordinal: event.ordinal, trace: event.trace })),
    ...session.turns.flatMap((turn) => turn.trace
      ? [{ id: `turn:${turn.id}`, ordinal: turn.ordinal, trace: turn.trace }] : []),
  ].sort((left, right) => left.ordinal - right.ordinal);
  const interviewerTurns = session.turns.filter((turn) => turn.role === "interviewer")
    .sort((left, right) => left.ordinal - right.ordinal);
  const candidateTurns = session.turns.filter((turn) => turn.role === "candidate")
    .sort((left, right) => left.ordinal - right.ordinal);
  const groups: InterviewCallGroup[] = [];
  const assigned = new Set<InterviewCallEntry>();
  let previousRoundEnd = Number.NEGATIVE_INFINITY;
  for (const [index, turn] of interviewerTurns.entries()) {
    const roundNumber = candidateTurns.filter((candidate) => candidate.ordinal < turn.ordinal).length + 1;
    const nextQuestionOrdinal = interviewerTurns[index + 1]?.ordinal ?? Number.POSITIVE_INFINITY;
    const answer = candidateTurns.find((candidate) => candidate.ordinal > turn.ordinal
      && candidate.ordinal < nextQuestionOrdinal);
    const entries = calls.filter((call) => !assigned.has(call) && call.trace.actor !== "score"
      && ((call.ordinal > previousRoundEnd && call.ordinal <= turn.ordinal)
        || (call.ordinal > turn.ordinal && call.ordinal < nextQuestionOrdinal
          && (answer ? call.ordinal <= answer.ordinal
            : call.trace.actor === "candidate" || call.trace.actor === "candidate_gate"))));
    for (const entry of entries) assigned.add(entry);
    if (entries.length > 0) groups.push(group(`turn:${turn.id}`,
      turn.questionType === "other" && !answer
        ? session.interview.status === "completed" ? "面试收尾" : "面试官说明（不计轮次）"
        : `第 ${roundNumber} 轮${answer ? "" : "（待回答）"}`,
      entries, turn.id));
    previousRoundEnd = answer?.ordinal ?? turn.ordinal;
  }
  const pending = calls.filter((call) => !assigned.has(call));
  if (pending.length > 0) groups.push(group("other", interviewerTurns.length === 0 ? "开场调用"
    : pending.every((call) => call.trace.actor === "score") ? "会后调用" : "未发送草稿与会后调用", pending));
  return groups;
}
