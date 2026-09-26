import { type InterviewCallTrace, type InterviewChatModelInfo,
  type InterviewSession } from "../../../shared/contracts/interview";

type Actor = "interviewer" | "candidate" | "director" | "score";

function interviewTraces(session: InterviewSession, actor?: Actor): InterviewCallTrace[] {
  return [
    ...session.turns.flatMap((turn) => turn.trace && (!actor || turn.trace.actor === actor
      || actor === "interviewer" && turn.role === "interviewer" && !turn.trace.actor) ? [turn.trace] : []),
    ...(session.debugEvents ?? []).flatMap((event) => !actor || event.trace.actor === actor ? [event.trace] : []),
  ];
}

/** Count physical attempts, including discarded drafts and format repairs, only when both input counters are reported. */
export function readInterviewCacheUsage(session: InterviewSession, actor?: Actor): {
  cachedInputTokens: number | null; cacheTotalInputTokens: number | null;
  cacheHitRate: number | null; measuredAttempts: number; unmeasuredAttempts: number;
} {
  let cachedInputTokens = 0;
  let cacheTotalInputTokens = 0;
  let measuredAttempts = 0;
  let unmeasuredAttempts = 0;
  for (const trace of interviewTraces(session, actor)) {
    for (const attempt of trace.attempts) {
      const usage = attempt.usage;
      if (usage?.inputTokens === undefined || usage.cachedInputTokens === undefined) {
        unmeasuredAttempts += 1;
        continue;
      }
      measuredAttempts += 1;
      cachedInputTokens += usage.cachedInputTokens;
      cacheTotalInputTokens += usage.inputTokens + usage.cachedInputTokens + (usage.cachedWriteTokens ?? 0);
    }
  }
  return { cachedInputTokens: measuredAttempts ? cachedInputTokens : null,
    cacheTotalInputTokens: measuredAttempts ? cacheTotalInputTokens : null,
    cacheHitRate: cacheTotalInputTokens > 0 ? cachedInputTokens / cacheTotalInputTokens : null,
    measuredAttempts, unmeasuredAttempts };
}

function inputTokens(usage: InterviewCallTrace["attempts"][number]["usage"]): number | null {
  if (!usage || (usage.inputTokens === undefined && usage.cachedInputTokens === undefined
    && usage.cachedWriteTokens === undefined)) return null;
  const input = (usage.inputTokens ?? 0) + (usage.cachedInputTokens ?? 0) + (usage.cachedWriteTokens ?? 0);
  return input > 0 ? input : null;
}

/** The session total counts all attempts; the latest context is one complete, successful request. */
export function readInterviewContextUsage(session: InterviewSession,
  models: InterviewChatModelInfo["availableModels"], actor?: Actor): {
    totalInputTokens: number | null; latestInputTokens: number | null; latestContextWindowTokens: number | null;
    latestContextPercent: number | null; measuredInputAttempts: number; partialInputAttempts: number;
    unmeasuredInputAttempts: number;
  } {
  let totalInputTokens = 0;
  let measuredInputAttempts = 0;
  let partialInputAttempts = 0;
  let unmeasuredInputAttempts = 0;
  for (const trace of interviewTraces(session, actor)) {
    for (const attempt of trace.attempts) {
      const usage = attempt.usage;
      const input = inputTokens(usage);
      if (input === null) {
        unmeasuredInputAttempts += 1;
        continue;
      }
      measuredInputAttempts += 1;
      if (usage!.inputTokens === undefined || usage!.cachedInputTokens === undefined) partialInputAttempts += 1;
      totalInputTokens += input;
    }
  }
  const successfulTraces = actor === "interviewer"
    ? session.turns.filter((turn) => turn.role === "interviewer" && turn.trace?.status === "succeeded")
      .map((turn) => turn.trace!)
    : interviewTraces(session, actor).filter((trace) => trace.status === "succeeded");
  const latestAttempt = successfulTraces.at(-1)?.attempts.at(-1);
  const latestInputTokens = inputTokens(latestAttempt?.usage);
  const latestModel = latestAttempt && (models.find((item) => item.modelId === latestAttempt.modelId
    && item.providerId === latestAttempt.providerId)
    ?? models.find((item) => item.modelId === latestAttempt.modelId
      && ((item.providerId === "openai-codex" && latestAttempt.providerId === "openai")
        || (item.providerId === "openai" && latestAttempt.providerId === "openai-codex"))));
  const latestContextWindowTokens = latestModel?.contextWindowTokens ?? null;
  return { totalInputTokens: measuredInputAttempts ? totalInputTokens : null,
    latestInputTokens, latestContextWindowTokens,
    latestContextPercent: latestInputTokens !== null && latestContextWindowTokens
      ? latestInputTokens / latestContextWindowTokens * 100 : null,
    measuredInputAttempts, partialInputAttempts, unmeasuredInputAttempts };
}
