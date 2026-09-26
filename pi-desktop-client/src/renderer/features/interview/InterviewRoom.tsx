import { ArrowLeft, ClipboardCheck, FileText, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { useInterviewStore } from "../../stores/interview-store";
import { useUiStore } from "../../stores/ui-store";
import { InterviewConversation } from "./InterviewConversation";
import { InterviewAlgorithmExam } from "./InterviewAlgorithmExam";

export function InterviewRoom() {
  const selectedId = useInterviewStore((state) => state.selectedId);
  const session = useInterviewStore((state) => state.session);
  const loading = useInterviewStore((state) => state.sessionLoading);
  const error = useInterviewStore((state) => state.error);
  const openInterview = useInterviewStore((state) => state.openInterview);
  const setInterviewView = useUiStore((state) => state.setInterviewView);

  useEffect(() => {
    if (selectedId) void openInterview(selectedId);
  }, [openInterview, selectedId]);

  if (session?.interview.id === selectedId
    && (session.interview.status === "draft" || session.interview.status === "ready"
      || session.interview.status === "interviewing" || session.interview.status === "completed")) {
    if (session.interview.status !== "completed"
      && (session.algorithm?.status === "pending" || session.algorithm?.status === "active")) {
      return <InterviewAlgorithmExam key={selectedId} session={session} />;
    }
    return <InterviewConversation key={selectedId} session={session} />;
  }

  return <div className="interview-page-scroll"><main className="interview-room">
    <button className="interview-room-back" type="button" onClick={() => setInterviewView("records")}>
      <ArrowLeft size={15} />返回面试记录
    </button>
    {!selectedId ? <section className="interview-room-empty">
      <ClipboardCheck size={24} /><strong>尚未选择面试</strong><p>请返回面试记录，选择一场面试继续。</p>
    </section> : loading && !session ? <section className="interview-room-loading" aria-live="polite">
      <LoaderCircle className="spin" size={19} />正在读取面试状态…
    </section> : !session ? <section className="interview-room-empty" role="alert">
      <FileText size={23} /><strong>无法打开这场面试</strong><p>{error ?? "面试记录不存在或暂时不可用。"}</p>
      <button type="button" onClick={() => void openInterview(selectedId)}><RotateCcw size={14} />重新读取</button>
    </section> : <section className="interview-room-empty">
      <ClipboardCheck size={23} /><strong>当前面试暂不能继续对话</strong>
      <p>该场面试处于“{session.interview.status}”状态。</p>
    </section>}
  </main></div>;
}
