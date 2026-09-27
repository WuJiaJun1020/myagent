import { useRef } from "react";
import { HintButton } from "../../components/ui/tooltip";
import {
  Blocks,
  Plus,
  MessageSquareText,
  Database,
  FolderOpen,
  Settings,
} from "lucide-react";
import { FileTree } from "../../features/files/FileTree";
import { ResourceSidebarSummary } from "../../features/resources/ResourceSidebarSummary";
import { SessionHistory } from "../../features/sessions/SessionHistory";
import { agentGateway } from "../../services/agent-gateway";
import { useAgentStore } from "../../stores/agent-store";
import { useSessionStore } from "../../stores/session-store";
import { useUiStore } from "../../stores/ui-store";

function getWorkspaceName(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? "未选择工作区";
}

export function AgentSidebar() {
  const newSessionMenu = useRef<HTMLDivElement>(null);
  const status = useAgentStore((state) => state.processStatus);
  const busy = useAgentStore((state) => state.busy);
  const setStatus = useAgentStore((state) => state.setProcessStatus);
  const setError = useAgentStore((state) => state.setError);
  const resetSession = useAgentStore((state) => state.resetSession);
  const agentView = useUiStore((state) => state.moduleViews.agent);
  const setAgentView = useUiStore((state) => state.setAgentView);
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
    <>
      <div className="sidebar-conversation-row">
        <button className={`nav-item ${agentView === "activity" ? "active" : ""}`}
          type="button" aria-current={agentView === "activity" ? "page" : undefined}
          onClick={() => setAgentView("activity")}>
          <MessageSquareText size={16} /><span>会话</span>
        </button>
        <HintButton className="icon-button" type="button" hint="新建会话" aria-label="新建会话"
          disabled={controlsDisabled} onClick={(event) => {
            const menu = newSessionMenu.current;
            if (!menu) return;
            const rect = event.currentTarget.getBoundingClientRect();
            menu.style.left = `${Math.max(8, rect.right - 160)}px`;
            menu.style.top = `${rect.bottom + 6}px`;
            menu.togglePopover();
          }}>
          <Plus size={16} />
        </HintButton>
        <div ref={newSessionMenu} popover="auto" className="sidebar-create-menu" aria-label="新建会话类型">
          {(["chat", "work"] as const).map((mode) => <button key={mode} type="button" disabled={controlsDisabled}
            onClick={() => {
              newSessionMenu.current?.hidePopover();
              setAgentView("activity");
              void createSession(mode);
            }}>新建{mode === "chat" ? "聊天" : "工作"}会话</button>)}
        </div>
      </div>

      <section className="sidebar-projects agent-projects" aria-label="项目">
        <span className="section-label">当前工作区</span>
        <HintButton className="workspace-button" type="button" hint="选择工作区" onClick={() => void selectWorkspace()}>
          <FolderOpen size={16} />
          <strong>{getWorkspaceName(status.cwd)}</strong>
        </HintButton>
      </section>

      {agentView === "files" ? <FileTree /> : agentView === "activity" || agentView === "review" ? <SessionHistory />
        : <ResourceSidebarSummary view={agentView} />}

      <nav className="sidebar-utilities" aria-label="工作区辅助功能">
        <button className={`nav-item ${agentView === "mcp" ? "active" : ""}`} type="button" onClick={() => setAgentView("mcp")}>
          <Blocks size={15} /><span>资源中心</span>
        </button>
        <button className={`nav-item ${agentView === "memory" ? "active" : ""}`} type="button" onClick={() => setAgentView("memory")}>
          <Database size={15} /><span>Pi 上下文</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <div className={`connection ${status.state}`}>
          <span className="connection-dot" />
          <span>
            <strong>{statusLabel}</strong>
            <small>{status.state === "running" ? "本地 RPC" : "Pi runtime"}</small>
          </span>
        </div>
        <HintButton className="icon-button" type="button" aria-label="打开设置" hint="设置" onClick={() => setSettingsOpen(true)}>
          <Settings size={15} />
        </HintButton>
      </div>
    </>
  );
}
