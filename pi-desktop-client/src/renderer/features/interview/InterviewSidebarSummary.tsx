import { useInterviewDeleteConfirmation } from "./use-interview-delete-confirmation";
import { HintButton } from "../../components/ui/tooltip";
import { ClipboardList, Trash2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
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
  const { confirm, confirmationDialog } = useInterviewDeleteConfirmation();
  const interviews = useInterviewStore((state) => state.interviews);
  const selectedId = useInterviewStore((state) => state.selectedId);
  const loading = useInterviewStore((state) => state.loading);
  const mutation = useInterviewStore((state) => state.mutation);
  const chattingInterviewId = useInterviewStore((state) => state.chattingInterviewId);
  const initialize = useInterviewStore((state) => state.initialize);
  const deleteInterview = useInterviewStore((state) => state.deleteInterview);
  const selectInterview = useInterviewStore((state) => state.selectInterview);
  const setInterviewView = useUiStore((state) => state.setInterviewView);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function removeInterview(id: string, title: string): Promise<void> {
    if (!await confirm(title)) return;
    setDeleteError(null);
    try {
      await deleteInterview(id);
      if (selectedId === id) setInterviewView("records");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <>
      {confirmationDialog}
    <section className="interview-sidebar" aria-label="面试记录">
      <header><span className="section-label">最近面试</span><small>{interviews.length}</small></header>
      <div className="interview-sidebar-list">
        {deleteError && <p className="interview-sidebar-delete-error" role="alert">{deleteError}</p>}
        {loading && interviews.length === 0 ? <p>正在读取面试记录…</p> : interviews.length === 0 ? (
          <div className="interview-sidebar-empty"><ClipboardList size={17} /><span>尚未创建面试</span></div>
        ) : interviews.map((interview) => (
          <div className="interview-sidebar-row" key={interview.id}>
            <HintButton
              className={interview.id === selectedId ? "active" : ""}
              type="button"
              hint={interview.title}
              onClick={() => {
                selectInterview(interview.id);
                setInterviewView("session");
              }}
            >
              <UserRound size={14} />
              <span><strong>{interview.title}</strong><small>{interview.candidateName} · {STATUS_LABELS[interview.status]}</small></span>
            </HintButton>
            <HintButton className="interview-sidebar-delete" type="button" hint={`删除面试：${interview.title}`}
              aria-label={`删除面试：${interview.title}`}
              disabled={mutation || chattingInterviewId === interview.id}
              onClick={() => void removeInterview(interview.id, interview.title)}><Trash2 size={13} /></HintButton>
          </div>
        ))}
      </div>
    </section>
    </>
  );
}
