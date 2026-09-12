import { Activity, BrainCircuit, BriefcaseBusiness, LoaderCircle, MessageCircle, Sparkles } from "lucide-react";
import type { DesktopModel, ThinkingLevel } from "../../../shared/contracts/agent-session";
import { useAgentStore } from "../../stores/agent-store";
import { useUiStore } from "../../stores/ui-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { useSessionStore } from "../../stores/session-store";

const MODEL_SEPARATOR = "␟";

function groupModels(models: DesktopModel[]): Array<[string, DesktopModel[]]> {
  const groups = new Map<string, DesktopModel[]>();
  for (const model of models) groups.set(model.provider, [...(groups.get(model.provider) ?? []), model]);
  return [...groups.entries()];
}

function getWorkspaceName(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? "未选择工作区";
}

export function TopBar() {
  const status = useAgentStore((state) => state.processStatus);
  const busy = useAgentStore((state) => state.busy);
  const queueSize = useAgentStore((state) => state.queue.steering.length + state.queue.followUp.length);
  const sidebarView = useUiStore((state) => state.sidebarView);
  const activeFilePath = useWorkspaceStore((state) => state.activeFilePath);
  const session = useSessionStore((state) => state.session);
  const models = useSessionStore((state) => state.models);
  const thinkingLevels = useSessionStore((state) => state.thinkingLevels);
  const mutation = useSessionStore((state) => state.mutation);
  const selectModel = useSessionStore((state) => state.selectModel);
  const selectThinkingLevel = useSessionStore((state) => state.selectThinkingLevel);
  const createSession = useSessionStore((state) => state.createSession);
  const controlsDisabled = busy || Boolean(mutation);
  const modelValue = session?.model ? `${session.model.provider}${MODEL_SEPARATOR}${session.model.id}` : "";
  const workspaceSection = sidebarView === "files"
    ? activeFilePath ?? "项目文件"
    : sidebarView === "mcp"
      ? "MCP 与 Tool Registry"
      : sidebarView === "memory"
        ? "Memory 与上下文"
        : session?.mode === "chat" ? "纯聊天" : "Agent 活动";

  return (
    <header className="topbar">
      <div className="topbar-primary">
        <div className="workspace-heading">
          <strong>{getWorkspaceName(status.cwd)}</strong>
          <span>/</span>
          <span title={workspaceSection}>
            {workspaceSection}
          </span>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="session-mode-switch" role="group" aria-label="会话模式">
          <button
            type="button"
            className={session?.mode === "chat" ? "active" : ""}
            disabled={controlsDisabled || !session}
            title="新建纯聊天：不使用本地工具或项目上下文"
            onClick={() => void createSession("chat")}
          >
            <MessageCircle size={13} /><span>聊天</span>
          </button>
          <button
            type="button"
            className={session?.mode !== "chat" ? "active" : ""}
            disabled={controlsDisabled || !session}
            title="新建工作会话：可读取项目、修改文件并运行工具"
            onClick={() => void createSession("work")}
          >
            <BriefcaseBusiness size={13} /><span>工作</span>
          </button>
        </div>
        <label className="topbar-select model-select" title="选择 Agent 模型">
          <Sparkles size={13} />
          <select
            aria-label="Agent 模型"
            value={modelValue}
            disabled={controlsDisabled || models.length === 0}
            onChange={(event) => {
              const [provider, modelId] = event.target.value.split(MODEL_SEPARATOR);
              if (provider && modelId) void selectModel(provider, modelId);
            }}
          >
            {!modelValue && <option value="">Pi Agent</option>}
            {groupModels(models).map(([provider, providerModels]) => (
              <optgroup key={provider} label={provider}>
                {providerModels.map((model) => <option key={`${model.provider}/${model.id}`} value={`${model.provider}${MODEL_SEPARATOR}${model.id}`}>{model.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="topbar-select thinking-select" title="选择 Thinking Level">
          <BrainCircuit size={13} />
          <select
            aria-label="Thinking Level"
            value={session?.thinkingLevel ?? "off"}
            disabled={controlsDisabled}
            onChange={(event) => void selectThinkingLevel(event.target.value as ThinkingLevel)}
          >
            {thinkingLevels.map((level) => <option value={level} key={level}>{level}</option>)}
          </select>
          {mutation && <LoaderCircle className="spin" size={11} />}
        </label>
        <div className={`run-chip ${busy ? "running" : ""}`}>
          <Activity size={13} />
          <span>{busy ? "执行中" : status.state === "running" ? "就绪" : "离线"}</span>
          {queueSize > 0 && <small>{queueSize} 排队</small>}
        </div>
      </div>
    </header>
  );
}
