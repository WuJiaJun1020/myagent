import { ClipboardList, UserRound } from "lucide-react";
import { useEffect } from "react";
import type { InterviewStatus } from "../../../shared/contracts/interview";
import { useInterviewStore } from "../../stores/interview-store";
import { useUiStore } from "../../stores/ui-store";

const STATUS_LABELS: Record<InterviewStatus, string> = {
  draft: "草稿",
  preparing: "准备中",
  ready: "待开始",
  interviewing: "面试中",
  generating_report: "生成报告",
  completed: "已完成",
};

export function InterviewSidebarSummary() {
  const interviews = useInterviewStore((state) => state.interviews);
  const selectedId = useInterviewStore((state) => state.selectedId);
  const loading = useInterviewStore((state) => state.loading);
  const initialize = useInterviewStore((state) => state.initialize);
  const selectInterview = useInterviewStore((state) => state.selectInterview);
  const setInterviewView = useUiStore((state) => state.setInterviewView);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <section className="interview-sidebar" aria-label="面试记录">
      <header><span className="section-label">最近面试</span><small>{interviews.length}</small></header>
      <div className="interview-sidebar-list">
        {loading && interviews.length === 0 ? <p>正在读取面试记录…</p> : interviews.length === 0 ? (
          <div className="interview-sidebar-empty"><ClipboardList size={17} /><span>尚未创建面试</span></div>
        ) : interviews.map((interview) => (
          <button
            className={interview.id === selectedId ? "active" : ""}
            type="button"
            key={interview.id}
            title={interview.title}
            onClick={() => {
              selectInterview(interview.id);
              setInterviewView("session");
            }}
          >
            <UserRound size={14} />
            <span><strong>{interview.title}</strong><small>{interview.candidateName} · {STATUS_LABELS[interview.status]}</small></span>
          </button>
        ))}
      </div>
    </section>
  );
}
