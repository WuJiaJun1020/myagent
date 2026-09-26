import type { CandidateMistakeOutcome } from "../../shared/contracts/interview";
import type { CandidateResponseMode } from "./candidate-response-mode";

export type CandidateAnswerPayload = Pick<CandidateMistakeOutcome, "mistakeMade" | "mistakeKind" | "mistakeQuote"> & {
  answer: string;
};

export const CANDIDATE_ANSWER_SCHEMA: Readonly<Record<string, unknown>> = {
  type: "object", additionalProperties: false, required: ["answer", "mistakeMade", "mistakeKind", "mistakeQuote"],
  properties: {
    answer: { type: "string", minLength: 1, maxLength: 8_000 },
    mistakeMade: { type: "boolean" },
    mistakeKind: { type: "string", enum: ["none", "misconception", "slip"] },
    mistakeQuote: { type: "string", maxLength: 300 },
  },
};

export function parseCandidateAnswer(text: string, decision: CandidateResponseMode): CandidateAnswerPayload {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("候选人输出必须是 JSON 对象");
  const result = value as Record<string, unknown>;
  if (typeof result.answer !== "string" || !result.answer.trim() || result.answer.length > 8_000) {
    throw new Error("候选人 answer 必须是 1–8,000 字符的回答");
  }
  if (typeof result.mistakeMade !== "boolean" || typeof result.mistakeQuote !== "string"
    || !["none", "misconception", "slip"].includes(String(result.mistakeKind))) {
    throw new Error("候选人误答统计字段无效");
  }
  if (result.mistakeQuote.length > 300) throw new Error("候选人误答原文过长");
  if (result.mistakeMade) {
    if (decision.mode !== "mistake") throw new Error("误答标记与 normal 模式不一致：mistakeMade 必须为 false，mistakeKind 为 none，mistakeQuote 为空字符串");
    if (result.mistakeKind !== decision.errorKind) throw new Error(`误答标记与本轮控制不一致：实施误答时 mistakeKind 必须为 ${decision.errorKind}`);
    if (!result.mistakeQuote.trim() || !result.answer.includes(result.mistakeQuote)) {
      throw new Error("误答引用与回答不一致：mistakeQuote 必须逐字摘取 answer 中实际说错的非空连续片段");
    }
  } else if (result.mistakeKind !== "none" || result.mistakeQuote !== "") {
    throw new Error("未实施误答时，类型必须为 none 且原文必须为空");
  }
  return {
    answer: result.answer.trim(), mistakeMade: result.mistakeMade,
    mistakeKind: result.mistakeKind as CandidateAnswerPayload["mistakeKind"], mistakeQuote: result.mistakeQuote,
  };
}
