import { HintButton } from "../../components/ui/tooltip";
import {
  Check,
  ChevronRight,
  FolderPlus,
  Plus,
  FolderOpen,
  LoaderCircle,
  MessageCircle,
  PanelTopOpen,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useState, type FormEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { TooltipIconButton } from "../../components/ui/tooltip-icon-button";
import type { SessionListItem } from "../../../shared/contracts/agent-session";
import { useAgentStore } from "../../stores/agent-store";
import { useSessionStore } from "../../stores/session-store";
import { useUiStore } from "../../stores/ui-store";
import { groupSessionProjects } from "./session-projects";
import { useProjectStore } from "../../stores/project-store";

type WorkspacePopover = {
  title: string;
  workspace: string;
  top: number;
  left: number;
};

export function SessionHistory({ onSelectWorkspace, selectingProject = false }: { onSelectWorkspace: () => void; selectingProject?: boolean }) {
  const directories = useProjectStore((state) => state.directories);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const cwd = useAgentStore((state) => state.processStatus.cwd);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [workspacePopover, setWorkspacePopover] = useState<WorkspacePopover | null>(null);
  const sessions = useSessionStore((state) => state.sessions);
  const mutation = useSessionStore((state) => state.mutation);
  const pendingSessionId = useSessionStore((state) => state.pendingSessionId);
  const error = useSessionStore((state) => state.error);
  const switchSession = useSessionStore((state) => state.switchSession);
  const createSession = useSessionStore((state) => state.createSession);
  const renameSession = useSessionStore((state) => state.renameSession);
  const deleteSession = useSessionStore((state) => state.deleteSession);
  const clearError = useSessionStore((state) => state.clearError);
  const setSessionOverviewOpen = useUiStore((state) => state.setSessionOverviewOpen);
  const busy = useAgentStore((state) => state.busy);
  const controlsDisabled = busy || Boolean(mutation) || selectingProject;
  const sessionChanging = mutation === "session" || mutation === "initializing";
  const recentSessions = [...sessions].sort((a, b) => b.modifiedAt - a.modifiedAt);
  const projects = groupSessionProjects(sessions, cwd, directories);
  const chats = recentSessions.filter((session) => session.mode === "chat");
  const setAgentView = useUiStore((state) => state.setAgentView);

  function startRename(sessionId: string, currentName: string): void {
    setDeletingId(null);
    setRenamingId(sessionId);
    setRenameValue(currentName.slice(0, 120));
  }

  function submitRename(event: FormEvent): void {
    event.preventDefault();
    const name = renameValue.replace(/[\r\n]+/g, " ").trim();
    if (!renamingId || !name) return;
    const sessionId = renamingId;
    setRenamingId(null);
    void renameSession(sessionId, name);
  }

  function confirmDelete(sessionId: string): void {
    setDeletingId(null);
    if (renamingId === sessionId) setRenamingId(null);
    void deleteSession(sessionId);
  }

  function showWorkspacePopover(event: MouseEvent<HTMLDivElement>, session: SessionListItem, title: string): void {
    if (session.mode !== "work" || !session.workspace?.available) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setWorkspacePopover({
      title,
      workspace: session.workspace.cwd || session.workspace.name,
      top: rect.top + rect.height / 2,
      left: rect.right + 8,
    });
  }

  function renderSession(session: SessionListItem) {
    const title = session.name || session.firstMessage || "未命名会话";
    const unavailable = session.scope === "workspace" && !session.workspace?.available;
    const selected = pendingSessionId ? session.id === pendingSessionId : session.current;
    return (
      <div
        className={`session-row ${selected ? "active" : ""}`}
        key={session.id}
        onMouseEnter={(event) => showWorkspacePopover(event, session, title)}
        onMouseLeave={() => setWorkspacePopover(null)}
      >
        {renamingId === session.id ? (
          <form className="session-inline-editor" onSubmit={submitRename}>
            <input
              aria-label="会话名称"
              autoFocus
              maxLength={120}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape") setRenamingId(null); }}
            />
            <button type="submit" aria-label="保存名称" disabled={!renameValue.trim()}><Check size={13} /></button>
            <button type="button" aria-label="取消重命名" onClick={() => setRenamingId(null)}><X size={13} /></button>
          </form>
        ) : (
          <>
            <button
              className={`session-item ${unavailable ? "unavailable" : ""}`}
              type="button"
              disabled={controlsDisabled || unavailable}
              aria-label={unavailable ? `${title}，原工作目录不可用` : title}
              onClick={() => { setAgentView("activity"); void switchSession(session.id); }}
            >
              {session.mode === "chat" && <MessageCircle size={14} />}
              <span>
                <strong>{title}</strong>
              </span>
              {selected && <i aria-label={pendingSessionId ? "正在切换到此会话" : "当前会话"} />}
            </button>
            <div className="session-actions">
              <HintButton type="button" aria-label={`重命名 ${title}`} hint="重命名" disabled={controlsDisabled} onClick={() => startRename(session.id, session.name || title)}><Pencil size={12} /></HintButton>
              <HintButton type="button" aria-label={`删除 ${title}`} hint="移至回收站" disabled={controlsDisabled} onClick={() => { setRenamingId(null); setDeletingId(session.id); }}><Trash2 size={12} /></HintButton>
            </div>
          </>
        )}
        {deletingId === session.id && (
          <div className="session-delete-confirm" role="alertdialog" aria-label={`确认删除 ${title}`}>
            <span>{session.current ? "删除后将自动创建新会话" : "将此会话移至系统回收站"}</span>
            <button type="button" className="danger" onClick={() => confirmDelete(session.id)}>删除</button>
            <button type="button" onClick={() => setDeletingId(null)}>取消</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="sidebar-sessions session-history">
      <header>
        <span className="section-label">项目</span>
        <span className="session-header-actions">
          <TooltipIconButton className="session-overview-button" label="创建项目" disabled={controlsDisabled} onClick={() => onSelectWorkspace()}>
            <FolderPlus size={14} />
          </TooltipIconButton>
          <TooltipIconButton className="session-overview-button" label="打开当前会话概览" disabled={controlsDisabled} onClick={() => setSessionOverviewOpen(true)}>
            <PanelTopOpen size={14} />
          </TooltipIconButton>
        </span>
      </header>
      {error && (
        <div className="session-error" role="alert">
          <span>{error}</span><button type="button" aria-label="关闭错误" onClick={clearError}><X size={12} /></button>
        </div>
      )}
      <div className="session-list" onScroll={() => setWorkspacePopover(null)}>
        {sessionChanging && sessions.length === 0 ? (
          <div className="session-loading"><LoaderCircle className="spin" size={13} />正在加载会话…</div>
        ) : (
          <>
            {projects.map((project) => <section className="session-project" key={project.key} aria-label={`项目 ${project.name}`}>
              <div className="session-project-row">
              <HintButton className={`session-project-heading ${project.current ? "current" : ""}`}
                hint={project.cwd || "原工作目录不可用"} aria-label={`项目 ${project.name}`}
                aria-expanded={!collapsed.has(project.key)} onClick={() => {
                  setWorkspacePopover(null);
                  setCollapsed((previous) => { const next = new Set(previous); next.delete(project.key); return next; });
                }}>
                <FolderOpen size={15} /><strong>{project.name}</strong>
                {project.current && <i aria-label="当前工作区" />}
              </HintButton>
              <HintButton className="session-project-create" hint={`在 ${project.name} 中新建工作会话`}
                aria-label={`在 ${project.name} 中新建工作会话`} disabled={controlsDisabled || !project.cwd}
                onClick={() => {
                  setAgentView("activity");
                  setCollapsed((previous) => { const next = new Set(previous); next.delete(project.key); return next; });
                  void createSession("work", project.cwd);
                }}><Plus size={13} /></HintButton>
              <HintButton className="session-project-toggle" hint={collapsed.has(project.key) ? "展开项目" : "收起项目"}
                aria-label={`${collapsed.has(project.key) ? "展开" : "收起"}项目 ${project.name}`} aria-expanded={!collapsed.has(project.key)} onClick={() => {
                  setCollapsed((previous) => {
                    const next = new Set(previous);
                    if (next.has(project.key)) next.delete(project.key); else next.add(project.key);
                    return next;
                  });
                }}>
                <ChevronRight size={12} className="project-chevron" />
              </HintButton>
              </div>
              {!collapsed.has(project.key) && <div className="session-project-children">
                {project.sessions.length ? project.sessions.map(renderSession) : <div className="session-group-empty">暂无工作会话</div>}
              </div>}
            </section>)}
            {!projects.length && <div className="session-group-empty">打开工作区以开始</div>}
            <section className="session-group project-chat-group" aria-label="最近聊天">
              <header className="session-group-header"><span>最近聊天</span><small>{chats.length}</small></header>
              {chats.length ? chats.map(renderSession) : <div className="session-group-empty">暂无聊天</div>}
            </section>
          </>
        )}
      </div>
      {workspacePopover && createPortal(
        <div className="session-workspace-popover" role="tooltip" style={{ top: workspacePopover.top, left: workspacePopover.left }}>
          <strong>{workspacePopover.title}</strong>
          <span><FolderOpen size={14} />工作目录 · {workspacePopover.workspace}</span>
        </div>,
        document.body,
      )}
    </section>
  );
}
