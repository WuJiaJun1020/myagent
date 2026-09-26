import { TopBar } from "../../components/layout/TopBar";
import { InterviewContextPanel } from "../../features/interview/InterviewContextPanel";
import { InterviewWorkspace } from "../../features/interview/InterviewWorkspace";
import { useUiStore } from "../../stores/ui-store";

export { InterviewSidebar } from "./InterviewSidebar";

export function InterviewTopBar() {
  const view = useUiStore((state) => state.moduleViews.interview);
  const focused = view === "algorithms" || view === "question-bank";
  return (
    <TopBar
      heading="Interview Studio"
      section={view === "algorithms" ? "算法练习" : view === "question-bank" ? "面试问答题库"
        : view === "dashboard" ? "新建面试" : view === "records" ? "面试记录" : "智能面试"}
      detailAvailable={!focused}
    />
  );
}

export function InterviewModuleWorkspace() {
  return <InterviewWorkspace />;
}

export function InterviewModuleDetailPanel() {
  return <InterviewContextPanel />;
}
