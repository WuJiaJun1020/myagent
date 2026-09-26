import { create } from "zustand";
import type {
  InterviewCreateRequest,
  InterviewChatSettings,
  InterviewChatPrompts,
  InterviewDirectorConfig,
  CandidateTurnResult,
  InterviewAlgorithmSubmitRequest,
  InterviewListItem,
  InterviewRecord,
  InterviewSession,
  InterviewSnapshot,
  InterviewStatus,
} from "../../shared/contracts/interview";
import { interviewGateway } from "../services/interview-gateway";
import { clearInterviewChatSettings } from "../features/interview/interview-chat-preferences";
import { clearInterviewChatPrompts } from "../features/interview/interview-prompt-preferences";
import { clearInterviewCandidatePreferences } from "../features/interview/interview-candidate-preferences";
import { clearInterviewDirectorPreferences } from "../features/interview/interview-director-preferences";
import { clearInterviewScorePrompt, readInterviewScorePrompt, readInterviewScoreSettings } from "../features/interview/interview-score-preferences";

const EMPTY_COUNTS: Record<InterviewStatus, number> = {
  draft: 0,
  preparing: 0,
  ready: 0,
  interviewing: 0,
  generating_report: 0,
  completed: 0,
};

type InterviewStore = InterviewSnapshot & {
  initialized: boolean;
  loading: boolean;
  mutation: boolean;
  error: string | null;
  selectedId: string | null;
  session: InterviewSession | null;
  sessionLoading: boolean;
  chattingInterviewId: string | null;
  autoStartInterviewId: string | null;
  algorithmSubmittingId: string | null;
  scoringInterviewId: string | null;
  initialize: (force?: boolean) => Promise<void>;
  createInterview: (request: InterviewCreateRequest) => Promise<InterviewRecord>;
  deleteInterview: (id: string) => Promise<void>;
  finishInterview: (id: string) => Promise<InterviewSession>;
  scoreInterview: (id: string) => Promise<InterviewSession>;
  consumeAutoStart: (id: string) => void;
  selectInterview: (id: string | null) => void;
  openInterview: (id: string) => Promise<InterviewSession | null>;
  sendChat: (id: string, kind: "start" | "reply", content: string | undefined,
    settings: InterviewChatSettings, prompts: InterviewChatPrompts, director?: InterviewDirectorConfig) => Promise<InterviewSession>;
  simulateCandidateTurn: (id: string, candidateSettings: InterviewChatSettings, candidatePrompt: string,
    candidateErrorRate: number,
    interviewerSettings: InterviewChatSettings, interviewerPrompts: InterviewChatPrompts,
    director?: InterviewDirectorConfig) => Promise<CandidateTurnResult>;
  startAlgorithmExam: (id: string) => Promise<InterviewSession>;
  submitAlgorithmCode: (request: InterviewAlgorithmSubmitRequest) => Promise<InterviewSession>;
};

function replaceOrInsert(interviews: InterviewListItem[], interview: InterviewListItem): InterviewListItem[] {
  return [interview, ...interviews.filter((item) => item.id !== interview.id)];
}

function reconcileInterview(
  interviews: InterviewListItem[],
  counts: Record<InterviewStatus, number>,
  interview: InterviewListItem,
): Pick<InterviewSnapshot, "interviews" | "counts"> {
  const previous = interviews.find((item) => item.id === interview.id);
  const nextCounts = { ...counts };
  if (!previous) nextCounts[interview.status] += 1;
  else if (previous.status !== interview.status) {
    nextCounts[previous.status] = Math.max(0, nextCounts[previous.status] - 1);
    nextCounts[interview.status] += 1;
  }
  return { interviews: replaceOrInsert(interviews, interview), counts: nextCounts };
}

