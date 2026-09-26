/** Transport contracts only; actor-specific parsers still check the interview business rules. */
import { INTERVIEW_QUESTION_TYPES, type InterviewQuestionType } from "../../shared/contracts/interview";

const text = (maxLength: number, minLength = 0) => ({ type: "string", minLength, maxLength });
const choice = (...values: string[]) => ({ type: "string", enum: values });
const object = (properties: Record<string, unknown>) => ({
  type: "object", additionalProperties: false, required: Object.keys(properties), properties,
});
const source = choice(...INTERVIEW_QUESTION_TYPES);

export type InterviewerMessagePayload = { message: string; questionType: InterviewQuestionType };
export const INTERVIEWER_MESSAGE_SCHEMA = object({ message: { type: "string", minLength: 1 },
  questionType: source });

export function parseInterviewerMessage(raw: string): InterviewerMessagePayload {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("面试官输出必须是包含 message 的 JSON 对象");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || typeof record.message !== "string" || !record.message.trim()
    || !INTERVIEW_QUESTION_TYPES.includes(record.questionType as InterviewQuestionType)) {
    throw new Error("面试官输出必须包含非空 message 和有效的 questionType");
  }
  return { message: record.message.trim(), questionType: record.questionType as InterviewQuestionType };
}

export const INTERVIEW_DIRECTOR_SCHEMA = object({
  action: choice("pass", "correct", "redirect", "close"), reason: text(2_000, 1), guidance: text(2_000),
  flow: object({
    answeredTopic: object({ source, anchor: text(160, 1), objective: text(200, 1) }),
    answerEvidence: choice("new", "limited", "none"),
    answerCoverage: { type: "array", maxItems: 4,
      items: object({ kind: choice("role", "foundation"), label: text(160, 1) }) },
    roleGaps: { type: "array", maxItems: 4, items: object({ label: text(160, 1) }) },
    foundationNeed: choice("unknown", "needed", "satisfied", "not_needed"),
    draft: object({ move: choice("continue", "switch", "revisit", "close"), source,
      anchor: text(160, 1), objective: text(200, 1), targetBlockId: text(60),
      bridge: choice("present", "missing", "not_needed"),
      switchReason: choice("none", "sufficient", "no_more_evidence", "candidate_shift", "coverage_priority", "new_contradiction") }),
  }),
});

export const INTERVIEW_SCORE_SCHEMA = object({ dimensions: {
  type: "array", minItems: 3, maxItems: 3,
  items: object({ key: choice("technical", "practice", "communication"),
    score: { type: ["integer", "null"], minimum: 0 }, reason: text(2_000, 1),
    evidence: { type: "array", maxItems: 3, items: object({ turnId: { type: "string", minLength: 1 }, quote: text(500, 1) }) },
  }),
} });
