import type { InterviewChatModelInfo, InterviewChatSettings } from "../../../shared/contracts/interview";
import { DEFAULT_INTERVIEW_CHAT_MODEL } from "../../../shared/contracts/interview";
import { INTERVIEW_REASONING_LABELS } from "./interview-model-settings";

export function InterviewAgentModelLine({ settings, models }: {
  settings: InterviewChatSettings;
  models: InterviewChatModelInfo["availableModels"];
}) {
  const selected = settings.model ?? DEFAULT_INTERVIEW_CHAT_MODEL;
  const activeModel = models.find((model) => model.providerId === selected.providerId && model.modelId === selected.modelId);
  return <div className="interview-agent-model-line">
    <span>模型</span>
    <strong title={`${selected.providerId} / ${selected.modelId}`}>{activeModel?.name ?? settings.model?.modelId ?? "GPT-6 Luna"}</strong>
    <span>思考</span><strong>{INTERVIEW_REASONING_LABELS[settings.reasoning]}</strong>
  </div>;
}
