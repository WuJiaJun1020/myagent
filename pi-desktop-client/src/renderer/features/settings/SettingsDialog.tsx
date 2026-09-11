import { AnimatePresence, motion } from "framer-motion";
import { Bot, BrainCircuit, CloudCog, MonitorCog, Palette, Settings2, ShieldCheck, X } from "lucide-react";
import { useEffect } from "react";
import type { DesktopModel, ThinkingLevel } from "../../../shared/contracts/agent-session";
import { useAgentStore } from "../../stores/agent-store";
import { useSessionStore } from "../../stores/session-store";
import { useResourceStore } from "../../stores/resource-store";
import { useProviderStore } from "../../stores/provider-store";
import { useSettingsStore, type ThemePreference } from "../../stores/settings-store";
import { useUiStore } from "../../stores/ui-store";

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

export function SettingsDialog() {
  const open = useUiStore((state) => state.settingsOpen);
  const setOpen = useUiStore((state) => state.setSettingsOpen);
  const setProviderSettingsOpen = useUiStore((state) => state.setProviderSettingsOpen);
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const animationEnabled = useSettingsStore((state) => state.animationEnabled);
  const setAnimationEnabled = useSettingsStore((state) => state.setAnimationEnabled);
  const session = useSessionStore((state) => state.session);
  const models = useSessionStore((state) => state.models);
  const thinkingLevels = useSessionStore((state) => state.thinkingLevels);
  const mutation = useSessionStore((state) => state.mutation);
  const error = useSessionStore((state) => state.error);
  const selectModel = useSessionStore((state) => state.selectModel);
  const selectThinkingLevel = useSessionStore((state) => state.selectThinkingLevel);
  const busy = useAgentStore((state) => state.busy);
  const tools = useResourceStore((state) => state.tools);
  const mcpServers = useResourceStore((state) => state.mcpServers);
  const memories = useResourceStore((state) => state.memories);
  const providers = useProviderStore((state) => state.providers);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  const modelValue = session?.model ? `${session.model.provider}${MODEL_SEPARATOR}${session.model.id}` : "";
  const controlsDisabled = busy || Boolean(mutation);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <motion.section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            initial={{ opacity: 0, scale: .98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: .98, y: 8 }}
          >
            <header>
              <div><span><Settings2 size={16} /></span><div><small>PI DESKTOP</small><h2 id="settings-title">设置</h2></div></div>
              <button type="button" aria-label="关闭设置" onClick={() => setOpen(false)}><X size={16} /></button>
            </header>

            <div className="settings-content">
              <section className="settings-section">
                <div className="settings-section-title"><Palette size={15} /><div><strong>外观</strong><small>保存在此电脑上</small></div></div>
                <label className="settings-field">
                  <span>主题</span>
                  <select value={theme} onChange={(event) => setTheme(event.target.value as ThemePreference)}>
                    <option value="dark">深色</option>
                    <option value="light">浅色</option>
                    <option value="system">跟随系统</option>
                  </select>
                </label>
                <label className="settings-toggle">
                  <span><strong>界面动画</strong><small>关闭后减少面板和列表动效</small></span>
                  <input type="checkbox" checked={animationEnabled} onChange={(event) => setAnimationEnabled(event.target.checked)} />
                </label>
              </section>

              <section className="settings-section">
                <div className="settings-section-title"><Bot size={15} /><div><strong>Agent 模型</strong><small>状态直接同步到 Pi RPC</small></div></div>
                <label className="settings-field">
                  <span>模型</span>
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
                </label>
                <label className="settings-field">
                  <span>Thinking Level</span>
                  <select
                    value={session?.thinkingLevel ?? "off"}
                    disabled={controlsDisabled}
                    onChange={(event) => void selectThinkingLevel(event.target.value as ThinkingLevel)}
                  >
                    {thinkingLevels.map((level) => <option value={level} key={level}>{thinkingLabels[level]}</option>)}
                  </select>
                </label>
                <button
                  className="settings-provider-button"
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setProviderSettingsOpen(true);
                  }}
                >
                  <CloudCog size={15} />
                  <span><strong>管理模型提供商</strong><small>{providers.filter((provider) => provider.configured).length}/{providers.length || "-"} 已配置 · API Key 与账号登录</small></span>
                </button>
              </section>

              <section className="settings-section compact">
                <div className="settings-section-title"><MonitorCog size={15} /><div><strong>当前运行状态</strong><small>由 Pi 会话提供</small></div></div>
                <div className="settings-facts">
                  <span><small>会话</small><strong>{session?.name || session?.id.slice(0, 12) || "未连接"}</strong></span>
                  <span><small>模式</small><strong>{session?.mode === "chat" ? "纯聊天" : "工作"}</strong></span>
                  <span><small>上下文</small><strong>{session?.model?.contextWindow ? `${Math.round(session.model.contextWindow / 1000)}K` : "-"}</strong></span>
                  <span><small>Reasoning</small><strong>{session?.model?.reasoning ? "支持" : "关闭"}</strong></span>
                </div>
              </section>

              <section className="settings-section compact">
                <div className="settings-section-title"><ShieldCheck size={15} /><div><strong>资源与隐私</strong><small>运行时状态，不保存资源正文</small></div></div>
                <div className="settings-facts">
                  <span><small>Active Tools</small><strong>{tools.filter((tool) => tool.active).length}</strong></span>
                  <span><small>MCP Extensions</small><strong>{mcpServers.length}</strong></span>
                  <span><small>Memory Sources</small><strong>{memories.length}</strong></span>
                </div>
                <p className="settings-privacy-note">MCP 凭据由对应 Pi Extension 管理；Memory 页面只展示当前加载的上下文文件，不会复制保存其内容。</p>
              </section>

              {error && <div className="settings-error"><BrainCircuit size={14} />{error}</div>}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
