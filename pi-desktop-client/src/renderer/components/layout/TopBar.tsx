import { HoverHint, HintButton } from "../ui/tooltip";
import { PanelRight, TerminalSquare } from "lucide-react";
import type { ReactNode } from "react";
import { useUiStore } from "../../stores/ui-store";
import { useBrowserStore } from "../../stores/browser-store";

type TopBarProps = {
  heading: string;
  section: string;
  terminalAvailable?: boolean;
  detailAvailable?: boolean;
  tools?: ReactNode;
};

export function TopBar({ heading, section, terminalAvailable = false, detailAvailable = true, tools }: TopBarProps) {
  const terminalPanelOpen = useUiStore((state) => state.terminalPanelOpen);
  const toggleTerminalPanel = useUiStore((state) => state.toggleTerminalPanel);
  const detailPanelOpen = useUiStore((state) => state.activeModule === "agent" ? state.agentDetailPanelOpen : state.detailPanelOpen);
  const toggleDetailPanel = useUiStore((state) => state.toggleDetailPanel);
  const activeModule = useUiStore(state => state.activeModule);
  const browserOpen = useBrowserStore(state => state.open) && activeModule === "agent";
  const closeBrowser = useBrowserStore(state => state.close);

  return (
    <header className="topbar">
      <div className="topbar-primary">
        <div className="workspace-heading">
          <strong>{heading}</strong>
          <span>/</span>
          <HoverHint content={section}><span >
            {section}
          </span></HoverHint>
        </div>
      </div>

      <div className="topbar-actions">
        {tools}
        {terminalAvailable && <HintButton
            className={`topbar-icon-button ${terminalPanelOpen ? "active" : ""}`}
            type="button"
            hint="切换终端面板"
            aria-label="切换终端面板"
            aria-pressed={terminalPanelOpen}
            onClick={toggleTerminalPanel}
          ><TerminalSquare size={15} /></HintButton>}
        {detailAvailable && <HintButton
          className={`topbar-icon-button ${detailPanelOpen || browserOpen ? "active" : ""}`}
          type="button"
          hint={detailPanelOpen || browserOpen ? "隐藏工作区面板" : "显示工作区面板"}
          aria-label={detailPanelOpen || browserOpen ? "隐藏工作区面板" : "显示工作区面板"}
          aria-pressed={detailPanelOpen || browserOpen}
          onClick={() => { if (browserOpen) { closeBrowser(); if (detailPanelOpen) toggleDetailPanel(); } else toggleDetailPanel(); }}
        ><PanelRight size={15} /></HintButton>}
      </div>
    </header>
  );
}
