import { AppChrome } from "../components/layout/AppChrome";
import { MainLayout } from "../components/layout/MainLayout";
import { Sidebar } from "../components/layout/Sidebar";
import { TopBar } from "../components/layout/TopBar";
import { AgentStatusStrip } from "../features/agent/AgentStatusStrip";
import { ChatPanel } from "../features/chat/ChatPanel";
import { Composer } from "../features/chat/Composer";
import { ExtensionDialog } from "../features/chat/ExtensionDialog";
import { DetailPanel } from "../features/tools/DetailPanel";
import { SettingsDialog } from "../features/settings/SettingsDialog";
import { ProviderSettingsDialog } from "../features/settings/ProviderSettingsDialog";
import { McpPanel } from "../features/resources/McpPanel";
import { MemoryPanel } from "../features/resources/MemoryPanel";
import { useAgentEvents } from "../hooks/use-agent-events";
import { useUiStore } from "../stores/ui-store";

export function WorkspacePage() {
  useAgentEvents();
  const sidebarView = useUiStore((state) => state.sidebarView);
  const resourceView = sidebarView === "mcp" || sidebarView === "memory";

  return (
    <div className="app-frame">
      <AppChrome />
      <MainLayout
        sidebar={<Sidebar />}
        topbar={<TopBar />}
        activity={resourceView ? (sidebarView === "mcp" ? <McpPanel /> : <MemoryPanel />) : (
          <>
            <AgentStatusStrip />
            <ChatPanel />
            <Composer />
          </>
        )}
        detail={<DetailPanel />}
        overlay={<><SettingsDialog /><ProviderSettingsDialog /><ExtensionDialog /></>}
      />
    </div>
  );
}
