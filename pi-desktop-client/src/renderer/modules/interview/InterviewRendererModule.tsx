import { TopBar } from "../../components/layout/TopBar";
import { InterviewContextPanel } from "../../features/interview/InterviewContextPanel";
import { InterviewWorkspace } from "../../features/interview/InterviewWorkspace";
import { useUiStore } from "../../stores/ui-store";

export { InterviewSidebar } from "./InterviewSidebar";

export function InterviewTopBar() {
  const view = useUiStore((state) => state.moduleViews.interview);
  const algorithms = view === "algorithms";
  return (
    <TopBar
      heading="Interview Pilot"
      section={algorithms ? "算法练习" : "智能面试"}
      detailAvailable={!algorithms}
    />
  );
}

export function InterviewModuleWorkspace() {
  return <InterviewWorkspace />;
}

export function InterviewModuleDetailPanel() {
  return <InterviewContextPanel />;
}