function createOperationId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `interview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let sessionLoadSequence = 0;

export const useInterviewStore = create<InterviewStore>((set, get) => ({
  interviews: [],
  counts: { ...EMPTY_COUNTS },
  initialized: false,
  loading: false,
  mutation: false,
  error: null,
  selectedId: null,
  session: null,
  sessionLoading: false,
  chattingInterviewId: null,
  autoStartInterviewId: null,
  algorithmSubmittingId: null,
  scoringInterviewId: null,
  initialize: async (force = false) => {
    if (get().loading || (get().initialized && !force)) return;
    set({ loading: true, error: null });
    try {
      const snapshot = await interviewGateway.getSnapshot();
      set((state) => ({
        ...snapshot,
        initialized: true,
        loading: false,
        selectedId: state.selectedId && snapshot.interviews.some((item) => item.id === state.selectedId)
          ? state.selectedId
          : snapshot.interviews[0]?.id ?? null,
      }));
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },
  createInterview: async (request) => {
    if (get().mutation) throw new Error("正在保存面试草稿");
    set({ mutation: true, error: null });
    try {
      const interview = await interviewGateway.createInterview(request);
      set((state) => ({
        ...reconcileInterview(state.interviews, state.counts, interview),
        selectedId: interview.id,
        autoStartInterviewId: interview.id,
        session: null,
        mutation: false,
      }));
      return interview;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ mutation: false, error: message });
      throw error;
    }
  },
  deleteInterview: async (id) => {
    if (get().mutation) throw new Error("正在修改面试记录");
    set({ mutation: true, error: null });
    try {
      const snapshot = await interviewGateway.deleteInterview(id);
      clearInterviewChatSettings(id);
      clearInterviewChatPrompts(id);
      clearInterviewCandidatePreferences(id);
      clearInterviewDirectorPreferences(id);
      clearInterviewScorePrompt(id);
      if (get().selectedId === id) sessionLoadSequence += 1;
      set((state) => ({
        ...snapshot,
        selectedId: state.selectedId === id ? snapshot.interviews[0]?.id ?? null : state.selectedId,
        session: state.session?.interview.id === id ? null : state.session,
        autoStartInterviewId: state.autoStartInterviewId === id ? null : state.autoStartInterviewId,
        sessionLoading: state.selectedId === id ? false : state.sessionLoading,
        mutation: false,
      }));
    } catch (error) {
      set({ mutation: false, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },
  finishInterview: async (id) => {
    if (get().mutation || get().chattingInterviewId === id) throw new Error("面试正在处理中，请稍候再结束");
    set({ mutation: true, error: null });
    try {
      const session = await interviewGateway.finishInterview(id);
      set((state) => ({ ...reconcileInterview(state.interviews, state.counts, session.interview),
        session: state.selectedId === id ? session : state.session,
        autoStartInterviewId: state.autoStartInterviewId === id ? null : state.autoStartInterviewId,
        mutation: false }));
      return session;
    } catch (error) {
      set({ mutation: false, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },
  scoreInterview: async (id) => {
    if (get().scoringInterviewId === id) throw new Error("本场面试正在评分");
    set({ scoringInterviewId: id });
    try {
      const session = await interviewGateway.scoreInterview({ interviewId: id, operationId: createOperationId(),
        settings: readInterviewScoreSettings(id), prompt: readInterviewScorePrompt(id) });
      set((state) => ({ session: state.selectedId === id ? session : state.session, scoringInterviewId: null }));
      return session;
    } catch (error) {
      set({ scoringInterviewId: null });
      throw error;
    }
  },
  consumeAutoStart: (id) => {
    if (get().autoStartInterviewId === id) set({ autoStartInterviewId: null });
  },
  selectInterview: (selectedId) => {
    if (get().selectedId === selectedId) return;
    sessionLoadSequence += 1;
    set({ selectedId, session: null, sessionLoading: false, error: null });
  },
  openInterview: async (id) => {
    const requestSequence = ++sessionLoadSequence;
    set({ selectedId: id, session: null, sessionLoading: true, error: null });
    try {
      const session = await interviewGateway.getInterviewSession(id);
      if (requestSequence !== sessionLoadSequence || get().selectedId !== id) return session;
      if (!session) {
        set({ sessionLoading: false, error: "找不到这场面试，它可能已被删除。" });
        return null;
      }
      set((state) => ({
        ...reconcileInterview(state.interviews, state.counts, session.interview),
        session,
        sessionLoading: false,
      }));
      return session;
    } catch (error) {
      if (requestSequence === sessionLoadSequence && get().selectedId === id) {
        set({ sessionLoading: false, error: error instanceof Error ? error.message : String(error) });
      }
      return null;
    }
  },
  sendChat: async (id, kind, content, settings, prompts, director) => {
    if (get().chattingInterviewId) throw new Error("模型正在回答，请稍候");
    const operationId = createOperationId();
    set({ chattingInterviewId: id, error: null });
    try {
      const session = await interviewGateway.sendChat({ interviewId: id, operationId, kind,
        ...(content ? { content } : {}), settings, prompts, ...(director ? { director } : {}) });
      set((state) => ({ ...reconcileInterview(state.interviews, state.counts, session.interview),
        session: state.selectedId === id ? session : state.session, chattingInterviewId: null }));
      return session;
    } catch (error) {
      let recovered: InterviewSession | null = null;
      try {
        recovered = await interviewGateway.getInterviewSession(id);
      } catch {
        // Keep the original model error if refreshing debug records also fails.
      }
      set((state) => ({
        ...(recovered ? reconcileInterview(state.interviews, state.counts, recovered.interview) : {}),
        session: state.selectedId === id && recovered ? recovered : state.session,
        chattingInterviewId: null,
        error: error instanceof Error ? error.message : String(error),
      }));
      throw error;
    }
  },
  simulateCandidateTurn: async (id, candidateSettings, candidatePrompt, candidateErrorRate,
    interviewerSettings, interviewerPrompts, director) => {
    if (get().chattingInterviewId) throw new Error("模型正在回答，请稍候");
    const operationId = createOperationId();
    set({ chattingInterviewId: id, error: null });
    try {
      const result = await interviewGateway.simulateCandidateTurn({ interviewId: id, operationId,
          candidateSettings, candidatePrompt, candidateErrorRate, interviewerSettings, interviewerPrompts,
          ...(director ? { director } : {}) }, (progress) => {
        set((state) => ({ ...reconcileInterview(state.interviews, state.counts, progress.session.interview),
          session: state.selectedId === id ? progress.session : state.session }));
      });
      set((state) => ({ ...reconcileInterview(state.interviews, state.counts, result.session.interview),
        session: state.selectedId === id ? result.session : state.session, chattingInterviewId: null,
        error: result.status === "interviewer_failed" ? result.error ?? "面试官回复失败" : null }));
      return result;
    } catch (error) {
      let recovered: InterviewSession | null = null;
      try { recovered = await interviewGateway.getInterviewSession(id); } catch { /* Preserve the original failure. */ }
      set((state) => ({
        ...(recovered ? reconcileInterview(state.interviews, state.counts, recovered.interview) : {}),
        session: state.selectedId === id && recovered ? recovered : state.session,
        chattingInterviewId: null,
        error: error instanceof Error ? error.message : String(error),
      }));
      throw error;
    }
  },
  startAlgorithmExam: async (id) => {
    const session = await interviewGateway.startAlgorithmExam(id);
    set((state) => ({ ...reconcileInterview(state.interviews, state.counts, session.interview),
      session: state.selectedId === id ? session : state.session }));
    return session;
  },
  submitAlgorithmCode: async (request) => {
    if (get().algorithmSubmittingId) throw new Error("算法代码正在判题，请稍候");
    set({ algorithmSubmittingId: request.interviewId });
    try {
      const session = await interviewGateway.submitAlgorithmCode(request);
      set((state) => ({ ...reconcileInterview(state.interviews, state.counts, session.interview),
        session: state.selectedId === request.interviewId ? session : state.session,
        algorithmSubmittingId: null }));
      return session;
    } catch (error) {
      set({ algorithmSubmittingId: null });
      throw error;
    }
  },
}));
