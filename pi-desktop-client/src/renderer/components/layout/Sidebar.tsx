import {
  BriefcaseBusiness,
  Blocks,
  ChevronDown,
  Database,
  Files,
  FolderOpen,
  GitPullRequest,
  MessageCircle,
  MessageSquareText,
  Settings,
} from "lucide-react";
import { agentGateway } from "../../services/agent-gateway";
import { useAgentStore } from "../../stores/agent-store";
import { useUiStore } from "../../stores/ui-store";
import { useSessionStore } from "../../stores/session-store";
import { FileTree } from "../../features/files/FileTree";
import { SessionHistory } from "../../features/sessions/SessionHistory";
import { ResourceSidebarSummary } from "../../features/resources/ResourceSidebarSummary";

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
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const clearDetailSelection = useUiStore((state) => state.clearDetailSelection);
  const session = useSessionStore((state) => state.session);
  const mutation = useSessionStore((state) => state.mutation);
  const createSession = useSessionStore((state) => state.createSession);
  const controlsDisabled = busy || Boolean(mutation) || !session;

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
        <div className={`nav-session-row ${sidebarView === "activity" ? "active" : ""}`}>
          <button className="nav-item nav-session-entry" type="button" onClick={() => setSidebarView("activity")}>
            <MessageSquareText size={16} />
            <span>会话</span>
            {busy && <span className="nav-running-dot" aria-label="执行中" />}
          </button>
          <div className="sidebar-mode-switch" role="group" aria-label="会话模式">
            <button
              type="button"
              className={session?.mode === "chat" ? "active" : ""}
              disabled={controlsDisabled}
              aria-pressed={session?.mode === "chat"}
              title="新建纯聊天"
              onClick={() => {
                setSidebarView("activity");
                void createSession("chat");
              }}
            >
              <MessageCircle size={12} /><span>聊天</span>
            </button>
            <button
              type="button"
              className={session?.mode === "work" ? "active" : ""}
              disabled={controlsDisabled}
              aria-pressed={session?.mode === "work"}
              title="新建工作会话"
              onClick={() => {
                setSidebarView("activity");
                void createSession("work");
              }}
            >
              <BriefcaseBusiness size={12} /><span>工作</span>
            </button>
          </div>
        </div>
        <button className={`nav-item ${sidebarView === "files" ? "active" : ""}`} type="button" onClick={() => setSidebarView("files")}>
          <Files size={16} />
          <span>项目文件</span>
        </button>
        <button className={`nav-item ${sidebarView === "review" ? "active" : ""}`} type="button" onClick={() => setSidebarView("review")}>
          <GitPullRequest size={16} />
          <span>代码审查</span>
        </button>
        <button className={`nav-item ${sidebarView === "mcp" ? "active" : ""}`} type="button" onClick={() => setSidebarView("mcp")}>
          <Blocks size={16} />
          <span>资源中心</span>
        </button>
        <button className={`nav-item ${sidebarView === "memory" ? "active" : ""}`} type="button" onClick={() => setSidebarView("memory")}>
          <Database size={16} />
          <span>Memory</span>
        </button>
      </nav>

      <section className="sidebar-projects" aria-label="项目">
        <span className="section-label">项目</span>
        <button className="workspace-button" type="button" title="选择工作区" onClick={() => void selectWorkspace()}>
          <FolderOpen size={16} />
          <strong>{getWorkspaceName(status.cwd)}</strong>
        </button>
      </section>

      {sidebarView === "files" ? <FileTree /> : sidebarView === "activity" || sidebarView === "review"
        ? <SessionHistory />
        : <ResourceSidebarSummary view={sidebarView} />}

      <div className="sidebar-footer">
        <div className={`connection ${status.state}`}>
          <span className="connection-dot" />
          <span><strong>{statusLabel}</strong><small>{status.state === "running" ? "本地 RPC" : "Pi runtime"}</small></span>
        </div>
        <button className="icon-button" type="button" aria-label="打开设置" title="设置" onClick={() => setSettingsOpen(true)}>
          <Settings size={15} />
        </button>
      </div>
    </aside>
  );
}
