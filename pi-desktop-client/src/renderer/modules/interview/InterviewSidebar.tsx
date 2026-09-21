import { Settings } from "lucide-react";
import { InterviewSidebarSummary } from "../../features/interview/InterviewSidebarSummary";
import { useUiStore } from "../../stores/ui-store";

export function InterviewSidebar() {
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);

  return (
    <>
      <InterviewSidebarSummary />
      <div className="sidebar-footer">
        <div className="connection running">
          <span className="connection-dot" />
          <span><strong>面试模块已就绪</strong><small>本地数据</small></span>
        </div>
        <button className="icon-button" type="button" aria-label="打开设置" title="设置" onClick={() => setSettingsOpen(true)}>
          <Settings size={15} />
        </button>
      </div>
    </>
  );
}
