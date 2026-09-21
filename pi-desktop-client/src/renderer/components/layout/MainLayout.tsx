import { useRef, type CSSProperties, type ReactNode } from "react";
import { useSettingsStore } from "../../stores/settings-store";
import { useUiStore } from "../../stores/ui-store";
import { PanelResizeHandle } from "./PanelResizeHandle";

type MainLayoutProps = {
  sidebar: ReactNode;
  topbar: ReactNode;
  activity: ReactNode;
  detail: ReactNode;
  detailVariant?: "default" | "review";
  topbarSuppressed?: boolean;
  sidebarSuppressed?: boolean;
  detailSuppressed?: boolean;
  inactive?: boolean;
};

export function MainLayout({
  sidebar,
  topbar,
  activity,
  detail,
  detailVariant = "default",
  topbarSuppressed = false,
  sidebarSuppressed = false,
  detailSuppressed = false,
  inactive = false,
}: MainLayoutProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const detailPanelOpen = useUiStore((state) => state.detailPanelOpen);
  const sidebarWidth = useSettingsStore((state) => state.sidebarWidth);
  const detailPanelWidth = useSettingsStore((state) => state.detailPanelWidth);
  const reviewPanelWidth = useSettingsStore((state) => state.reviewPanelWidth);
  const setSidebarWidth = useSettingsStore((state) => state.setSidebarWidth);
  const setDetailPanelWidth = useSettingsStore((state) => state.setDetailPanelWidth);
  const setReviewPanelWidth = useSettingsStore((state) => state.setReviewPanelWidth);
  const effectiveSidebarOpen = sidebarOpen && !sidebarSuppressed;
  const effectiveDetailPanelOpen = detailPanelOpen && !detailSuppressed;
  const layoutStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
    "--detail-panel-width": `${detailPanelWidth}px`,
    "--review-panel-width": `${reviewPanelWidth}px`,
  } as CSSProperties;

  return (
    <div
      ref={shellRef}
      className="workspace-shell"
      data-sidebar-open={effectiveSidebarOpen}
      data-detail-open={effectiveDetailPanelOpen}
      data-detail-variant={detailVariant}
      data-inactive={inactive}
      aria-hidden={inactive}
      style={layoutStyle}
    >
      {effectiveSidebarOpen && (
        <>
          <div className="sidebar-slot">{sidebar}</div>
          <PanelResizeHandle
            label="调整侧边栏"
            value={sidebarWidth}
            min={196}
            max={360}
            direction="right"
            previewTarget={shellRef}
            previewProperty="--sidebar-width"
            onCommit={setSidebarWidth}
          />
        </>
      )}
      <div className="workspace-body" data-topbar-open={!topbarSuppressed}>
        {!topbarSuppressed && topbar}
        <div className="workspace-columns">
          <main className="activity-column">{activity}</main>
          {effectiveDetailPanelOpen && (
            <>
              <PanelResizeHandle
                label={detailVariant === "review" ? "调整代码审查面板" : "调整详情面板"}
                value={detailVariant === "review" ? reviewPanelWidth : detailPanelWidth}
                min={detailVariant === "review" ? 480 : 260}
                max={detailVariant === "review" ? 1_100 : 520}
                direction="left"
                oppositeMin={detailVariant === "review" ? 280 : 460}
                previewTarget={shellRef}
                previewProperty={detailVariant === "review" ? "--review-panel-width" : "--detail-panel-width"}
                onCommit={detailVariant === "review" ? setReviewPanelWidth : setDetailPanelWidth}
              />
              <div className="detail-slot">{detail}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
