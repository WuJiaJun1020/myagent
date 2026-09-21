import { AlertTriangle, ChevronDown, ChevronRight, FileDiff, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import type { FileChange } from "../../../shared/contracts/workspace";
import { workspaceGateway } from "../../services/workspace-gateway";
import { useUiStore } from "../../stores/ui-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { countUnifiedDiffChanges } from "./UnifiedDiffView";

const INITIAL_VISIBLE_FILES = 3;

export type AgentChangedFileSummary = {
  path: string;
  additions: number;
  deletions: number;
};

export function summarizeAgentFileChanges(changes: FileChange[]): {
  files: AgentChangedFileSummary[];
  additions: number;
  deletions: number;
} {
  const summaries = new Map<string, AgentChangedFileSummary>();
  let additions = 0;
  let deletions = 0;

  for (const change of changes) {
    const counts = countUnifiedDiffChanges(change.unifiedDiff);
    const current = summaries.get(change.path) ?? { path: change.path, additions: 0, deletions: 0 };
    current.additions += counts.additions;
    current.deletions += counts.deletions;
    summaries.set(change.path, current);
    additions += counts.additions;
    deletions += counts.deletions;
  }

  return { files: [...summaries.values()], additions, deletions };
}

export function agentChangesInRevertOrder(changes: FileChange[]): FileChange[] {
  return changes
    .map((change, index) => ({ change, index }))
    .sort((left, right) => right.change.timestamp - left.change.timestamp || right.index - left.index)
    .map(({ change }) => change);
}

export function AgentChangeReview({ changes }: { changes: FileChange[] }) {
  const summary = useMemo(() => summarizeAgentFileChanges(changes), [changes]);
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [undone, setUndone] = useState(false);
  const [confirmingRevert, setConfirmingRevert] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAgentView = useUiStore((state) => state.setAgentView);
  const containsTruncatedChange = changes.some((change) => change.truncated);
  const visibleFiles = showAll ? summary.files : summary.files.slice(0, INITIAL_VISIBLE_FILES);
  const hiddenFileCount = summary.files.length - visibleFiles.length;
  const createdFileCount = new Set(
    changes.filter((change) => change.changeType === "created").map((change) => change.path),
  ).size;

  async function refreshAffectedFiles(): Promise<void> {
    const oldestChangeByPath = new Map<string, FileChange>();
    for (const change of changes) {
      const current = oldestChangeByPath.get(change.path);
      if (!current || change.timestamp < current.timestamp) oldestChangeByPath.set(change.path, change);
    }

    for (const [path, oldestChange] of oldestChangeByPath) {
      const workspace = useWorkspaceStore.getState();
      if (oldestChange.beforeContent === undefined && workspace.activeFilePath === path) {
        workspace.closeActiveFile();
      }
      await useWorkspaceStore.getState().refreshFile(path);
    }
  }

  async function revertAll(): Promise<void> {
    setConfirmingRevert(false);
    setBusy(true);
    setError(null);
    let revertedCount = 0;
    try {
      for (const change of agentChangesInRevertOrder(changes)) {
        await workspaceGateway.revertAgentChange(change);
        revertedCount += 1;
      }
      setUndone(true);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setError(revertedCount > 0
        ? `${detail} 已撤销 ${revertedCount} 项较新的变更，请在代码审查中确认其余内容。`
        : detail);
    } finally {
      try {
        await refreshAffectedFiles();
      } catch {
        // The review itself remains usable even if an open editor cannot be refreshed.
      }
      setBusy(false);
    }
  }

  if (summary.files.length === 0) return null;

  return (
    <section
      className={`agent-change-review ${expanded ? "expanded" : "collapsed"}`}
      aria-label="本轮文件变更"
      onKeyDown={(event) => {
        if (event.key === "Escape" && confirmingRevert) setConfirmingRevert(false);
      }}
    >
      <header>
        <button
          className="agent-change-review-summary"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="agent-change-review-icon"><FileDiff size={17} /></span>
          <span>
            <strong>{summary.files.length === 1 ? "已编辑 1 个文件" : `已编辑 ${summary.files.length} 个文件`}</strong>
            <small>本轮工作区变化 · <i>+{summary.additions}</i> <b>-{summary.deletions}</b></small>
          </span>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <div className="agent-change-review-actions">
          {confirmingRevert ? (
            <>
              <button type="button" autoFocus onClick={() => setConfirmingRevert(false)}>取消</button>
              <button className="danger" type="button" onClick={() => void revertAll()}>
                <RotateCcw size={13} />确认撤销
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy || undone || containsTruncatedChange}
              title={containsTruncatedChange ? "存在内容被截断的变更，无法安全撤销" : "需要再次确认；只撤销当前轮次的文件变更"}
              onClick={() => setConfirmingRevert(true)}
            >
              <RotateCcw size={13} />{busy ? "撤销中" : undone ? "已撤销" : "撤销"}
            </button>
          )}
          <button type="button" onClick={() => setAgentView("review")}>审查</button>
        </div>
      </header>
      {confirmingRevert && (
        <div className="agent-change-review-confirm" role="alertdialog" aria-label="确认撤销本轮文件变更">
          <AlertTriangle size={15} />
          <span>
            <strong>确认撤销本轮修改？</strong>
            <small>
              将把 {summary.files.length} 个文件恢复到本轮开始前
              {createdFileCount > 0 ? `，并删除 ${createdFileCount} 个本轮新建文件` : ""}。此操作没有重做入口。
            </small>
          </span>
        </div>
      )}
      {expanded && (
        <div className="agent-change-review-files">
          {visibleFiles.map((file) => (
            <div key={file.path}>
              <span title={file.path}>{file.path}</span>
              <small><i>+{file.additions}</i> <b>-{file.deletions}</b></small>
            </div>
          ))}
          {summary.files.length > INITIAL_VISIBLE_FILES && (
            <button type="button" onClick={() => setShowAll((value) => !value)}>
              {showAll ? "收起文件" : `再显示 ${hiddenFileCount} 个文件`}
              <ChevronDown className={showAll ? "open" : ""} size={14} />
            </button>
          )}
        </div>
      )}
      {containsTruncatedChange && <p className="agent-change-review-notice">部分变更内容已截断，请在代码审查中人工处理。</p>}
      {error && <p className="agent-change-review-error">{error}</p>}
    </section>
  );
}
