import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCode2,
  Files,
  GitPullRequest,
  LoaderCircle,
  PackageOpen,
  TerminalSquare,
} from "lucide-react";
import { TooltipIconButton } from "../../components/ui/tooltip-icon-button";
import { useAgentStore } from "../../stores/agent-store";
import { useUiStore } from "../../stores/ui-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { useResourceStore } from "../../stores/resource-store";
import { CodeViewer } from "../files/CodeViewer";
import { FileChangeReviewActions } from "../files/FileChangeReviewActions";
import { resolveToolRenderer, ToolCategoryIcon, ToolDetailRenderer } from "./ToolRenderer";

function formatDuration(startedAt: number, completedAt?: number): string {
  if (!completedAt) return "执行中";
  const duration = Math.max(0, completedAt - startedAt);
  return duration < 1000 ? `${duration} ms` : `${(duration / 1000).toFixed(1)} s`;
}

export function DetailPanel() {
  const detailSelection = useUiStore((state) => state.detailSelection);
  const clearDetailSelection = useUiStore((state) => state.clearDetailSelection);
  const setAgentView = useUiStore((state) => state.setAgentView);
  const agentView = useUiStore((state) => state.moduleViews.agent);
  const terminalPanelOpen = useUiStore((state) => state.terminalPanelOpen);
  const toggleTerminalPanel = useUiStore((state) => state.toggleTerminalPanel);
  const selectedToolCallId = detailSelection?.type === "tool" ? detailSelection.id : null;
  const selectedFilePath = detailSelection?.type === "file" ? detailSelection.path : null;
  const tool = useAgentStore((state) => selectedToolCallId ? state.toolCallsById[selectedToolCallId] : undefined);
  const file = useWorkspaceStore((state) => selectedFilePath ? state.filesByPath[selectedFilePath] : undefined);
  const loadingFilePath = useWorkspaceStore((state) => state.loadingFilePath);
  const fileError = useWorkspaceStore((state) => state.fileError);
  const presentation = tool ? resolveToolRenderer(tool).present(tool) : undefined;
  const toolSource = useResourceStore((state) => tool ? state.tools.find((item) => item.name === tool.name)?.source : undefined);
  const childViewOpen = Boolean(selectedFilePath || tool);

  function showHome(): void {
    clearDetailSelection();
  }

  function openWorkspaceView(view: "files" | "review"): void {
    clearDetailSelection();
    setAgentView(view);
  }

  const title = selectedFilePath
    ? "文件预览"
    : tool
      ? "工具详情"
      : "工作区面板";

  return (
    <aside className="detail-panel">
      <header className="detail-header">
        <div className="detail-header-title">
          {childViewOpen && (
            <TooltipIconButton className="detail-back-button" label="返回工作区面板" onClick={showHome}>
              <ArrowLeft size={15} />
            </TooltipIconButton>
          )}
          <div><span className="eyebrow">WORKSPACE</span><strong>{title}</strong></div>
        </div>
      </header>

      {selectedFilePath ? (
        <div className="detail-content file-detail-content">
          {loadingFilePath === selectedFilePath && !file ? (
            <div className="detail-loading"><LoaderCircle className="spin" size={16} />正在读取文件…</div>
          ) : fileError && !file ? (
            <div className="file-detail-error"><FileCode2 size={18} /><strong>无法打开文件</strong><span>{fileError}</span></div>
          ) : file ? <CodeViewer file={file} /> : <p className="detail-empty">选择文件后将在这里预览。</p>}
        </div>
      ) : tool ? (
        <div className="detail-content">
          <section className="detail-tool-title">
            <span className={`detail-tool-icon ${tool.status}`}><ToolCategoryIcon category={presentation?.category ?? "generic"} /></span>
            <div><strong>{presentation?.label ?? tool.name}</strong><span>{presentation?.summary}</span></div>
          </section>
          <div className="detail-facts">
            <span><Clock3 size={13} />耗时<strong>{formatDuration(tool.startedAt, tool.completedAt)}</strong></span>
            <span><CheckCircle2 size={13} />状态<strong>{tool.status}</strong></span>
            {toolSource && <span><PackageOpen size={13} />来源<strong>{toolSource.label}</strong></span>}
          </div>
          {toolSource && <div className="detail-tool-source"><span className={`tool-source-badge ${toolSource.kind}`}>{toolSource.kind === "mcp" ? "MCP Extension" : toolSource.label}</span><code>{toolSource.path}</code></div>}
          <ToolDetailRenderer tool={tool} />
          {tool.fileChange && <FileChangeReviewActions change={tool.fileChange} />}
        </div>
      ) : (
        <div className="detail-content detail-home">
          <div className="detail-home-intro">
            <strong>工作区工具</strong>
            <p>在右侧快速打开常用面板，具体内容会按当前任务动态切换。</p>
          </div>
          <nav className="detail-launcher-list" aria-label="工作区工具">
            <button className={agentView === "review" ? "active" : ""} type="button" onClick={() => openWorkspaceView("review")}>
              <span><GitPullRequest size={17} /></span>
              <div><strong>代码审查</strong><small>检查工作区文件与代码 Diff</small></div>
              <ChevronRight size={15} />
            </button>
            <button className={terminalPanelOpen ? "active" : ""} type="button" onClick={toggleTerminalPanel}>
              <span><TerminalSquare size={17} /></span>
              <div><strong>终端</strong><small>{terminalPanelOpen ? "终端面板已打开" : "打开集成终端"}</small></div>
              <ChevronRight size={15} />
            </button>
            <button className={agentView === "files" ? "active" : ""} type="button" onClick={() => openWorkspaceView("files")}>
              <span><Files size={17} /></span>
              <div><strong>项目文件</strong><small>浏览、预览和编辑工作区文件</small></div>
              <ChevronRight size={15} />
            </button>
          </nav>
        </div>
      )}
    </aside>
  );
}
