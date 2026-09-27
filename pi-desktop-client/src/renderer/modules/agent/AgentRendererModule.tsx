import { HintButton } from "../../components/ui/tooltip";
import { Fragment, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Files, GitPullRequest, Globe } from "lucide-react";
import { useBrowserStore } from "../../stores/browser-store";
import { AgentStatusStrip } from "../../features/agent/AgentStatusStrip";
import { ExtensionWidgets } from "../../features/agent/ExtensionWidgets";
import { ChatPanel } from "../../features/chat/ChatPanel";
import { Composer } from "../../features/chat/Composer";
import { ExtensionDialog } from "../../features/chat/ExtensionDialog";
import { GitReview } from "../../features/files/GitReview";
import { WorkspaceEditor } from "../../features/files/WorkspaceEditor";
import { MemoryPanel } from "../../features/resources/MemoryPanel";
import { ResourceCenterPanel } from "../../features/resources/ResourceCenterPanel";
import { SessionOverviewDialog } from "../../features/sessions/SessionOverviewDialog";
import { DetailPanel } from "../../features/tools/DetailPanel";
import { TopBar } from "../../components/layout/TopBar";
import { useAgentStore } from "../../stores/agent-store";
import { useUiStore } from "../../stores/ui-store";
import { useWorkspaceStore } from "../../stores/workspace-store";

const LazyTerminalPanel = lazy(async () => {
  const module = await import("../../features/tools/TerminalPanel");
  return { default: module.TerminalPanel };
});

function getWorkspaceName(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? "未选择工作区";
}

function TerminalPanelSlot() {
  const open = useUiStore((state) => state.terminalPanelOpen);
  const [activated, setActivated] = useState(open);

  useEffect(() => {
    if (open) setActivated(true);
  }, [open]);

  if (!activated) return null;
  return <Suspense fallback={null}><LazyTerminalPanel /></Suspense>;
}

export function AgentTopBar() {
  const browserOpen = useBrowserStore(state => state.open);
  const showBrowser = useBrowserStore(state => state.show);
  const closeBrowser = useBrowserStore(state => state.close);
  const status = useAgentStore((state) => state.processStatus);
  const agentView = useUiStore((state) => state.moduleViews.agent);
  const setAgentView = useUiStore((state) => state.setAgentView);
  const toggleAgentReview = useUiStore((state) => state.toggleAgentReview);
  const reviewOpen = useUiStore((state) => state.moduleViews.agent === "review" && state.agentDetailPanelOpen);
  const activeFilePath = useWorkspaceStore((state) => state.activeFilePath);
  const terminalAvailable = agentView === "activity" || agentView === "files" || agentView === "review";
  const section = agentView === "files"
    ? activeFilePath ?? "项目文件"
    : agentView === "review"
      ? "代码审查"
      : agentView === "mcp"
        ? "资源中心"
        : agentView === "memory"
          ? "Pi 上下文"
          : "会话";

  return <TopBar heading={getWorkspaceName(status.cwd)} section={section} terminalAvailable={terminalAvailable} tools={
    <>
      <HintButton className={`topbar-icon-button ${agentView === "files" ? "active" : ""}`} type="button" hint={agentView === "files" ? "关闭项目文件" : "项目文件"} aria-label="项目文件" aria-pressed={agentView === "files"} onClick={() => setAgentView(agentView === "files" ? "activity" : "files")}><Files size={16} /></HintButton>
      <HintButton className={`topbar-icon-button ${reviewOpen && !browserOpen ? "active" : ""}`} type="button" hint={reviewOpen && !browserOpen ? "关闭代码审查" : "打开代码审查"} aria-label="代码审查" aria-pressed={reviewOpen && !browserOpen} onClick={() => { closeBrowser(); if (browserOpen) setAgentView("review"); else toggleAgentReview(); }}><GitPullRequest size={16} /></HintButton>
      <HintButton className={`topbar-icon-button ${browserOpen ? "active" : ""}`} type="button" hint={browserOpen ? "隐藏浏览器" : "打开浏览器"} aria-label="浏览器" aria-pressed={browserOpen} onClick={() => browserOpen ? closeBrowser() : showBrowser()}><Globe size={16} /></HintButton>
    </>
  } />;
}

export function AgentWorkspace() {
  const agentView = useUiStore((state) => state.moduleViews.agent);
  let primary: ReactNode;
  let afterTerminal: ReactNode = null;

  if (agentView === "mcp") primary = <ResourceCenterPanel />;
  else if (agentView === "memory") primary = <MemoryPanel />;
  else if (agentView === "files") primary = <WorkspaceEditor />;
  else {
    primary = <><AgentStatusStrip /><ChatPanel /></>;
    afterTerminal = <>
      <ExtensionWidgets placement="aboveEditor" />
      <Composer />
      <ExtensionWidgets placement="belowEditor" />
    </>;
  }
  const terminalVisible = agentView === "activity" || agentView === "files" || agentView === "review";

  return (
    <>
      <Fragment key="primary">{primary}</Fragment>
      <div className="terminal-persistence-slot" hidden={!terminalVisible}>
        <TerminalPanelSlot />
      </div>
      <Fragment key="after-terminal">{afterTerminal}</Fragment>
    </>
  );
}

export function AgentDetailPanel() {
  const agentView = useUiStore((state) => state.moduleViews.agent);
  const toggleAgentReview = useUiStore((state) => state.toggleAgentReview);

  return agentView === "review"
    ? <GitReview onClose={toggleAgentReview} />
    : <DetailPanel />;
}

export function AgentOverlays() {
  return <><SessionOverviewDialog /><ExtensionDialog /></>;
}

export { AgentSidebar } from "./AgentSidebar";
