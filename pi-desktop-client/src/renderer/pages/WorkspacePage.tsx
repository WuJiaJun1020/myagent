import { useRef } from "react";
import type { ProductModuleId } from "../../platform/shared/product-module";
import { AppChrome } from "../components/layout/AppChrome";
import { MainLayout } from "../components/layout/MainLayout";
import { Sidebar } from "../components/layout/Sidebar";
import { ProviderSettingsDialog } from "../features/settings/ProviderSettingsDialog";
import { SettingsPage } from "../features/settings/SettingsPage";
import { RendererModuleSlot } from "../modules/RendererModuleSlot";
import { getRendererModule, rendererModuleDefinitions } from "../modules/renderer-module-registry";
import { useUiStore } from "../stores/ui-store";

export function WorkspacePage() {
  const activeModule = useUiStore((state) => state.activeModule);
  const moduleViews = useUiStore((state) => state.moduleViews);
  const settingsOpen = useUiStore((state) => state.settingsOpen);
  const definition = getRendererModule(activeModule);
  const activatedWorkspaces = useRef(new Set<ProductModuleId>());
  if (definition.keepWorkspaceAlive) activatedWorkspaces.current.add(activeModule);
  const activeView = moduleViews[activeModule];
  const layout = definition.resolveLayout(activeView);
  const ModuleSidebar = definition.Sidebar;
  const ModuleTopBar = definition.TopBar;
  const ModuleDetailPanel = definition.DetailPanel;
  const ModuleOverlays = definition.Overlays;
  const mountedWorkspaces = rendererModuleDefinitions.filter((candidate) => (
    candidate.id === activeModule
    || (candidate.keepWorkspaceAlive && activatedWorkspaces.current.has(candidate.id))
  ));

  return (
    <div className="app-frame">
      <AppChrome sidebarAvailable={!layout.sidebarSuppressed} />
      <MainLayout
        inactive={settingsOpen}
        topbarSuppressed={layout.topbarSuppressed}
        sidebarSuppressed={layout.sidebarSuppressed}
        detailSuppressed={layout.detailSuppressed}
        sidebar={(
          <Sidebar>
            <RendererModuleSlot key={`${activeModule}:sidebar`} moduleId={activeModule} slot="sidebar">
              <ModuleSidebar />
            </RendererModuleSlot>
          </Sidebar>
        )}
        topbar={(
          <RendererModuleSlot key={`${activeModule}:topbar`} moduleId={activeModule} slot="topbar">
            <ModuleTopBar />
          </RendererModuleSlot>
        )}
        activity={(
          <div className="renderer-module-workspace-stack">
            {mountedWorkspaces.map((candidate) => {
              const ModuleWorkspace = candidate.Workspace;
              return (
                <div
                  className="renderer-module-workspace"
                  hidden={candidate.id !== activeModule}
                  key={candidate.id}
                >
                  <RendererModuleSlot moduleId={candidate.id} slot="workspace">
                    <ModuleWorkspace />
                  </RendererModuleSlot>
                </div>
              );
            })}
          </div>
        )}
        detail={(
          <RendererModuleSlot key={`${activeModule}:detail`} moduleId={activeModule} slot="detail">
            <ModuleDetailPanel />
          </RendererModuleSlot>
        )}
        detailVariant={layout.detailVariant}
      />
      <SettingsPage />
      <ProviderSettingsDialog />
      {ModuleOverlays && (
        <RendererModuleSlot key={`${activeModule}:active-overlays`} moduleId={activeModule} slot="overlays">
          <ModuleOverlays />
        </RendererModuleSlot>
      )}
      {rendererModuleDefinitions.map((candidate) => {
        const PersistentOverlays = candidate.PersistentOverlays;
        return PersistentOverlays ? (
          <RendererModuleSlot key={`${candidate.id}:overlays`} moduleId={candidate.id} slot="overlays">
            <PersistentOverlays />
          </RendererModuleSlot>
        ) : null;
      })}
    </div>
  );
}
