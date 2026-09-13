import type { CSSProperties, ReactNode } from "react";
import { useSettingsStore } from "../../stores/settings-store";
import { useUiStore } from "../../stores/ui-store";
import { PanelResizeHandle } from "./PanelResizeHandle";

type MainLayoutProps = {
  sidebar: ReactNode;
  topbar: ReactNode;
  activity: ReactNode;
  detail: ReactNode;
  inactive?: boolean;
};

export function MainLayout({ sidebar, topbar, activity, detail, inactive = false }: MainLayoutProps) {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const detailPanelOpen = useUiStore((state) => state.detailPanelOpen);
  const sidebarWidth = useSettingsStore((state) => state.sidebarWidth);
  const detailPanelWidth = useSettingsStore((state) => state.detailPanelWidth);
  const setSidebarWidth = useSettingsStore((state) => state.setSidebarWidth);
  const setDetailPanelWidth = useSettingsStore((state) => state.setDetailPanelWidth);
  const layoutStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
    "--detail-panel-width": `${detailPanelWidth}px`,
  } as CSSProperties;

  return (
    <div
      className="workspace-shell"
      data-sidebar-open={sidebarOpen}
      data-detail-open={detailPanelOpen}
      data-inactive={inactive}
      aria-hidden={inactive}
      style={layoutStyle}
    >
      {sidebarOpen && (
        <>
          <div className="sidebar-slot">{sidebar}</div>
          <PanelResizeHandle
            label="调整侧边栏"
            value={sidebarWidth}
            min={196}
            max={360}
            direction="right"
            onChange={setSidebarWidth}
          />
        </>
      )}
      <div className="workspace-body">
        {topbar}
        <div className="workspace-columns">
          <main className="activity-column">{activity}</main>
          {detailPanelOpen && (
            <>
              <PanelResizeHandle
                label="调整详情面板"
                value={detailPanelWidth}
                min={260}
                max={520}
                direction="left"
                onChange={setDetailPanelWidth}
              />
              <div className="detail-slot">{detail}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
