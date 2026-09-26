import type { InterviewChatModelInfo, InterviewChatSettings } from "../../../shared/contracts/interview";
import { DEFAULT_INTERVIEW_CHAT_MODEL } from "../../../shared/contracts/interview";
import { INTERVIEW_REASONING_LABELS, INTERVIEW_REASONING_LEVELS, supportsInterviewReasoning } from "./interview-model-settings";

type AgentKey = "interviewer" | "candidate" | "director" | "score";
type AgentSettings = Record<AgentKey, InterviewChatSettings>;

export function InterviewCreateAgentSettings({ settings, models, onChange }: {
  settings: AgentSettings;
  models: InterviewChatModelInfo["availableModels"];
  onChange: (actor: AgentKey, settings: InterviewChatSettings) => void;
}) {
  const rows: Array<{ actor: AgentKey; label: string }> = [
    { actor: "interviewer", label: "面试官" },
    { actor: "candidate", label: "模拟候选人" },
    { actor: "director", label: "面试导演" },
    { actor: "score", label: "面试评分" },
  ];
  return <section className="interview-create-agent-settings" aria-label="Agent 模型与思考深度">
    <div className="interview-create-agent-settings-heading"><strong>Agent 模型与思考深度</strong>
      <small>思考深度在创建后固定；切换到不兼容的模型时会改为模型默认</small></div>
    {rows.map(({ actor, label }) => {
      const current = settings[actor];
      const selected = current.model ?? DEFAULT_INTERVIEW_CHAT_MODEL;
      const activeModel = models.find((model) => model.providerId === selected.providerId && model.modelId === selected.modelId);
      const modelValue = current.model ? JSON.stringify([current.model.providerId, current.model.modelId]) : "";
      return <div className="interview-create-agent-settings-row" key={actor}>
        <strong>{label}</strong>
        <label><span className="sr-only">{label}模型</span><select aria-label={`${label}模型`} value={modelValue}
          onChange={(event) => {
            const model = models.find((item) => JSON.stringify([item.providerId, item.modelId]) === event.target.value);
            const targetModel = model ?? models.find((item) => item.providerId === DEFAULT_INTERVIEW_CHAT_MODEL.providerId
              && item.modelId === DEFAULT_INTERVIEW_CHAT_MODEL.modelId);
            onChange(actor, { ...(model ? { model: { providerId: model.providerId, modelId: model.modelId } } : {}),
              reasoning: targetModel && !supportsInterviewReasoning(targetModel, current.reasoning) ? "default" : current.reasoning });
          }}><option value="">GPT-6 Luna（默认路由）</option>
          {current.model && !activeModel && <option value={modelValue}>{current.model.providerId} / {current.model.modelId}（当前不可用）</option>}
          {models.map((model) => <option key={`${model.providerId}/${model.modelId}`}
            value={JSON.stringify([model.providerId, model.modelId])}>{model.providerId} / {model.name}</option>)}
        </select></label>
        <label><span className="sr-only">{label}思考深度</span><select aria-label={`${label}思考深度`} value={current.reasoning}
          onChange={(event) => onChange(actor, { ...current, reasoning: event.target.value as InterviewChatSettings["reasoning"] })}>
          {INTERVIEW_REASONING_LEVELS.filter((level) => level === "default" || !activeModel || supportsInterviewReasoning(activeModel, level))
            .map((level) => <option key={level} value={level}>{INTERVIEW_REASONING_LABELS[level]}</option>)}
        </select></label>
      </div>;
    })}
  </section>;
}
