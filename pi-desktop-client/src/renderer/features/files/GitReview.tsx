import {
  Binary,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Eye,
  FileDiff,
  FileMinus2,
  FilePlus2,
  Folder,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { FileChange, WorkspaceGitDiff, WorkspaceGitFile, WorkspaceGitStatus } from "../../../shared/contracts/workspace";
import { createUnifiedDiff } from "../../../shared/unified-diff";
import { PanelResizeHandle } from "../../components/layout/PanelResizeHandle";
import { workspaceGateway } from "../../services/workspace-gateway";
import { useAgentStore } from "../../stores/agent-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useUiStore } from "../../stores/ui-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { countUnifiedDiffChanges, UnifiedDiffView } from "./UnifiedDiffView";

export type ReviewScope = "last-turn" | "uncommitted" | "unstaged" | "staged";

const REVIEW_SCOPE_LABELS: Record<ReviewScope, string> = {
  "last-turn": "上一轮",
  uncommitted: "未提交",
  unstaged: "未暂存",
  staged: "已暂存",
};
const EMPTY_FILE_CHANGES: FileChange[] = [];
const DEFAULT_CONTEXT_LINES = 3;
const MAX_CONTEXT_LINES = 10_000;

function canRegenerateTurnDiff(change: FileChange | undefined): change is FileChange {
  if (!change || change.truncated) return false;
  const hasBefore = change.changeType === "created" || change.beforeContent !== undefined;
  const hasAfter = change.changeType === "deleted" || change.afterContent !== undefined;
  return hasBefore && hasAfter;
}

function regenerateTurnDiff(change: FileChange, contextLines: number): string {
  const before = change.changeType === "created" ? "" : change.beforeContent ?? "";
  const after = change.changeType === "deleted" ? "" : change.afterContent ?? "";
  return createUnifiedDiff(change.path, before, after, contextLines);
}

export type ReviewTreeNode = {
  kind: "directory" | "file";
  name: string;
  path: string;
  file?: WorkspaceGitFile;
  children?: ReviewTreeNode[];
};

type MutableDirectory = {
  name: string;
  path: string;
  directories: Map<string, MutableDirectory>;
  files: WorkspaceGitFile[];
};

export function reviewFileMatchesScope(file: WorkspaceGitFile, scope: ReviewScope): boolean {
  if (scope === "last-turn") return false;
  if (scope === "uncommitted") return true;
  if (scope === "staged") return file.indexStatus !== " " && file.indexStatus !== "?";
  return file.workTreeStatus !== " " || file.indexStatus === "?";
}

export function reviewFileStats(file: WorkspaceGitFile, scope: ReviewScope): { additions: number; deletions: number } {
  if (scope === "uncommitted" || scope === "last-turn") {
    return { additions: file.additions, deletions: file.deletions };
  }
  if (scope === "staged") {
    return {
      additions: file.stagedAdditions ?? file.additions,
      deletions: file.stagedDeletions ?? file.deletions,
    };
  }
  return {
    additions: file.unstagedAdditions ?? file.additions,
    deletions: file.unstagedDeletions ?? file.deletions,
  };
}

function materializeDirectory(directory: MutableDirectory): ReviewTreeNode[] {
  const directories = [...directory.directories.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((child): ReviewTreeNode => ({
      kind: "directory",
      name: child.name,
      path: child.path,
      children: materializeDirectory(child),
    }));
  const files = [...directory.files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file): ReviewTreeNode => ({
      kind: "file",
      name: file.path.split("/").at(-1) ?? file.path,
      path: file.path,
      file,
    }));
  return [...directories, ...files];
}

export function buildReviewTree(files: WorkspaceGitFile[]): ReviewTreeNode[] {
  const root: MutableDirectory = { name: "", path: "", directories: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let directory = root;
    for (const part of parts.slice(0, -1)) {
      const path = directory.path ? `${directory.path}/${part}` : part;
      let child = directory.directories.get(part);
      if (!child) {
        child = { name: part, path, directories: new Map(), files: [] };
        directory.directories.set(part, child);
      }
      directory = child;
    }
    directory.files.push(file);
  }
  return materializeDirectory(root);
}

function fileState(file: WorkspaceGitFile, scope: ReviewScope): "created" | "deleted" | "modified" {
  const status = scope === "unstaged"
    ? file.indexStatus === "?" ? "A" : file.workTreeStatus
    : file.indexStatus === "?" ? "A" : file.indexStatus === "D" || file.workTreeStatus === "D" ? "D" : file.indexStatus;
  if (status === "A" || status === "?") return "created";
  if (status === "D") return "deleted";
  return "modified";
}

function fileType(path: string): string {
  const name = path.split("/").at(-1) ?? path;
  const extension = name.includes(".") ? name.split(".").at(-1) : undefined;
  return extension ? extension.slice(0, 3).toUpperCase() : "FILE";
}

type ReviewTreeProps = {
  nodes: ReviewTreeNode[];
  scope: ReviewScope;
  selectedPath: string | null;
  collapsedDirectories: Set<string>;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (file: WorkspaceGitFile) => void;
  depth?: number;
};

function ReviewTree({
  nodes,
  scope,
  selectedPath,
  collapsedDirectories,
  onToggleDirectory,
  onSelectFile,
  depth = 0,
}: ReviewTreeProps) {
  return nodes.map((node) => {
    if (node.kind === "directory") {
      const collapsed = collapsedDirectories.has(node.path);
      return (
        <div className="git-review-tree-group" key={node.path}>
          <button
            className="git-review-tree-directory"
            type="button"
            style={{ paddingLeft: 10 + depth * 17 }}
            aria-expanded={!collapsed}
            onClick={() => onToggleDirectory(node.path)}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            {collapsed ? <Folder size={15} /> : <FolderOpen size={15} />}
            <span>{node.name}</span>
            <i />
          </button>
          {!collapsed && node.children && (
            <ReviewTree
              nodes={node.children}
              scope={scope}
              selectedPath={selectedPath}
              collapsedDirectories={collapsedDirectories}
              onToggleDirectory={onToggleDirectory}
              onSelectFile={onSelectFile}
              depth={depth + 1}
            />
          )}
        </div>
      );
    }

    const file = node.file!;
    const state = fileState(file, scope);
    const stats = reviewFileStats(file, scope);
    const StateIcon = state === "created" ? FilePlus2 : state === "deleted" ? FileMinus2 : CircleDot;
    return (
      <button
        className={`git-review-tree-file ${selectedPath === file.path ? "active" : ""}`}
        type="button"
        key={file.path}
        style={{ paddingLeft: 29 + depth * 17 }}
        title={file.path}
        onClick={() => onSelectFile(file)}
      >
        <span className="git-review-file-type">{fileType(file.path)}</span>
        <span>{node.name}</span>
        <small><i>+{stats.additions}</i><b>-{stats.deletions}</b></small>
        <StateIcon className={state} size={14} />
      </button>
    );
  });
}

export function GitReview({ onClose }: { onClose?: () => void }) {
  const cwd = useWorkspaceStore((state) => state.cwd);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const selectFile = useUiStore((state) => state.selectFile);
  const setSidebarView = useUiStore((state) => state.setSidebarView);
  const reviewTreeWidth = useSettingsStore((state) => state.reviewTreeWidth);
  const setReviewTreeWidth = useSettingsStore((state) => state.setReviewTreeWidth);
  const busy = useAgentStore((state) => state.busy);
  const turnFileChangesByIndex = useAgentStore((state) => state.turnFileChangesByIndex);
  const latestTurnIndex = useMemo(() => {
    const indexes = Object.keys(turnFileChangesByIndex).map(Number).filter(Number.isFinite);
    return indexes.length > 0 ? Math.max(...indexes) : -1;
  }, [turnFileChangesByIndex]);
  const latestTurnChanges = latestTurnIndex >= 0
    ? turnFileChangesByIndex[latestTurnIndex] ?? EMPTY_FILE_CHANGES
    : EMPTY_FILE_CHANGES;
  const lastTurnChangesByPath = useMemo(() => {
    const result = new Map<string, FileChange>();
    for (const change of latestTurnChanges) result.set(change.path, change);
    return result;
  }, [latestTurnChanges]);
  const lastTurnFiles = useMemo(() => [...lastTurnChangesByPath.values()].map((change): WorkspaceGitFile => {
    const stats = countUnifiedDiffChanges(change.unifiedDiff);
    const statusCode = change.changeType === "created" ? "A" : change.changeType === "deleted" ? "D" : "M";
    return {
      path: change.path,
      indexStatus: statusCode,
      workTreeStatus: " ",
      additions: stats.additions,
      deletions: stats.deletions,
      binary: false,
    };
  }), [lastTurnChangesByPath]);
  const [status, setStatus] = useState<WorkspaceGitStatus | null>(null);
  const [diff, setDiff] = useState<WorkspaceGitDiff | null>(null);
  const [scope, setScope] = useState<ReviewScope>(() => lastTurnFiles.length > 0 ? "last-turn" : "unstaged");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [contextExhausted, setContextExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectionRef = useRef<{ path: string; scope: ReviewScope } | null>(null);
  const contextLinesRef = useRef(DEFAULT_CONTEXT_LINES);
  const diffRef = useRef<WorkspaceGitDiff | null>(null);
  const scopeRef = useRef<ReviewScope>(lastTurnFiles.length > 0 ? "last-turn" : "unstaged");
  const scopeMenuRef = useRef<HTMLDivElement>(null);
  const diffRequestRef = useRef(0);

  async function inspect(
    path: string,
    reviewScope: ReviewScope,
    options: { contextLines?: number; preserveDiff?: boolean; showLoading?: boolean; detectExhaustion?: boolean } = {},
  ): Promise<void> {
    const contextLines = options.contextLines ?? DEFAULT_CONTEXT_LINES;
    const previousContextLines = contextLinesRef.current;
    const previousDiff = diffRef.current;
    selectionRef.current = { path, scope: reviewScope };
    contextLinesRef.current = contextLines;
    setSelectedPath(path);
    if (!options.preserveDiff) {
      diffRef.current = null;
      setDiff(null);
      setContextExhausted(false);
    }
    if (options.showLoading !== false) setDiffLoading(true);
    setError(null);
    const request = ++diffRequestRef.current;
    try {
      const nextDiff = reviewScope === "last-turn"
        ? (() => {
            const change = lastTurnChangesByPath.get(path);
            if (!change) throw new Error("上一轮变更记录已更新，请重新选择文件");
            const expandedDiff = contextLines > DEFAULT_CONTEXT_LINES && canRegenerateTurnDiff(change)
              ? regenerateTurnDiff(change, contextLines)
              : change.unifiedDiff;
            return { path, staged: false, diff: expandedDiff, truncated: Boolean(change.truncated) };
          })()
        : await workspaceGateway.getGitDiff(path, reviewScope, contextLines);
      if (request === diffRequestRef.current) {
        diffRef.current = nextDiff;
        setDiff(nextDiff);
        if (options.detectExhaustion) setContextExhausted(previousDiff?.diff === nextDiff.diff);
        else if (previousDiff && previousDiff.diff !== nextDiff.diff) setContextExhausted(false);
      }
    } catch (reason) {
      if (request === diffRequestRef.current) {
        if (options.preserveDiff) contextLinesRef.current = previousContextLines;
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (request === diffRequestRef.current) setDiffLoading(false);
    }
  }

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await workspaceGateway.getGitStatus();
      setStatus(nextStatus);
      if ((!nextStatus.available || nextStatus.files.length === 0) && lastTurnFiles.length === 0) {
        selectionRef.current = null;
        contextLinesRef.current = DEFAULT_CONTEXT_LINES;
        setSelectedPath(null);
        diffRef.current = null;
        setDiff(null);
        setContextExhausted(false);
        return;
      }

      let nextScope = scopeRef.current;
      let candidates = nextScope === "last-turn"
        ? lastTurnFiles
        : nextStatus.files.filter((file) => reviewFileMatchesScope(file, nextScope));
      if (candidates.length === 0) {
        for (const alternate of ["uncommitted", "unstaged", "staged"] as const) {
          const alternateCandidates = nextStatus.files.filter((file) => reviewFileMatchesScope(file, alternate));
          if (alternateCandidates.length > 0) {
            nextScope = alternate;
            scopeRef.current = alternate;
            setScope(alternate);
            candidates = alternateCandidates;
            break;
          }
        }
      }

      if (candidates.length === 0) {
        selectionRef.current = null;
        contextLinesRef.current = DEFAULT_CONTEXT_LINES;
        setSelectedPath(null);
        diffRef.current = null;
        setDiff(null);
        setContextExhausted(false);
        return;
      }
      const previousSelection = selectionRef.current;
      const selectedFile = candidates.find((file) => file.path === previousSelection?.path) ?? candidates[0];
      const sameSelection = previousSelection?.path === selectedFile.path && previousSelection.scope === nextScope;
      await inspect(selectedFile.path, nextScope, {
        contextLines: sameSelection ? contextLinesRef.current : DEFAULT_CONTEXT_LINES,
        preserveDiff: sameSelection,
        showLoading: !sameSelection,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!cwd) return;
    void refresh();
    if (!busy) return;
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [cwd, busy, latestTurnIndex, latestTurnChanges]);

  useEffect(() => {
    if (!scopeMenuOpen) return;
    const closeWhenOutside = (event: PointerEvent) => {
      if (!scopeMenuRef.current?.contains(event.target as Node)) setScopeMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    return () => document.removeEventListener("pointerdown", closeWhenOutside);
  }, [scopeMenuOpen]);

  function changeScope(nextScope: ReviewScope): void {
    scopeRef.current = nextScope;
    setScope(nextScope);
    setScopeMenuOpen(false);
    const candidates = nextScope === "last-turn"
      ? lastTurnFiles
      : status?.files.filter((file) => reviewFileMatchesScope(file, nextScope)) ?? [];
    const first = candidates[0];
    if (first) void inspect(first.path, nextScope);
    else {
      selectionRef.current = null;
      contextLinesRef.current = DEFAULT_CONTEXT_LINES;
      setSelectedPath(null);
      diffRef.current = null;
      setDiff(null);
      setContextExhausted(false);
    }
  }

  const scopeFiles = useMemo(
    () => scope === "last-turn" ? lastTurnFiles : status?.files.filter((file) => reviewFileMatchesScope(file, scope)) ?? [],
    [lastTurnFiles, scope, status],
  );
  const visibleFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return normalizedQuery
      ? scopeFiles.filter((file) => file.path.toLocaleLowerCase().includes(normalizedQuery))
      : scopeFiles;
  }, [query, scopeFiles]);
  const tree = useMemo(() => buildReviewTree(visibleFiles), [visibleFiles]);
  const totals = useMemo(() => scopeFiles.reduce((result, file) => {
    const stats = reviewFileStats(file, scope);
    result.additions += stats.additions;
    result.deletions += stats.deletions;
    return result;
  }, { additions: 0, deletions: 0 }), [scope, scopeFiles]);
  const selectedFile = scopeFiles.find((file) => file.path === selectedPath);
  const selectedStats = selectedFile ? reviewFileStats(selectedFile, scope) : null;
  const canOpenSelectedFile = selectedFile
    ? fileState(selectedFile, scope) !== "deleted"
    : false;
  const selectedFileState = selectedFile ? fileState(selectedFile, scope) : undefined;
  const canExpandSelectedContext = !contextExhausted && selectedFileState === "modified" && contextLinesRef.current < MAX_CONTEXT_LINES && (
    scope !== "last-turn"
    || canRegenerateTurnDiff(selectedPath ? lastTurnChangesByPath.get(selectedPath) : undefined)
  );

  function expandContext(): void {
    const selection = selectionRef.current;
    if (!selection || !canExpandSelectedContext || contextLinesRef.current >= MAX_CONTEXT_LINES) return;
    const nextContextLines = Math.min(
      MAX_CONTEXT_LINES,
      Math.max(contextLinesRef.current * 2, contextLinesRef.current + 20),
    );
    void inspect(selection.path, selection.scope, {
      contextLines: nextContextLines,
      preserveDiff: true,
      detectExhaustion: true,
    });
  }

  return (
    <section className="git-review" aria-label="代码审查">
      <header className="git-review-tabs">
        <div className="git-review-tab active">
          <FileDiff size={15} />
          <strong>审查</strong>
          {onClose && <button type="button" aria-label="关闭代码审查" title="关闭代码审查" onClick={onClose}><X size={14} /></button>}
        </div>
      </header>

      <div className="git-review-toolbar">
        <div className="git-review-scope-select" ref={scopeMenuRef}>
          <button type="button" aria-haspopup="menu" aria-expanded={scopeMenuOpen} onClick={() => setScopeMenuOpen((open) => !open)}>
            {REVIEW_SCOPE_LABELS[scope]}<ChevronDown size={13} />
          </button>
          {scopeMenuOpen && (
            <div className="git-review-scope-menu" role="menu">
              {(Object.keys(REVIEW_SCOPE_LABELS) as ReviewScope[]).map((option) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={scope === option}
                  disabled={option === "last-turn" && lastTurnFiles.length === 0}
                  key={option}
                  onClick={() => changeScope(option)}
                >
                  <span>{REVIEW_SCOPE_LABELS[option]}</span>{scope === option && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="git-review-total"><i>+{totals.additions}</i><b>-{totals.deletions}</b></span>
        {status?.branch && <span className="git-review-branch" title={status.branch}>{status.branch}</span>}
        <button className="git-review-refresh" type="button" title="刷新 Git 状态" aria-label="刷新 Git 状态" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={loading ? "spin" : ""} size={15} />
        </button>
      </div>

      {error && <p className="git-review-error">{error}</p>}
      {!status && loading && <div className="workspace-editor-state"><LoaderCircle className="spin" size={16} />正在分析 Git 变更…</div>}
      {!loading && status && !status.available && lastTurnFiles.length === 0 && <p className="workspace-editor-empty">{status.error ?? "当前工作区不是 Git 仓库。"}</p>}
      {status?.available && status.files.length === 0 && lastTurnFiles.length === 0 && (
        <div className="git-review-clean"><FileDiff size={26} /><strong>没有待审查的更改</strong><span>当前 Git 工作区是干净的。</span></div>
      )}
      {status && (status.files.length > 0 || lastTurnFiles.length > 0) && (
        <div className="git-review-body" style={{ "--review-tree-width": `${reviewTreeWidth}px` } as CSSProperties}>
          <section className="git-review-diff">
            {selectedFile ? (
              <>
                <header>
                  <div className="git-review-file-heading">
                    <span className="git-review-file-type">{fileType(selectedFile.path)}</span>
                    <strong title={selectedFile.path}>{selectedFile.path}</strong>
                    {selectedStats && <small><i>+{selectedStats.additions}</i><b>-{selectedStats.deletions}</b></small>}
                  </div>
                  <button
                    type="button"
                    disabled={!canOpenSelectedFile}
                    title={canOpenSelectedFile ? "打开文件" : "文件已删除"}
                    aria-label={canOpenSelectedFile ? "打开文件" : "文件已删除"}
                    onClick={() => {
                      selectFile(selectedFile.path);
                      void openFile(selectedFile.path);
                      setSidebarView("activity");
                    }}
                  ><Eye size={14} /></button>
                </header>
                <div className="git-review-diff-content">
                  {!diff && diffLoading ? (
                    <div className="workspace-editor-state"><LoaderCircle className="spin" size={16} />正在生成 Diff…</div>
                  ) : diff ? (
                    <UnifiedDiffView
                      diff={diff.diff}
                      path={diff.path}
                      truncated={diff.truncated}
                      emptyLabel="该范围没有可展示的文本 Diff。"
                      expandingContext={diffLoading}
                      onExpandContext={canExpandSelectedContext ? expandContext : undefined}
                    />
                  ) : null}
                </div>
              </>
            ) : (
              <div className="git-review-scope-empty"><FileDiff size={24} /><strong>“{REVIEW_SCOPE_LABELS[scope]}”没有可显示的更改</strong><span>可从上方切换审查范围。</span></div>
            )}
          </section>

          <PanelResizeHandle
            label="调整审查文件列表宽度"
            value={reviewTreeWidth}
            min={180}
            max={480}
            direction="left"
            oppositeMin={260}
            onChange={setReviewTreeWidth}
          />

          <aside className="git-review-tree">
            <label>
              <Search size={14} />
              <input value={query} placeholder="筛选文件…" aria-label="筛选审查文件" onChange={(event) => setQuery(event.target.value)} />
              {query && <button type="button" aria-label="清除筛选" onClick={() => setQuery("")}><X size={13} /></button>}
            </label>
            <div className="git-review-tree-scroll">
              {tree.length > 0 ? (
                <ReviewTree
                  nodes={tree}
                  scope={scope}
                  selectedPath={selectedPath}
                  collapsedDirectories={collapsedDirectories}
                  onToggleDirectory={(path) => setCollapsedDirectories((current) => {
                    const next = new Set(current);
                    if (next.has(path)) next.delete(path);
                    else next.add(path);
                    return next;
                  })}
                  onSelectFile={(file) => void inspect(file.path, scope, { contextLines: DEFAULT_CONTEXT_LINES })}
                />
              ) : <p>{query ? "没有匹配的文件" : "此范围没有文件"}</p>}
            </div>
            <footer><span>{scopeFiles.length} 个文件</span>{scopeFiles.some((file) => file.binary) && <span><Binary size={12} />含二进制文件</span>}</footer>
          </aside>
        </div>
      )}
    </section>
  );
}
