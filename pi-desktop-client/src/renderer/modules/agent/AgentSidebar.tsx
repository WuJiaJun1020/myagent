import { DesktopPetControl } from "../../features/desktop-pet/DesktopPetControl";
import { useEffect, useRef, useState } from "react";
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
import { useProjectStore } from "../../stores/project-store";

function getWorkspaceName(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? "未选择工作区";
}

export function AgentSidebar() {
  const selectingRef = useRef(false);
  const [selecting, setSelecting] = useState(false);
  const rememberProject = useProjectStore((state) => state.remember);
  const sessions = useSessionStore((state) => state.sessions);
  const newSessionMenu = useRef<HTMLDivElement>(null);
  const status = useAgentStore((state) => state.processStatus);
  const busy = useAgentStore((state) => state.busy);
  const setError = useAgentStore((state) => state.setError);
  const agentView = useUiStore((state) => state.moduleViews.agent);
  const setAgentView = useUiStore((state) => state.setAgentView);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const session = useSessionStore((state) => state.session);
  const mutation = useSessionStore((state) => state.mutation);
  const createSession = useSessionStore((state) => state.createSession);
  const controlsDisabled = busy || Boolean(mutation) || !session || selecting;
  useEffect(() => {
    rememberProject(status.cwd);
    for (const entry of sessions) if (entry.mode === "work" && entry.workspace?.cwd) rememberProject(entry.workspace.cwd);
  }, [status.cwd, sessions, rememberProject]);

  async function selectWorkspace(): Promise<void> {
    if (busy || mutation || selectingRef.current) return;
    selectingRef.current = true;
    setSelecting(true);
    try {
      const directory = await agentGateway.selectWorkspace();
      if (directory) rememberProject(directory);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      selectingRef.current = false;
      setSelecting(false);
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

      {agentView !== "activity" && agentView !== "review" && <section className="sidebar-projects agent-projects" aria-label="项目">
        <span className="section-label">当前工作区</span>
        <HintButton className="workspace-button" type="button" hint="创建项目" disabled={controlsDisabled} onClick={() => void selectWorkspace()}>
          <FolderOpen size={16} />
          <strong>{getWorkspaceName(status.cwd)}</strong>
        </HintButton>
      </section>}

      {agentView === "files" ? <FileTree /> : agentView === "activity" || agentView === "review" ? <SessionHistory selectingProject={selecting} onSelectWorkspace={() => void selectWorkspace()} />
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
          </span>
        </div>
        <div className="sidebar-footer-actions"><DesktopPetControl /><HintButton className="icon-button" type="button" aria-label="打开设置" hint="设置" onClick={() => setSettingsOpen(true)}>
          <Settings size={15} />
        </HintButton></div>
      </div>
    </>
  );
}
