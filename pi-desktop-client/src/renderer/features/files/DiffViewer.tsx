import { FileDiff } from "lucide-react";
import type { FileChange } from "../../../shared/contracts/workspace";
import { UnifiedDiffView } from "./UnifiedDiffView";

const changeLabels = { created: "新建", modified: "修改", deleted: "删除", renamed: "重命名" } as const;

export function DiffViewer({ change }: { change: FileChange }) {
  return (
    <section className="diff-viewer">
      <header>
        <span><FileDiff size={14} />代码变更</span>
        <small>{changeLabels[change.changeType]}</small>
      </header>
      <div className="diff-path">{change.path}</div>
      <UnifiedDiffView
        diff={change.unifiedDiff}
        path={change.path}
        truncated={change.truncated}
        emptyLabel="文件发生了变化，但没有可展示的文本 Diff。"
      />
    </section>
  );
}
