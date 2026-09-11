import {
  BriefcaseBusiness,
  Check,
  Clock3,
  LoaderCircle,
  MessageCircle,
  MessageSquarePlus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { TooltipIconButton } from "../../components/ui/tooltip-icon-button";
import { useAgentStore } from "../../stores/agent-store";
import { useSessionStore } from "../../stores/session-store";

function formatSessionTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export function SessionHistory() {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  return (
    <section className="sidebar-sessions session-history">
      <header>
        <span className="section-label">Sessions</span>
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
          <div className="session-loading">当前工作区还没有历史会话</div>
        ) : sessions.map((session) => {
          const title = session.name || session.firstMessage || "未命名会话";
          const ModeIcon = session.mode === "chat" ? MessageCircle : BriefcaseBusiness;
          return (
            <div className={`session-row ${session.current ? "active" : ""}`} key={session.id}>
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
                    disabled={controlsDisabled}
                    title={title}
                    onClick={() => void switchSession(session.id)}
                  >
                    <Clock3 size={14} />
                    <span>
                      <strong>{title}</strong>
                      <small><ModeIcon size={10} />{session.mode === "chat" ? "聊天" : "工作"} · {formatSessionTime(session.modifiedAt)} · {session.messageCount} 条</small>
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
        })}
      </div>
    </section>
  );
}
