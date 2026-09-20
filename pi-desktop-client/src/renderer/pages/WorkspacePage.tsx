import { lazy, Suspense, useEffect, useState } from "react";
import { AppChrome } from "../components/layout/AppChrome";
import { MainLayout } from "../components/layout/MainLayout";
import { Sidebar } from "../components/layout/Sidebar";
import { TopBar } from "../components/layout/TopBar";
import { AgentStatusStrip } from "../features/agent/AgentStatusStrip";
import { ExtensionWidgets } from "../features/agent/ExtensionWidgets";
import { ChatPanel } from "../features/chat/ChatPanel";
import { Composer } from "../features/chat/Composer";
import { ExtensionDialog } from "../features/chat/ExtensionDialog";
import { DetailPanel } from "../features/tools/DetailPanel";
import { SettingsPage } from "../features/settings/SettingsPage";
import { ProviderSettingsDialog } from "../features/settings/ProviderSettingsDialog";
import { ResourceCenterPanel } from "../features/resources/ResourceCenterPanel";
import { MemoryPanel } from "../features/resources/MemoryPanel";
import { SessionOverviewDialog } from "../features/sessions/SessionOverviewDialog";
import { WorkspaceEditor } from "../features/files/WorkspaceEditor";
import { GitReview } from "../features/files/GitReview";
import { useUiStore } from "../stores/ui-store";

const LazyTerminalPanel = lazy(async () => {
  const module = await import("../features/tools/TerminalPanel");
  return { default: module.TerminalPanel };
});

function TerminalPanelSlot() {
  const open = useUiStore((state) => state.terminalPanelOpen);
  const [activated, setActivated] = useState(open);

  useEffect(() => {
    if (open) setActivated(true);
  }, [open]);

  if (!activated) return null;
  return <Suspense fallback={null}><LazyTerminalPanel /></Suspense>;
}

export function WorkspacePage() {
  const sidebarView = useUiStore((state) => state.sidebarView);
  const setSidebarView = useUiStore((state) => state.setSidebarView);
  const settingsOpen = useUiStore((state) => state.settingsOpen);
  const resourceView = sidebarView === "mcp" || sidebarView === "memory";
  const fileWorkspaceView = sidebarView === "files";
  const gitReviewView = sidebarView === "review";

  return (
    <div className="app-frame">
      <AppChrome />
      <MainLayout
        inactive={settingsOpen}
        sidebar={<Sidebar />}
        topbar={<TopBar />}
        activity={resourceView ? (sidebarView === "mcp" ? <ResourceCenterPanel /> : <MemoryPanel />) : fileWorkspaceView ? (
          <>
            <WorkspaceEditor />
            <TerminalPanelSlot />
          </>
        ) : (
          <>
            <AgentStatusStrip />
            <ChatPanel />
            <TerminalPanelSlot />
            <ExtensionWidgets placement="aboveEditor" />
            <Composer />
            <ExtensionWidgets placement="belowEditor" />
          </>
        )}
        detail={gitReviewView ? <GitReview onClose={() => setSidebarView("activity")} /> : <DetailPanel />}
        detailVariant={gitReviewView ? "review" : "default"}
      />
      <SettingsPage />
      <ProviderSettingsDialog />
      <SessionOverviewDialog />
      <ExtensionDialog />
    </div>
  );
}
