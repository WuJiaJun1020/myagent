import type {
  InterviewCreateRequest,
  InterviewChatRequest,
  CandidateTurnRequest,
  CandidateTurnResult,
  CandidateTurnProgress,
  InterviewChatModelInfo,
  InterviewAlgorithmDraftRequest,
  InterviewAlgorithmSubmitRequest,
  InterviewScoreRequest,
  InterviewRecord,
  InterviewSession,
  InterviewSnapshot,
  JobCollectionProgress,
  JobCollectionRequest,
  JobCollectionResult,
  JobLibrarySnapshot,
} from "../../shared/contracts/interview";

export interface InterviewGateway {
  getSnapshot(): Promise<InterviewSnapshot>;
  getInterview(id: string): Promise<InterviewRecord | null>;
  getInterviewSession(id: string): Promise<InterviewSession | null>;
  createInterview(request: InterviewCreateRequest): Promise<InterviewRecord>;
  deleteInterview(id: string): Promise<InterviewSnapshot>;
  finishInterview(id: string): Promise<InterviewSession>;
  scoreInterview(request: InterviewScoreRequest): Promise<InterviewSession>;
  sendChat(request: InterviewChatRequest): Promise<InterviewSession>;
  simulateCandidateTurn(request: CandidateTurnRequest, onCandidateReady?: (progress: CandidateTurnProgress) => void): Promise<CandidateTurnResult>;
  startAlgorithmExam(id: string): Promise<InterviewSession>;
  saveAlgorithmDraft(request: InterviewAlgorithmDraftRequest): Promise<InterviewSession>;
  submitAlgorithmCode(request: InterviewAlgorithmSubmitRequest): Promise<InterviewSession>;
  getChatModelInfo(): Promise<InterviewChatModelInfo>;
  getJobLibrary(): Promise<JobLibrarySnapshot>;
  collectJobs(request: JobCollectionRequest): Promise<JobCollectionResult>;
  onJobCollectionProgress(listener: (progress: JobCollectionProgress) => void): () => void;
}

class DesktopInterviewGateway implements InterviewGateway {
  getSnapshot(): Promise<InterviewSnapshot> {
    return window.piDesktop.getInterviewSnapshot();
  }

  getInterview(id: string): Promise<InterviewRecord | null> {
    return window.piDesktop.getInterview(id);
  }

  getInterviewSession(id: string): Promise<InterviewSession | null> {
    return window.piDesktop.getInterviewSession(id);
  }

  createInterview(request: InterviewCreateRequest): Promise<InterviewRecord> {
    return window.piDesktop.createInterview(request);
  }

  deleteInterview(id: string): Promise<InterviewSnapshot> {
    return window.piDesktop.deleteInterview(id);
  }

  finishInterview(id: string): Promise<InterviewSession> {
    return window.piDesktop.finishInterview(id);
  }

  scoreInterview(request: InterviewScoreRequest): Promise<InterviewSession> {
    return window.piDesktop.scoreInterview(request);
  }

  sendChat(request: InterviewChatRequest): Promise<InterviewSession> {
    return window.piDesktop.sendInterviewChat(request);
  }

  async simulateCandidateTurn(request: CandidateTurnRequest,
    onCandidateReady?: (progress: CandidateTurnProgress) => void): Promise<CandidateTurnResult> {
    const unsubscribe = onCandidateReady
      ? window.piDesktop.onInterviewCandidateTurnProgress((progress) => {
        if (progress.interviewId === request.interviewId && progress.operationId === request.operationId) {
          onCandidateReady(progress);
        }
      }) : undefined;
    try {
      return await window.piDesktop.simulateInterviewCandidateTurn(request);
    } finally {
      unsubscribe?.();
    }
  }

  startAlgorithmExam(id: string): Promise<InterviewSession> {
    return window.piDesktop.startInterviewAlgorithmExam(id);
  }

  saveAlgorithmDraft(request: InterviewAlgorithmDraftRequest): Promise<InterviewSession> {
    return window.piDesktop.saveInterviewAlgorithmDraft(request);
  }

  submitAlgorithmCode(request: InterviewAlgorithmSubmitRequest): Promise<InterviewSession> {
    return window.piDesktop.submitInterviewAlgorithmCode(request);
  }

  getChatModelInfo(): Promise<InterviewChatModelInfo> {
    return window.piDesktop.getInterviewChatModelInfo();
  }

  getJobLibrary(): Promise<JobLibrarySnapshot> {
    return window.piDesktop.getJobLibrary();
  }

  collectJobs(request: JobCollectionRequest): Promise<JobCollectionResult> {
    return window.piDesktop.collectJobs(request);
  }

  onJobCollectionProgress(listener: (progress: JobCollectionProgress) => void): () => void {
    return window.piDesktop.onJobCollectionProgress(listener);
  }
}

export const interviewGateway: InterviewGateway = new DesktopInterviewGateway();
