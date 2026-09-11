import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileJson2,
  Folder,
  FolderOpen,
  Link2,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useEffect } from "react";
import type { WorkspaceEntry } from "../../../shared/contracts/workspace";
import { TooltipIconButton } from "../../components/ui/tooltip-icon-button";
import { useUiStore } from "../../stores/ui-store";
import { useWorkspaceStore } from "../../stores/workspace-store";

function EntryIcon({ entry }: { entry: WorkspaceEntry }) {
  if (entry.kind === "symlink") return <Link2 size={14} />;
  const extension = entry.name.split(".").at(-1)?.toLowerCase();
  if (extension === "json" || extension === "jsonl") return <FileJson2 size={14} />;
  if (["ts", "tsx", "js", "jsx", "css", "html", "md", "py", "rs", "go", "java"].includes(extension ?? "")) {
    return <FileCode2 size={14} />;
  }
  return <File size={14} />;
}

function TreeBranch({ path, depth }: { path: string; depth: number }) {
  const directory = useWorkspaceStore((state) => state.directoriesByPath[path]);
  const expandedDirectories = useWorkspaceStore((state) => state.expandedDirectories);
  const activeFilePath = useWorkspaceStore((state) => state.activeFilePath);
  const toggleDirectory = useWorkspaceStore((state) => state.toggleDirectory);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const selectFile = useUiStore((state) => state.selectFile);

  if (directory?.loading && !directory.listing) {
    return <div className="file-tree-state"><LoaderCircle className="spin" size={13} />正在读取…</div>;
  }
  if (directory?.error) return <div className="file-tree-error">{directory.error}</div>;
  if (!directory?.listing) return null;

  return (
    <div role="group">
      {directory.listing.entries.map((entry) => {
        const isDirectory = entry.kind === "directory";
        const expanded = Boolean(expandedDirectories[entry.path]);
        return (
          <div key={entry.path}>
            <button
              className={`file-tree-row ${activeFilePath === entry.path ? "active" : ""}`}
              type="button"
              style={{ paddingLeft: `${7 + depth * 13}px` }}
              disabled={entry.kind === "symlink"}
              title={entry.kind === "symlink" ? "为保证工作区边界安全，文件树不展开符号链接" : entry.path}
              onClick={() => {
                if (isDirectory) {
                  void toggleDirectory(entry.path);
                } else {
                  selectFile(entry.path);
                  void openFile(entry.path);
                }
              }}
            >
              <span className="file-tree-chevron">
                {isDirectory ? expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}
              </span>
              <span className={`file-tree-icon ${entry.kind}`}>
                {isDirectory ? expanded ? <FolderOpen size={14} /> : <Folder size={14} /> : <EntryIcon entry={entry} />}
              </span>
              <span>{entry.name}</span>
            </button>
            {isDirectory && expanded && <TreeBranch path={entry.path} depth={depth + 1} />}
          </div>
        );
      })}
      {directory.listing.truncated && <div className="file-tree-warning">目录条目过多，仅显示前 500 项</div>}
      {directory.listing.entries.length === 0 && <div className="file-tree-state">空目录</div>}
    </div>
  );
}

export function FileTree() {
  const cwd = useWorkspaceStore((state) => state.cwd);
  const loadDirectory = useWorkspaceStore((state) => state.loadDirectory);

  useEffect(() => {
    if (cwd) void loadDirectory("");
  }, [cwd, loadDirectory]);

  return (
    <section className="file-explorer" aria-label="项目文件">
      <header>
        <span>Explorer</span>
        <TooltipIconButton
          className="file-tree-action"
          label="刷新文件树"
          disabled={!cwd}
          onClick={() => void loadDirectory("", true)}
        >
          <RefreshCw size={13} />
        </TooltipIconButton>
      </header>
      <div className="file-tree" role="tree">
        {cwd ? <TreeBranch path="" depth={0} /> : <div className="file-tree-state">请先选择工作区</div>}
      </div>
    </section>
  );
}
