import { CloudCog } from "lucide-react";
import { useEffect } from "react";
import type { DesktopModel, ThinkingLevel } from "../../../shared/contracts/agent-session";
import { normalizeThinkingLevels } from "../../../shared/thinking-levels";
import { useAgentStore } from "../../stores/agent-store";
import { useProviderStore } from "../../stores/provider-store";
import { usePiSettingsStore } from "../../stores/pi-settings-store";
import { useSessionStore } from "../../stores/session-store";
import { useUiStore } from "../../stores/ui-store";
import { SettingsGroup, SettingsRow } from "./SettingsPrimitives";

const MODEL_SEPARATOR = "␟";
const thinkingLabels: Record<ThinkingLevel, string> = {
  off: "关闭",
  minimal: "最少",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "超高",
  max: "最大",
};

function groupModels(models: DesktopModel[]): Array<[string, DesktopModel[]]> {
  const groups = new Map<string, DesktopModel[]>();
  for (const model of models) groups.set(model.provider, [...(groups.get(model.provider) ?? []), model]);
  return [...groups.entries()];
}

export function AgentSettings() {
  const session = useSessionStore((state) => state.session);
  const models = useSessionStore((state) => state.models);
  const thinkingLevels = useSessionStore((state) => state.thinkingLevels);
  const mutation = useSessionStore((state) => state.mutation);
  const error = useSessionStore((state) => state.error);
  const selectModel = useSessionStore((state) => state.selectModel);
  const selectThinkingLevel = useSessionStore((state) => state.selectThinkingLevel);
  const busy = useAgentStore((state) => state.busy);
  const providers = useProviderStore((state) => state.providers);
  const setProviderSettingsOpen = useUiStore((state) => state.setProviderSettingsOpen);
  const hostSettings = usePiSettingsStore((state) => state.settings);
  const settingsLoading = usePiSettingsStore((state) => state.loading);
  const settingsSaving = usePiSettingsStore((state) => state.saving);
  const settingsError = usePiSettingsStore((state) => state.error);
  const initializeSettings = usePiSettingsStore((state) => state.initialize);
  const updateSettings = usePiSettingsStore((state) => state.update);
  const modelValue = session?.model ? `${session.model.provider}${MODEL_SEPARATOR}${session.model.id}` : "";
  const controlsDisabled = busy || Boolean(mutation) || !session;
  const availableThinkingLevels = normalizeThinkingLevels(thinkingLevels, session?.thinkingLevel);
  const enabledModels = hostSettings?.global.enabledModels ?? [];
  const currentModelReference = session?.model ? `${session.model.provider}/${session.model.id}` : "";
  const currentModelDefaultThinking = currentModelReference
    ? hostSettings?.global.modelThinkingLevels?.[currentModelReference]
    : undefined;
  const hostControlsDisabled = busy || settingsLoading || settingsSaving;

  useEffect(() => {
    void initializeSettings();
  }, [initializeSettings]);

  return (
    <>
      <SettingsGroup title="当前会话模型" description="修改会同步到 Pi，并记作后续会话的首选项。">
        <SettingsRow title="模型" description="选择当前会话使用的模型。">
          <select
            value={modelValue}
            disabled={controlsDisabled || models.length === 0}
            onChange={(event) => {
              const [provider, modelId] = event.target.value.split(MODEL_SEPARATOR);
              if (provider && modelId) void selectModel(provider, modelId);
            }}
          >
            {!modelValue && <option value="">未选择模型</option>}
            {groupModels(models).map(([provider, providerModels]) => (
              <optgroup key={provider} label={provider}>
                {providerModels.map((model) => (
                  <option key={`${model.provider}/${model.id}`} value={`${model.provider}${MODEL_SEPARATOR}${model.id}`}>{model.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </SettingsRow>
        <SettingsRow title="思考深度" description="控制支持推理的模型投入多少思考。">
          <select
            value={session?.thinkingLevel ?? "off"}
            disabled={controlsDisabled}
            onChange={(event) => void selectThinkingLevel(event.target.value as ThinkingLevel)}
          >
            {availableThinkingLevels.map((level) => <option value={level} key={level}>{thinkingLabels[level]}</option>)}
          </select>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="新会话默认值" description="这些选项写入 Pi 的全局设置；当前会话不会被强制切换。">
        <SettingsRow
          title="默认模型"
          description={hostSettings?.effective.defaultProvider && hostSettings.effective.defaultModel
            ? `${hostSettings.effective.defaultProvider}/${hostSettings.effective.defaultModel}`
            : "尚未设置；Pi 将按可用模型选择"}
        >
          <button
            className="settings-action-button"
            type="button"
            disabled={!session?.model || hostControlsDisabled}
            onClick={() => session?.model && void updateSettings({
              defaultProvider: session.model.provider,
              defaultModel: session.model.id,
            })}
          >
            设为当前模型
          </button>
        </SettingsRow>
        <SettingsRow title="默认思考深度" description="新会话未命中模型专属设置时使用。">
          <select
            value={hostSettings?.global.defaultThinkingLevel ?? ""}
            disabled={hostControlsDisabled}
            onChange={(event) => event.target.value && void updateSettings({ defaultThinkingLevel: event.target.value as ThinkingLevel })}
          >
            <option value="">使用 Pi 默认值</option>
            {Object.entries(thinkingLabels).map(([level, label]) => <option key={level} value={level}>{label}</option>)}
          </select>
        </SettingsRow>
        <SettingsRow
          title="当前模型默认思考深度"
          description={currentModelReference || "请先为当前会话选择模型"}
        >
          <select
            value={currentModelDefaultThinking ?? ""}
            disabled={!currentModelReference || hostControlsDisabled}
            onChange={(event) => {
              if (!currentModelReference) return;
              const next = { ...(hostSettings?.global.modelThinkingLevels ?? {}) };
              if (event.target.value) next[currentModelReference] = event.target.value as ThinkingLevel;
              else delete next[currentModelReference];
              void updateSettings({ modelThinkingLevels: next });
            }}
          >
            <option value="">跟随全局默认</option>
            {Object.entries(thinkingLabels).map(([level, label]) => <option key={level} value={level}>{label}</option>)}
          </select>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="模型作用域" description="限制参与模型切换的模型；未勾选时不限制。修改会立即应用，并保存给后续会话。">
        <div className="settings-check-grid" aria-label="启用的模型">
          {models.map((model) => {
            const reference = `${model.provider}/${model.id}`;
            return (
              <label key={reference}>
                <input
                  type="checkbox"
                  checked={enabledModels.includes(reference)}
                  disabled={hostControlsDisabled}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...enabledModels, reference]
                      : enabledModels.filter((value) => value !== reference);
                    void updateSettings({ enabledModels: next });
                  }}
                />
                <span><strong>{model.name}</strong><small>{reference}</small></span>
              </label>
            );
          })}
        </div>
        <p className="settings-privacy-note">当前选择 {enabledModels.length || "全部"}；列表为空表示允许全部可用模型。</p>
      </SettingsGroup>

      <SettingsGroup title="模型服务" description="认证信息由 Pi 管理，桌面端不会保存密钥明文。">
        <button className="settings-provider-button" type="button" onClick={() => setProviderSettingsOpen(true)}>
          <CloudCog size={17} />
          <span>
            <strong>管理模型提供商</strong>
            <small>{providers.filter((provider) => provider.configured).length}/{providers.length || "-"} 已配置 · API Key 与账号登录</small>
          </span>
        </button>
      </SettingsGroup>

      {busy && session && <p className="settings-inline-note">Agent 正在执行，当前会话配置暂不可修改。</p>}
      {error && <p className="settings-error">{error}</p>}
      {settingsError && <p className="settings-error">{settingsError}</p>}
    </>
  );
}
