import {
  ChevronDown,
  Database,
  Files,
  FolderOpen,
  MessageSquareText,
  PlugZap,
  RotateCw,
  Search,
} from "lucide-react";
import { agentGateway } from "../../services/agent-gateway";
import { useAgentStore } from "../../stores/agent-store";
import { useUiStore } from "../../stores/ui-store";
import { FileTree } from "../../features/files/FileTree";
import { SessionHistory } from "../../features/sessions/SessionHistory";
import { ResourceSidebarSummary } from "../../features/resources/ResourceSidebarSummary";

const futureItems = [
  { label: "全局搜索", icon: Search, phase: "后续" },
];

function getWorkspaceName(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? "未选择工作区";
}

export function Sidebar() {
  const status = useAgentStore((state) => state.processStatus);
  const busy = useAgentStore((state) => state.busy);
  const setStatus = useAgentStore((state) => state.setProcessStatus);
  const setError = useAgentStore((state) => state.setError);
  const resetSession = useAgentStore((state) => state.resetSession);
  const sidebarView = useUiStore((state) => state.sidebarView);
  const setSidebarView = useUiStore((state) => state.setSidebarView);
  const clearDetailSelection = useUiStore((state) => state.clearDetailSelection);

  async function selectWorkspace(): Promise<void> {
    try {
      const nextStatus = await agentGateway.selectWorkspace();
      if (nextStatus.cwd && nextStatus.cwd !== status.cwd) {
        resetSession();
        clearDetailSelection();
      }
      setStatus(nextStatus);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function restart(): Promise<void> {
    try {
      const nextStatus = await agentGateway.restart();
      resetSession();
      clearDetailSelection();
      setStatus(nextStatus);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const statusLabel = {
    starting: "正在连接",
    running: busy ? "Agent 执行中" : "Agent 已就绪",
    stopped: "Agent 已停止",
    error: "连接失败",
  }[status.state];

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-copy"><strong>Pi Workspace</strong></span>
        <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
      </div>

      <nav className="sidebar-nav" aria-label="工作区导航">
        <button className={`nav-item ${sidebarView === "activity" ? "active" : ""}`} type="button" onClick={() => setSidebarView("activity")}>
          <MessageSquareText size={16} />
          <span>Agent 活动</span>
          {busy && <span className="nav-running-dot" aria-label="执行中" />}
        </button>
        <button className={`nav-item ${sidebarView === "files" ? "active" : ""}`} type="button" onClick={() => setSidebarView("files")}>
          <Files size={16} />
          <span>项目文件</span>
        </button>
        <button className={`nav-item ${sidebarView === "mcp" ? "active" : ""}`} type="button" onClick={() => setSidebarView("mcp")}>
          <PlugZap size={16} />
          <span>MCP 工具</span>
        </button>
        <button className={`nav-item ${sidebarView === "memory" ? "active" : ""}`} type="button" onClick={() => setSidebarView("memory")}>
          <Database size={16} />
          <span>Memory</span>
        </button>
        {futureItems.map(({ label, icon: Icon, phase }) => (
          <button className="nav-item future" type="button" key={label} disabled title={`${phase} 接入`}>
            <Icon size={16} />
            <span>{label}</span>
            <small>{phase}</small>
          </button>
        ))}
      </nav>

      <section className="sidebar-projects" aria-label="项目">
        <span className="section-label">项目</span>
        <button className="workspace-button" type="button" title="选择工作区" onClick={() => void selectWorkspace()}>
          <FolderOpen size={16} />
          <strong>{getWorkspaceName(status.cwd)}</strong>
        </button>
      </section>

      {sidebarView === "files" ? <FileTree /> : sidebarView === "activity" ? <SessionHistory /> : <ResourceSidebarSummary view={sidebarView} />}

      <div className="sidebar-footer">
        <div className={`connection ${status.state}`}>
          <span className="connection-dot" />
          <span><strong>{statusLabel}</strong><small>{status.state === "running" ? "本地 RPC" : "Pi runtime"}</small></span>
        </div>
        <button className="icon-button" type="button" title="重启 Pi Agent" onClick={() => void restart()}>
          <RotateCw size={15} />
        </button>
      </div>
    </aside>
  );
}
