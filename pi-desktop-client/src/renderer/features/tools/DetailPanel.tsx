import { CheckCircle2, Clock3, FileCode2, LoaderCircle, PackageOpen, PanelRightClose } from "lucide-react";
import { TooltipIconButton } from "../../components/ui/tooltip-icon-button";
import { useAgentStore } from "../../stores/agent-store";
import { useUiStore } from "../../stores/ui-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { useResourceStore } from "../../stores/resource-store";
import { CodeViewer } from "../files/CodeViewer";
import { resolveToolRenderer, ToolCategoryIcon, ToolDetailRenderer } from "./ToolRenderer";

function formatDuration(startedAt: number, completedAt?: number): string {
  if (!completedAt) return "执行中";
  const duration = Math.max(0, completedAt - startedAt);
  return duration < 1000 ? `${duration} ms` : `${(duration / 1000).toFixed(1)} s`;
}

export function DetailPanel() {
  const detailSelection = useUiStore((state) => state.detailSelection);
  const toggleDetailPanel = useUiStore((state) => state.toggleDetailPanel);
  const selectedToolCallId = detailSelection?.type === "tool" ? detailSelection.id : null;
  const selectedFilePath = detailSelection?.type === "file" ? detailSelection.path : null;
  const tool = useAgentStore((state) => selectedToolCallId ? state.toolCallsById[selectedToolCallId] : undefined);
  const file = useWorkspaceStore((state) => selectedFilePath ? state.filesByPath[selectedFilePath] : undefined);
  const loadingFilePath = useWorkspaceStore((state) => state.loadingFilePath);
  const fileError = useWorkspaceStore((state) => state.fileError);
  const toolCount = useAgentStore((state) => Object.keys(state.toolCallsById).length);
  const messageCount = useAgentStore((state) => Object.keys(state.messagesById).length);
  const busy = useAgentStore((state) => state.busy);
  const presentation = tool ? resolveToolRenderer(tool).present(tool) : undefined;
  const toolSource = useResourceStore((state) => tool ? state.tools.find((item) => item.name === tool.name)?.source : undefined);

  return (
    <aside className="detail-panel">
      <header className="detail-header">
        <div><span className="eyebrow">INSPECTOR</span><strong>{selectedFilePath ? "文件预览" : tool ? "工具详情" : "运行概览"}</strong></div>
        <TooltipIconButton className="topbar-icon-button" label="关闭详情面板" onClick={toggleDetailPanel}>
          <PanelRightClose size={16} />
        </TooltipIconButton>
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
        </div>
      ) : (
        <div className="detail-content overview">
          <div className={`overview-pulse ${busy ? "active" : ""}`}><span /><strong>{busy ? "Agent 正在执行" : "等待新任务"}</strong><small>实时事件将出现在中央活动流</small></div>
          <div className="overview-grid">
            <div><span>消息</span><strong>{messageCount}</strong></div>
            <div><span>工具调用</span><strong>{toolCount}</strong></div>
          </div>
          <div className="planned-panel">
            <span className="eyebrow">WORKSPACE</span>
            <strong>文件与代码详情已接入</strong>
            <p>从左侧打开项目文件，或点击时间线中的工具卡片查看代码 Diff 与 Terminal 输出。</p>
          </div>
        </div>
      )}
    </aside>
  );
}
