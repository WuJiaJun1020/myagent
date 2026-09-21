import { PanelRight, TerminalSquare } from "lucide-react";
import { useUiStore } from "../../stores/ui-store";

type TopBarProps = {
  heading: string;
  section: string;
  terminalAvailable?: boolean;
  detailAvailable?: boolean;
};

export function TopBar({ heading, section, terminalAvailable = false, detailAvailable = true }: TopBarProps) {
  const terminalPanelOpen = useUiStore((state) => state.terminalPanelOpen);
  const toggleTerminalPanel = useUiStore((state) => state.toggleTerminalPanel);
  const detailPanelOpen = useUiStore((state) => state.detailPanelOpen);
  const toggleDetailPanel = useUiStore((state) => state.toggleDetailPanel);

  return (
    <header className="topbar">
      <div className="topbar-primary">
        <div className="workspace-heading">
          <strong>{heading}</strong>
          <span>/</span>
          <span title={section}>
            {section}
          </span>
        </div>
      </div>

      <div className="topbar-actions">
        {terminalAvailable && <button
            className={`topbar-icon-button ${terminalPanelOpen ? "active" : ""}`}
            type="button"
            title="切换终端面板"
            aria-label="切换终端面板"
            onClick={toggleTerminalPanel}
          ><TerminalSquare size={15} /></button>}
        {detailAvailable && <button
          className={`topbar-icon-button ${detailPanelOpen ? "active" : ""}`}
          type="button"
          title={detailPanelOpen ? "隐藏工作区面板" : "显示工作区面板"}
          aria-label={detailPanelOpen ? "隐藏工作区面板" : "显示工作区面板"}
          onClick={toggleDetailPanel}
        ><PanelRight size={15} /></button>}
      </div>
    </header>
  );
}
