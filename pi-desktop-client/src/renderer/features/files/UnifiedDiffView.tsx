import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronsUpDown, LoaderCircle } from "lucide-react";
import { memo, useMemo, useRef } from "react";
import { highlightCode, languageForPath } from "../../lib/syntax-highlighting";

const MAX_DIFF_LINES = 4_000;
const VIRTUALIZATION_THRESHOLD = 120;
const DIFF_LINE_HEIGHT = 25;
const DIFF_SEPARATOR_HEIGHT = 45;
const DIFF_VIRTUAL_OVERSCAN = 12;

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
  virtualize?: boolean;
};

type PresentedDiffLine = {
  line: UnifiedDiffLine;
  text: string;
};

type DiffContentRowProps = PresentedDiffLine & {
  path?: string;
  language?: string;
  expandingContext: boolean;
  onExpandContext?: () => void;
};

const DiffContentRow = memo(function DiffContentRow({
  line,
  text,
  path,
  language,
  expandingContext,
  onExpandContext,
}: DiffContentRowProps) {
  const highlighted = useMemo(
    () => line.kind === "hunk" ? undefined : highlightCode(text, path),
    [line.kind, path, text],
  );

  if (line.kind === "hunk") {
    if (!line.collapsedLines && !onExpandContext) return null;
    return (
      <button
        className="diff-context-separator"
        type="button"
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
    );
  }

  return (
    <div className={`diff-line ${line.kind}`}>
      <span className="diff-line-number" aria-label={lineNumberLabel(line)} title={lineNumberLabel(line)}>{displayLineNumber(line) ?? ""}</span>
      <span className="diff-line-marker" aria-hidden="true">{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : ""}</span>
      {highlighted === undefined
        ? <code>{text}</code>
        : <code className={`language-${language ?? "plain"}`} dangerouslySetInnerHTML={{ __html: highlighted }} />}
    </div>
  );
});

export function shouldVirtualizeUnifiedDiff(lineCount: number, requested: boolean): boolean {
  return requested && lineCount > VIRTUALIZATION_THRESHOLD;
}

function virtualCanvasWidth(lines: PresentedDiffLine[]): string {
  let maximumColumns = 1;
  for (const { text } of lines) {
    let columns = 0;
    for (const character of text) {
      columns += character === "\t" ? 4 : character.codePointAt(0)! > 0xff ? 2 : 1;
    }
    if (columns > maximumColumns) maximumColumns = columns;
  }
  return `max(100%, calc(${maximumColumns}ch + 88px))`;
}

export function UnifiedDiffView({
  diff,
  path,
  truncated = false,
  emptyLabel = "没有可展示的文本 Diff。",
  expandingContext = false,
  onExpandContext,
  virtualize = false,
}: UnifiedDiffViewProps) {
  const allLines = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const language = useMemo(() => languageForPath(path), [path]);
  const reviewLines = useMemo(() => allLines.filter((line) => line.kind !== "header"), [allLines]);
  const visibleLines = useMemo(() => reviewLines.slice(0, MAX_DIFF_LINES), [reviewLines]);
  const hasContextExpansion = Boolean(onExpandContext);
  const presentedLines = useMemo(() => visibleLines
    .filter((line) => line.kind !== "hunk" || Boolean(line.collapsedLines) || hasContextExpansion)
    .map((line): PresentedDiffLine => ({ line, text: displayLineText(line) })), [hasContextExpansion, visibleLines]);
  const virtualWidth = useMemo(() => virtualCanvasWidth(presentedLines), [presentedLines]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const useVirtualRows = shouldVirtualizeUnifiedDiff(presentedLines.length, virtualize);
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: useVirtualRows ? presentedLines.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => presentedLines[index]?.line.kind === "hunk"
      ? DIFF_SEPARATOR_HEIGHT
      : DIFF_LINE_HEIGHT,
    getItemKey: (index) => `${index}:${presentedLines[index]?.line.text ?? ""}`,
    overscan: DIFF_VIRTUAL_OVERSCAN,
  });

  if (!diff) return <p className="detail-empty">{emptyLabel}</p>;

  return (
    <div className="unified-diff-view">
      {(truncated || reviewLines.length > visibleLines.length) && <div className="viewer-notice">Diff 过长，已截断显示。</div>}
      <div ref={scrollRef} className={`diff-lines${useVirtualRows ? " virtualized" : ""}`}>
        {useVirtualRows ? (
          <div
            className="diff-lines-virtual-canvas"
            style={{ height: rowVirtualizer.getTotalSize(), width: virtualWidth }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const presented = presentedLines[virtualRow.index];
              if (!presented) return null;
              return (
                <div
                  className={`diff-virtual-row${presented.line.kind === "hunk" ? " separator" : ""}`}
                  key={virtualRow.key}
                  style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                >
                  <DiffContentRow
                    {...presented}
                    path={path}
                    language={language}
                    expandingContext={expandingContext}
                    onExpandContext={onExpandContext}
                  />
                </div>
              );
            })}
          </div>
        ) : presentedLines.map((presented, index) => (
          <DiffContentRow
            {...presented}
            path={path}
            language={language}
            expandingContext={expandingContext}
            onExpandContext={onExpandContext}
            key={`${index}:${presented.line.text}`}
          />
        ))}
      </div>
    </div>
  );
}
