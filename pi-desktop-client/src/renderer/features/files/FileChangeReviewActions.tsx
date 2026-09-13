import { Check, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { FileChange } from "../../../shared/contracts/workspace";
import { workspaceGateway } from "../../services/workspace-gateway";
import { useWorkspaceStore } from "../../stores/workspace-store";

export function FileChangeReviewActions({ change }: { change: FileChange }) {
  const refreshFile = useWorkspaceStore((state) => state.refreshFile);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = change.truncated || busy;

  async function revert(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await workspaceGateway.revertAgentChange(change);
      await refreshFile(change.path);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="file-change-actions" aria-label="Agent 变更审查">
      <strong>Agent 文件变更</strong>
      <p>{change.truncated ? "内容已截断，只能人工审查，不能安全撤销。" : "保留会维持当前磁盘内容；撤销前会检测是否被后续修改。"}</p>
      <div>
        <button type="button" disabled={busy} onClick={() => setAccepted(true)}><Check size={13} />{accepted ? "已确认保留" : "确认保留"}</button>
        <button type="button" className="danger" disabled={disabled} onClick={() => void revert()}><RotateCcw size={13} />{busy ? "撤销中" : "撤销本次变更"}</button>
      </div>
      {error && <span className="file-change-action-error">{error}</span>}
    </section>
  );
}
