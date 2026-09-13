import { GitBranch, GitCommitHorizontal, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { WorkspaceGitDiff, WorkspaceGitStatus } from "../../../shared/contracts/workspace";
import { workspaceGateway } from "../../services/workspace-gateway";
import { useWorkspaceStore } from "../../stores/workspace-store";

function statusLabel(indexStatus: string, workTreeStatus: string): string {
  if (indexStatus === "?" || workTreeStatus === "?") return "未跟踪";
  if (indexStatus === "A" || workTreeStatus === "A") return "新增";
  if (indexStatus === "D" || workTreeStatus === "D") return "删除";
  if (indexStatus === "R" || workTreeStatus === "R") return "重命名";
  return indexStatus !== " " ? "已暂存" : "已修改";
}

export function GitReview() {
  const cwd = useWorkspaceStore((state) => state.cwd);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const [status, setStatus] = useState<WorkspaceGitStatus | null>(null);
  const [diff, setDiff] = useState<WorkspaceGitDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    setDiff(null);
    try {
      setStatus(await workspaceGateway.getGitStatus());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (cwd) void refresh(); }, [cwd]);

  const title = useMemo(() => {
    if (!status?.available) return "Git 未就绪";
    const sync = [status.ahead ? `↑${status.ahead}` : "", status.behind ? `↓${status.behind}` : ""].filter(Boolean).join(" ");
    return [status.branch, sync].filter(Boolean).join(" ");
  }, [status]);

  async function inspect(path: string, staged: boolean): Promise<void> {
    try {
      setError(null);
      setDiff(await workspaceGateway.getGitDiff(path, staged));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return (
    <section className="git-review" aria-label="Git 审查">
      <header>
        <div><GitBranch size={17} /><div><strong>Git 审查</strong><small>{title || "读取工作区状态"}</small></div></div>
        <button type="button" title="刷新 Git 状态" onClick={() => void refresh()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={14} /></button>
      </header>
      {error && <p className="git-review-error">{error}</p>}
      {!loading && status && !status.available && <p className="workspace-editor-empty">{status.error ?? "当前工作区不是 Git 仓库。"}</p>}
      {!loading && status?.available && status.files.length === 0 && <p className="workspace-editor-empty">工作区干净，没有待审查的 Git 变更。</p>}
      {status?.available && status.files.length > 0 && (
        <div className="git-file-list">
          {status.files.map((file) => (
            <article key={`${file.path}-${file.indexStatus}-${file.workTreeStatus}`}>
              <button type="button" onClick={() => void openFile(file.path)}><GitCommitHorizontal size={14} /><span>{file.path}</span><small>{statusLabel(file.indexStatus, file.workTreeStatus)}</small></button>
              <div>
                {file.workTreeStatus !== " " && file.workTreeStatus !== "?" && <button type="button" onClick={() => void inspect(file.path, false)}>工作区 Diff</button>}
                {file.indexStatus !== " " && file.indexStatus !== "?" && <button type="button" onClick={() => void inspect(file.path, true)}>暂存 Diff</button>}
              </div>
            </article>
          ))}
        </div>
      )}
      {diff && <pre className="git-diff-output">{diff.diff || "该文件没有可展示的文本 Diff。"}</pre>}
    </section>
  );
}
