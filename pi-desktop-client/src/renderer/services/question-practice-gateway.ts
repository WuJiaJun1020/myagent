import type {
  QuestionPracticeAbandonRequest,
  QuestionPracticeCompleteReviewRequest,
  QuestionPracticeHistoryQuery,
  QuestionPracticeHistoryResult,
  QuestionPracticeOverview,
  QuestionPracticeSaveDraftRequest,
  QuestionPracticeSaveDraftResult,
  QuestionPracticeSession,
  QuestionPracticeSkipRequest,
  QuestionPracticeStartRequest,
  QuestionPracticeSubmitAnswerRequest,
} from "../../shared/contracts/interview-question-practice";

export interface QuestionPracticeGateway {
  getOverview(): Promise<QuestionPracticeOverview>;
  startSession(request: QuestionPracticeStartRequest): Promise<QuestionPracticeSession>;
  getSession(sessionId: string): Promise<QuestionPracticeSession | null>;
  saveDraft(request: QuestionPracticeSaveDraftRequest): Promise<QuestionPracticeSaveDraftResult>;
  submitAnswer(request: QuestionPracticeSubmitAnswerRequest): Promise<QuestionPracticeSession>;
  completeReview(request: QuestionPracticeCompleteReviewRequest): Promise<QuestionPracticeSession>;
  skipQuestion(request: QuestionPracticeSkipRequest): Promise<QuestionPracticeSession>;
  abandonSession(request: QuestionPracticeAbandonRequest): Promise<QuestionPracticeSession>;
  listHistory(query: QuestionPracticeHistoryQuery): Promise<QuestionPracticeHistoryResult>;
}

class DesktopQuestionPracticeGateway implements QuestionPracticeGateway {
  getOverview(): Promise<QuestionPracticeOverview> {
    return window.piDesktop.getQuestionPracticeOverview();
  }

  startSession(request: QuestionPracticeStartRequest): Promise<QuestionPracticeSession> {
    return window.piDesktop.startQuestionPractice(request);
  }

  getSession(sessionId: string): Promise<QuestionPracticeSession | null> {
    return window.piDesktop.getQuestionPracticeSession(sessionId);
  }

  saveDraft(request: QuestionPracticeSaveDraftRequest): Promise<QuestionPracticeSaveDraftResult> {
    return window.piDesktop.saveQuestionPracticeDraft(request);
  }

  submitAnswer(request: QuestionPracticeSubmitAnswerRequest): Promise<QuestionPracticeSession> {
    return window.piDesktop.submitQuestionPracticeAnswer(request);
  }

  completeReview(request: QuestionPracticeCompleteReviewRequest): Promise<QuestionPracticeSession> {
    return window.piDesktop.completeQuestionPracticeReview(request);
  }

  skipQuestion(request: QuestionPracticeSkipRequest): Promise<QuestionPracticeSession> {
    return window.piDesktop.skipQuestionPractice(request);
  }

  abandonSession(request: QuestionPracticeAbandonRequest): Promise<QuestionPracticeSession> {
    return window.piDesktop.abandonQuestionPractice(request);
  }

  listHistory(query: QuestionPracticeHistoryQuery): Promise<QuestionPracticeHistoryResult> {
    return window.piDesktop.listQuestionPracticeHistory(query);
  }
}

export const questionPracticeGateway: QuestionPracticeGateway = new DesktopQuestionPracticeGateway();
