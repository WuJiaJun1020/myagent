import { FileDiff } from "lucide-react";
import { useMemo } from "react";
import type { FileChange } from "../../../shared/contracts/workspace";

const MAX_DIFF_LINES = 4_000;

function lineKind(line: string): "add" | "remove" | "hunk" | "header" | "context" {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++ ") || line.startsWith("--- ")) return "header";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "remove";
  return "context";
}

const changeLabels = { created: "新建", modified: "修改", deleted: "删除", renamed: "重命名" } as const;

export function DiffViewer({ change }: { change: FileChange }) {
  const allLines = useMemo(() => change.unifiedDiff.replaceAll("\r\n", "\n").split("\n"), [change.unifiedDiff]);
  const visibleLines = allLines.slice(0, MAX_DIFF_LINES);
  return (
    <section className="diff-viewer">
      <header>
        <span><FileDiff size={14} />代码变更</span>
        <small>{changeLabels[change.changeType]}</small>
      </header>
      <div className="diff-path">{change.path}</div>
      {(change.truncated || allLines.length > visibleLines.length) && <div className="viewer-notice">Diff 过长，已截断显示。</div>}
      {change.unifiedDiff ? (
        <div className="diff-lines">
          {visibleLines.map((line, index) => <div className={`diff-line ${lineKind(line)}`} key={index}><code>{line || " "}</code></div>)}
        </div>
      ) : <p className="detail-empty">文件发生了变化，但没有可展示的文本 Diff。</p>}
    </section>
  );
}
