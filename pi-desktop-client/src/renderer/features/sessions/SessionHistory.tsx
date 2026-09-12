import {
  Check,
  BriefcaseBusiness,
  Clock3,
  FolderOpen,
  LoaderCircle,
  MessageCircle,
  MessageSquarePlus,
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

type WorkspacePopover = {
  title: string;
  workspace: string;
  top: number;
  left: number;
};

export function SessionHistory() {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [workspacePopover, setWorkspacePopover] = useState<WorkspacePopover | null>(null);
  const sessions = useSessionStore((state) => state.sessions);
  const currentMode = useSessionStore((state) => state.session?.mode ?? "work");
  const mutation = useSessionStore((state) => state.mutation);
  const error = useSessionStore((state) => state.error);
  const createSession = useSessionStore((state) => state.createSession);
  const switchSession = useSessionStore((state) => state.switchSession);
  const renameSession = useSessionStore((state) => state.renameSession);
  const deleteSession = useSessionStore((state) => state.deleteSession);
  const clearError = useSessionStore((state) => state.clearError);
  const busy = useAgentStore((state) => state.busy);
  const controlsDisabled = busy || Boolean(mutation);
  const sessionChanging = mutation === "session" || mutation === "initializing";
  const recentChats = sessions.filter((session) => session.mode === "chat");
  const recentWork = sessions.filter((session) => session.mode === "work");

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
      workspace: session.workspace.name,
      top: rect.top + rect.height / 2,
      left: rect.right + 8,
    });
  }

  function renderSession(session: SessionListItem) {
    const title = session.name || session.firstMessage || "未命名会话";
    const unavailable = session.scope === "workspace" && !session.workspace?.available;
    return (
      <div
        className={`session-row ${session.current ? "active" : ""}`}
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
              className="session-item"
              type="button"
              disabled={controlsDisabled || unavailable}
              aria-label={unavailable ? `${title}，原工作目录不可用` : title}
              onClick={() => void switchSession(session.id)}
            >
              <Clock3 size={14} />
              <span>
                <strong>{title}</strong>
              </span>
              {session.current && <i aria-label="当前会话" />}
            </button>
            <div className="session-actions">
              <button type="button" aria-label={`重命名 ${title}`} title="重命名" disabled={controlsDisabled} onClick={() => startRename(session.id, session.name || title)}><Pencil size={12} /></button>
              <button type="button" aria-label={`删除 ${title}`} title="移至回收站" disabled={controlsDisabled} onClick={() => { setRenamingId(null); setDeletingId(session.id); }}><Trash2 size={12} /></button>
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

  function renderGroup(title: string, icon: "chat" | "work", entries: SessionListItem[]) {
    return (
      <section className="session-group" aria-label={title}>
        <header className="session-group-header">
          {icon === "chat" ? <MessageCircle size={12} /> : <BriefcaseBusiness size={12} />}
          <span>{title}</span>
          <small>{entries.length}</small>
        </header>
        {entries.length > 0 ? entries.map(renderSession) : <div className="session-group-empty">暂无会话</div>}
      </section>
    );
  }

  return (
    <section className="sidebar-sessions session-history">
      <header>
        <span className="section-label">最近会话</span>
        <TooltipIconButton
          className="session-new-button"
          label={`新建${currentMode === "chat" ? "聊天" : "工作"}会话`}
          disabled={controlsDisabled}
          onClick={() => void createSession(currentMode)}
        >
          <MessageSquarePlus size={14} />
        </TooltipIconButton>
      </header>
      {error && (
        <div className="session-error" role="alert">
          <span>{error}</span><button type="button" aria-label="关闭错误" onClick={clearError}><X size={12} /></button>
        </div>
      )}
      <div className="session-list">
        {sessionChanging && sessions.length === 0 ? (
          <div className="session-loading"><LoaderCircle className="spin" size={13} />正在加载会话…</div>
        ) : sessions.length === 0 ? (
          <div className="session-loading">还没有最近会话</div>
        ) : (
          <>
            {renderGroup("最近聊天", "chat", recentChats)}
            {renderGroup("最近工作", "work", recentWork)}
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
