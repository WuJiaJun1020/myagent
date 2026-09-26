import type { InterviewChatModelInfo, InterviewChatReasoning } from "../../../shared/contracts/interview";

export const INTERVIEW_REASONING_LEVELS = ["default", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export const INTERVIEW_REASONING_LABELS: Record<InterviewChatReasoning, string> = {
  default: "模型默认", minimal: "最少", low: "低", medium: "中", high: "高", xhigh: "超高", max: "最大",
};

export function supportsInterviewReasoning(model: InterviewChatModelInfo["availableModels"][number],
  reasoning: InterviewChatReasoning): boolean {
  return reasoning === "default" || model.reasoningLevels.includes(reasoning);
}
