import { ChevronsUpDown, LoaderCircle } from "lucide-react";
import { useMemo } from "react";
import { highlightCode, languageForPath } from "../../lib/syntax-highlighting";

const MAX_DIFF_LINES = 4_000;

export type UnifiedDiffLine = {
  kind: "add" | "remove" | "hunk" | "header" | "context";
  text: string;
  oldLine?: number;
  newLine?: number;
  collapsedLines?: number;
};

export function parseUnifiedDiff(diff: string): UnifiedDiffLine[] {
  let oldLine: number | undefined;
  let newLine: number | undefined;
  let previousOldEnd = 1;
  let previousNewEnd = 1;
  return diff.replaceAll("\r\n", "\n").split("\n").map((text) => {
    if (text.startsWith("@@")) {
      const match = text.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      oldLine = match ? Number(match[1]) : undefined;
      newLine = match ? Number(match[3]) : undefined;
      const collapsedLines = oldLine === undefined || newLine === undefined
        ? 0
        : Math.max(0, Math.min(oldLine - previousOldEnd, newLine - previousNewEnd));
      if (match && oldLine !== undefined && newLine !== undefined) {
        previousOldEnd = oldLine + Number(match[2] ?? "1");
        previousNewEnd = newLine + Number(match[4] ?? "1");
      }
      return { kind: "hunk", text, collapsedLines };
    }
    if (text.startsWith("+++ ") || text.startsWith("--- ") || text.startsWith("diff ")
      || text.startsWith("index ") || text.startsWith("new file ") || text.startsWith("deleted file ")
      || text.startsWith("similarity index ") || text.startsWith("rename from ") || text.startsWith("rename to ")
      || text.startsWith("Binary files ")) {
      return { kind: "header", text };
    }
    if (text.startsWith("+") && oldLine !== undefined && newLine !== undefined) {
      const line = { kind: "add" as const, text, newLine };
      newLine += 1;
      return line;
    }
    if (text.startsWith("-") && oldLine !== undefined && newLine !== undefined) {
      const line = { kind: "remove" as const, text, oldLine };
      oldLine += 1;
      return line;
    }
    if (text.startsWith(" ") && oldLine !== undefined && newLine !== undefined) {
      const line = { kind: "context" as const, text, oldLine, newLine };
      oldLine += 1;
      newLine += 1;
      return line;
    }
    return { kind: "context", text };
  });
}

export function countUnifiedDiffChanges(diff: string): { additions: number; deletions: number } {
  return parseUnifiedDiff(diff).reduce((summary, line) => ({
    additions: summary.additions + (line.kind === "add" ? 1 : 0),
    deletions: summary.deletions + (line.kind === "remove" ? 1 : 0),
  }), { additions: 0, deletions: 0 });
}

function displayLineText(line: UnifiedDiffLine): string {
  if ((line.kind === "add" && line.text.startsWith("+"))
    || (line.kind === "remove" && line.text.startsWith("-"))
    || (line.kind === "context" && line.text.startsWith(" "))) {
    return line.text.slice(1) || " ";
  }
  return line.text || " ";
}

function displayLineNumber(line: UnifiedDiffLine): number | undefined {
  return line.kind === "remove" ? line.oldLine : line.newLine ?? line.oldLine;
}

function lineNumberLabel(line: UnifiedDiffLine): string | undefined {
  if (line.oldLine !== undefined && line.newLine !== undefined && line.oldLine !== line.newLine) {
    return `旧文件第 ${line.oldLine} 行，新文件第 ${line.newLine} 行`;
  }
  const number = displayLineNumber(line);
  return number === undefined ? undefined : `第 ${number} 行`;
}

type UnifiedDiffViewProps = {
  diff: string;
  path?: string;
  truncated?: boolean;
  emptyLabel?: string;
  expandingContext?: boolean;
  onExpandContext?: () => void;
};

export function UnifiedDiffView({
  diff,
  path,
  truncated = false,
  emptyLabel = "没有可展示的文本 Diff。",
  expandingContext = false,
  onExpandContext,
}: UnifiedDiffViewProps) {
  const allLines = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const language = useMemo(() => languageForPath(path), [path]);
  const reviewLines = useMemo(() => allLines.filter((line) => line.kind !== "header"), [allLines]);
  const visibleLines = useMemo(() => reviewLines.slice(0, MAX_DIFF_LINES), [reviewLines]);
  const presentedLines = useMemo(() => visibleLines.map((line) => {
    const text = displayLineText(line);
    return { line, text, highlighted: line.kind === "hunk" ? undefined : highlightCode(text, path) };
  }), [path, visibleLines]);

  if (!diff) return <p className="detail-empty">{emptyLabel}</p>;

  return (
    <>
      {(truncated || reviewLines.length > visibleLines.length) && <div className="viewer-notice">Diff 过长，已截断显示。</div>}
      <div className="diff-lines">
        {presentedLines.map(({ line, text, highlighted }, index) => line.kind === "hunk" ? (
          line.collapsedLines || onExpandContext ? (
            <button
              className="diff-context-separator"
              type="button"
              key={`${index}:${line.text}`}
              title={onExpandContext ? `展开更多上下文（${line.text}）` : line.text}
              disabled={!onExpandContext || expandingContext}
              onClick={onExpandContext}
            >
              {expandingContext ? <LoaderCircle className="spin" size={13} /> : <ChevronsUpDown size={13} />}
              <span>{expandingContext
                ? "正在展开上下文…"
                : line.collapsedLines
                  ? onExpandContext ? `${line.collapsedLines} 行未修改，点击展开` : `${line.collapsedLines} 行未修改`
                  : "展开更多上下文"}</span>
            </button>
          ) : null
        ) : (
          <div className={`diff-line ${line.kind}`} key={`${index}:${line.text}`}>
            <span className="diff-line-number" aria-label={lineNumberLabel(line)} title={lineNumberLabel(line)}>{displayLineNumber(line) ?? ""}</span>
            <span className="diff-line-marker" aria-hidden="true">{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : ""}</span>
            {highlighted === undefined
              ? <code>{text}</code>
              : <code className={`language-${language ?? "plain"}`} dangerouslySetInnerHTML={{ __html: highlighted }} />}
          </div>
        ))}
      </div>
    </>
  );
}
