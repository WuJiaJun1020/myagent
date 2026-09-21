import { Minus, PanelLeft, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { TooltipIconButton } from "../ui/tooltip-icon-button";
import { useUiStore } from "../../stores/ui-store";

const menuLabels = ["文件", "编辑", "视图", "帮助"];

type AppChromeProps = {
  sidebarAvailable?: boolean;
};

/** Renderer-owned title bar area for the Windows title-bar overlay. */
export function AppChrome({ sidebarAvailable = true }: AppChromeProps) {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.piDesktop.getWindowMaximized().then(setMaximized).catch(() => undefined);
    return window.piDesktop.onWindowMaximized(setMaximized);
  }, []);

  return (
    <header className="app-chrome">
      {sidebarAvailable ? (
        <TooltipIconButton
          className={`app-chrome-sidebar-toggle ${sidebarOpen ? "active" : ""}`}
          label={sidebarOpen ? "隐藏侧边栏" : "显示侧边栏"}
          onClick={toggleSidebar}
        >
          <PanelLeft size={17} />
        </TooltipIconButton>
      ) : <span className="app-chrome-sidebar-placeholder" aria-hidden="true" />}
      <nav className="app-menu" aria-label="应用菜单">
        {menuLabels.map((label) => <span key={label}>{label}</span>)}
      </nav>
      <div className="app-window-controls" aria-label="窗口控制">
        <button type="button" className="app-window-control" aria-label="最小化窗口" title="最小化" onClick={() => void window.piDesktop.minimizeWindow()}>
          <Minus size={16} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className="app-window-control"
          aria-label={maximized ? "还原窗口" : "最大化窗口"}
          title={maximized ? "还原" : "最大化"}
          onClick={() => void window.piDesktop.toggleWindowMaximize().then(setMaximized)}
        >
          <Square size={13} strokeWidth={1.6} />
        </button>
        <button type="button" className="app-window-control close" aria-label="关闭窗口" title="关闭" onClick={() => void window.piDesktop.closeWindow()}>
          <X size={17} />
        </button>
      </div>
    </header>
  );
}
