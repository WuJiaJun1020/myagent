import { Maximize2, Minimize2, Moon, PanelLeft, PanelRight, Settings, Square, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { TooltipIconButton } from "../ui/tooltip-icon-button";
import { useSettingsStore } from "../../stores/settings-store";
import { useUiStore } from "../../stores/ui-store";

const menuLabels = ["文件", "编辑", "视图", "帮助"];

/** Renderer-owned title bar area for the Windows title-bar overlay. */
export function AppChrome() {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const detailPanelOpen = useUiStore((state) => state.detailPanelOpen);
  const toggleDetailPanel = useUiStore((state) => state.toggleDetailPanel);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.piDesktop.getWindowMaximized().then(setMaximized).catch(() => undefined);
    return window.piDesktop.onWindowMaximized(setMaximized);
  }, []);

  return (
    <header className="app-chrome">
      <TooltipIconButton
        className={`app-chrome-sidebar-toggle ${sidebarOpen ? "active" : ""}`}
        label={sidebarOpen ? "隐藏侧边栏" : "显示侧边栏"}
        onClick={toggleSidebar}
      >
        <PanelLeft size={17} />
      </TooltipIconButton>
      <nav className="app-menu" aria-label="应用菜单">
        {menuLabels.map((label) => <span key={label}>{label}</span>)}
      </nav>
      <div className="app-chrome-actions" aria-label="窗口工具">
        <TooltipIconButton
          className="app-chrome-icon-button"
          label={resolvedTheme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </TooltipIconButton>
        <TooltipIconButton className="app-chrome-icon-button" label="打开设置" onClick={() => setSettingsOpen(true)}>
          <Settings size={16} />
        </TooltipIconButton>
        <TooltipIconButton
          className={`app-chrome-icon-button ${detailPanelOpen ? "active" : ""}`}
          label={detailPanelOpen ? "隐藏详情面板" : "显示详情面板"}
          onClick={toggleDetailPanel}
        >
          <PanelRight size={17} />
        </TooltipIconButton>
      </div>
      <div className="app-window-controls" aria-label="窗口控制">
        <button type="button" className="app-window-control" aria-label="最小化窗口" title="最小化" onClick={() => void window.piDesktop.minimizeWindow()}>
          <Minimize2 size={16} />
        </button>
        <button
          type="button"
          className="app-window-control"
          aria-label={maximized ? "还原窗口" : "最大化窗口"}
          title={maximized ? "还原" : "最大化"}
          onClick={() => void window.piDesktop.toggleWindowMaximize().then(setMaximized)}
        >
          {maximized ? <Square size={13} /> : <Maximize2 size={15} />}
        </button>
        <button type="button" className="app-window-control close" aria-label="关闭窗口" title="关闭" onClick={() => void window.piDesktop.closeWindow()}>
          <X size={17} />
        </button>
      </div>
    </header>
  );
}
