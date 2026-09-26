import { randomInt } from "node:crypto";
import type { InterviewCallTrace, InterviewSession } from "../../shared/contracts/interview";
import { DEFAULT_INTERVIEW_CHAT_MODEL } from "../../shared/contracts/interview";

export type CandidateResponseMode = {
  questionTurnId: string;
  errorRate: number;
  draw: number;
  mode: "normal" | "mistake";
  errorKind: "none" | "misconception" | "slip";
};

export function candidateResponseModeOperationId(questionTurnId: string): string {
  return `candidate-mode:${questionTurnId}`;
}

export function readCandidateResponseMode(session: InterviewSession): CandidateResponseMode | null {
  const questionTurnId = session.turns.at(-1)?.id;
  if (!questionTurnId) return null;
  const trace = session.debugEvents?.find((event) => event.trace.actor === "candidate_gate"
    && event.trace.operationId === candidateResponseModeOperationId(questionTurnId))?.trace;
  if (!trace?.outputText) return null;
  try {
    const value: unknown = JSON.parse(trace.outputText);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.questionTurnId !== questionTurnId || typeof record.errorRate !== "number"
      || typeof record.draw !== "number" || (record.mode !== "normal" && record.mode !== "mistake")
      || (record.errorKind !== "none" && record.errorKind !== "misconception" && record.errorKind !== "slip")) return null;
    return record as CandidateResponseMode;
  } catch { return null; }
}

export function chooseCandidateResponseMode(questionTurnId: string, errorRate: number,
  draw = randomInt(1_000_000)): CandidateResponseMode {
  if (!Number.isInteger(errorRate) || errorRate < 0 || errorRate > 100) throw new Error("模拟误答概率必须为 0–100 的整数");
  if (!Number.isInteger(draw) || draw < 0 || draw >= 1_000_000) throw new Error("模拟误答抽签值无效");
  const mistake = draw < errorRate * 10_000;
  return { questionTurnId, errorRate, draw, mode: mistake ? "mistake" : "normal",
    errorKind: mistake ? (draw % 2 === 0 ? "misconception" : "slip") : "none" };
}

export function candidateResponseModeInstruction(decision: CandidateResponseMode): string {
  return `【本轮程序控制，非面试官发言】\n${JSON.stringify({ mode: decision.mode, mistakeKind: decision.errorKind })}`;
}

export function candidateResponseModeTrace(decision: CandidateResponseMode): InterviewCallTrace {
  const now = new Date().toISOString();
  return { actor: "candidate_gate", operationId: candidateResponseModeOperationId(decision.questionTurnId),
    status: "succeeded", startedAt: now, finishedAt: now,
    requestedModel: DEFAULT_INTERVIEW_CHAT_MODEL, reasoning: "default", timeoutMs: 0,
    messages: [], attempts: [], outputText: JSON.stringify(decision) };
}
