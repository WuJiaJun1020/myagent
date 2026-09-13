import { LoaderCircle, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { agentGateway } from "../../services/agent-gateway";
import { useAgentStore } from "../../stores/agent-store";
import { usePiSettingsStore } from "../../stores/pi-settings-store";
import { useResourceStore } from "../../stores/resource-store";
import { useSessionStore } from "../../stores/session-store";
import { useUiStore } from "../../stores/ui-store";
import { SettingsGroup, SettingsRow } from "./SettingsPrimitives";

const builtinTools = [
  ["read", "读取文件"],
  ["bash", "Bash"],
  ["powershell", "PowerShell"],
  ["edit", "编辑文件"],
  ["write", "写入文件"],
  ["grep", "搜索文本"],
  ["find", "查找文件"],
  ["ls", "列出目录"],
] as const;

export function RuntimeSettings() {
  const status = useAgentStore((state) => state.processStatus);
  const busy = useAgentStore((state) => state.busy);
  const agentError = useAgentStore((state) => state.error);
  const setStatus = useAgentStore((state) => state.setProcessStatus);
  const setError = useAgentStore((state) => state.setError);
  const resetSession = useAgentStore((state) => state.resetSession);
  const session = useSessionStore((state) => state.session);
  const tools = useResourceStore((state) => state.tools);
  const mcpServers = useResourceStore((state) => state.mcpServers);
  const memories = useResourceStore((state) => state.memories);
  const commandResources = useResourceStore((state) => state.commandResources);
  const resourceIssues = useResourceStore((state) => state.issues);
  const resourcesLoading = useResourceStore((state) => state.loading);
  const reloadResources = useResourceStore((state) => state.reload);
  const hostSettings = usePiSettingsStore((state) => state.settings);
  const settingsLoading = usePiSettingsStore((state) => state.loading);
  const settingsSaving = usePiSettingsStore((state) => state.saving);
  const settingsError = usePiSettingsStore((state) => state.error);
  const initializeSettings = usePiSettingsStore((state) => state.initialize);
  const updateSettings = usePiSettingsStore((state) => state.update);
  const clearDetailSelection = useUiStore((state) => state.clearDetailSelection);
  const [restarting, setRestarting] = useState(false);
  const [shellPath, setShellPath] = useState("");

  useEffect(() => {
    void initializeSettings();
  }, [initializeSettings]);

  useEffect(() => {
    setShellPath(hostSettings?.global.shellPath ?? "");
  }, [hostSettings?.global.shellPath]);

  const configuredTools = hostSettings?.global.defaultTools ?? ["read", "bash", "edit", "write"];

  const statusLabel = {
    starting: "正在连接",
    running: busy ? "Agent 执行中" : "Agent 已就绪",
    stopped: "Agent 已停止",
    error: "连接失败",
  }[status.state];

  async function restart(): Promise<void> {
    setRestarting(true);
    setError(null);
    try {
      const nextStatus = await agentGateway.restart();
      resetSession();
      clearDetailSelection();
      setStatus(nextStatus);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRestarting(false);
    }
  }

  return (
    <>
      <SettingsGroup title="Pi Agent 运行时" description="查看本地 RPC 状态，或在异常时重新启动 Agent。">
        <SettingsRow title={statusLabel} description={status.cwd || "尚未选择工作目录"}>
          <button className="settings-action-button" type="button" disabled={restarting} onClick={() => void restart()}>
            {restarting ? <LoaderCircle className="spin" size={14} /> : <RotateCw size={14} />}
            {restarting ? "正在重启" : "重启 Pi Agent"}
          </button>
        </SettingsRow>
        {busy && <p className="settings-runtime-warning">当前任务正在执行；重启会中止本次任务。</p>}
      </SettingsGroup>

      <SettingsGroup title="Shell 与内置工具" description="这些是 Pi 的全局启动设置，修改后重启 Pi Agent 生效。">
        <SettingsRow title="Bash 路径" description="留空时由 Pi 自动探测 Git Bash、MSYS2 或 Cygwin。">
          <div className="settings-inline-control">
            <input
              className="settings-text-input"
              value={shellPath}
              disabled={settingsLoading || settingsSaving}
              placeholder="自动探测"
              onChange={(event) => setShellPath(event.target.value)}
            />
            <button className="settings-action-button" type="button" disabled={settingsLoading || settingsSaving} onClick={() => void updateSettings({ shellPath })}>保存</button>
          </div>
        </SettingsRow>
        <div className="settings-check-grid" aria-label="新会话默认启用工具">
          {builtinTools.map(([name, label]) => (
            <label key={name}>
              <input
                type="checkbox"
                checked={configuredTools.includes(name)}
                disabled={settingsLoading || settingsSaving}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...configuredTools, name]
                    : configuredTools.filter((tool) => tool !== name);
                  void updateSettings({ defaultTools: next });
                }}
              />
              <span><strong>{label}</strong><small>{name}</small></span>
            </label>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title="当前会话">
        <div className="settings-facts">
          <span><small>会话</small><strong>{session?.name || session?.id.slice(0, 12) || "未连接"}</strong></span>
          <span><small>模式</small><strong>{session?.mode === "chat" ? "纯聊天" : "工作"}</strong></span>
          <span><small>上下文</small><strong>{session?.model?.contextWindow ? `${Math.round(session.model.contextWindow / 1000)}K` : "-"}</strong></span>
          <span><small>Reasoning</small><strong>{session?.model?.reasoning ? "支持" : "关闭"}</strong></span>
        </div>
      </SettingsGroup>

      <SettingsGroup title="资源与诊断" description="重新扫描项目和用户目录中的扩展、Skill、Prompt、主题与记忆文件。">
        <div className="settings-facts">
          <span><small>Active Tools</small><strong>{tools.filter((tool) => tool.active).length}</strong></span>
          <span><small>MCP Extensions</small><strong>{mcpServers.length}</strong></span>
          <span><small>Memory Sources</small><strong>{memories.length}</strong></span>
          <span><small>Skills</small><strong>{commandResources.filter((resource) => resource.kind === "skill").length}</strong></span>
          <span><small>Prompts</small><strong>{commandResources.filter((resource) => resource.kind === "prompt").length}</strong></span>
          <span><small>Diagnostics</small><strong>{resourceIssues.length}</strong></span>
        </div>
        <div className="settings-resource-actions">
          <button
            className="settings-action-button"
            type="button"
            disabled={busy || resourcesLoading || !status.cwd}
            onClick={async () => {
              await reloadResources(status.cwd);
              await useSessionStore.getState().initialize(status.cwd);
            }}
          >
            {resourcesLoading ? <LoaderCircle className="spin" size={14} /> : <RotateCw size={14} />}
            {resourcesLoading ? "正在重载" : "重载资源"}
          </button>
          {resourceIssues.length > 0 && <span>{resourceIssues[0]?.message}</span>}
        </div>
        <p className="settings-privacy-note">MCP 凭据由对应 Pi Extension 管理；Memory 页面只展示当前加载的上下文文件，不会复制保存其内容。</p>
      </SettingsGroup>

      {agentError && <p className="settings-error">{agentError}</p>}
      {settingsError && <p className="settings-error">{settingsError}</p>}
    </>
  );
}
