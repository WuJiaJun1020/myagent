import { PanelRight, TerminalSquare } from "lucide-react";
import { useAgentStore } from "../../stores/agent-store";
import { useUiStore } from "../../stores/ui-store";
import { useWorkspaceStore } from "../../stores/workspace-store";

function getWorkspaceName(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? "未选择工作区";
}

export function TopBar() {
  const status = useAgentStore((state) => state.processStatus);
  const sidebarView = useUiStore((state) => state.sidebarView);
  const terminalPanelOpen = useUiStore((state) => state.terminalPanelOpen);
  const toggleTerminalPanel = useUiStore((state) => state.toggleTerminalPanel);
  const detailPanelOpen = useUiStore((state) => state.detailPanelOpen);
  const toggleDetailPanel = useUiStore((state) => state.toggleDetailPanel);
  const activeFilePath = useWorkspaceStore((state) => state.activeFilePath);
  const workspaceSection = sidebarView === "files"
    ? activeFilePath ?? "项目文件"
    : sidebarView === "review"
      ? "代码审查"
    : sidebarView === "mcp"
      ? "资源中心"
      : sidebarView === "memory"
        ? "Memory 与上下文"
        : "会话";

  return (
    <header className="topbar">
      <div className="topbar-primary">
        <div className="workspace-heading">
          <strong>{getWorkspaceName(status.cwd)}</strong>
          <span>/</span>
          <span title={workspaceSection}>
            {workspaceSection}
          </span>
        </div>
      </div>

      <div className="topbar-actions">
        <button
          className={`topbar-icon-button ${terminalPanelOpen ? "active" : ""}`}
          type="button"
          title="切换终端面板"
          aria-label="切换终端面板"
          onClick={toggleTerminalPanel}
        ><TerminalSquare size={15} /></button>
        <button
          className={`topbar-icon-button ${detailPanelOpen ? "active" : ""}`}
          type="button"
          title={detailPanelOpen ? "隐藏工作区面板" : "显示工作区面板"}
          aria-label={detailPanelOpen ? "隐藏工作区面板" : "显示工作区面板"}
          onClick={toggleDetailPanel}
        ><PanelRight size={15} /></button>
      </div>
    </header>
  );
}
