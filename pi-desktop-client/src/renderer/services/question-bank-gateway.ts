import type {
  QuestionBankFavoriteRequest,
  QuestionBankFavoriteResult,
  QuestionBankListQuery,
  QuestionBankListResult,
  QuestionBankQuestionDetail,
  QuestionBankSnapshot,
} from "../../shared/contracts/interview-question-bank";

export interface QuestionBankGateway {
  getSnapshot(): Promise<QuestionBankSnapshot>;
  listQuestions(query: QuestionBankListQuery): Promise<QuestionBankListResult>;
  getQuestion(id: string): Promise<QuestionBankQuestionDetail | null>;
  setFavorite(request: QuestionBankFavoriteRequest): Promise<QuestionBankFavoriteResult>;
}

class DesktopQuestionBankGateway implements QuestionBankGateway {
  getSnapshot(): Promise<QuestionBankSnapshot> {
    return window.piDesktop.getQuestionBankSnapshot();
  }

  listQuestions(query: QuestionBankListQuery): Promise<QuestionBankListResult> {
    return window.piDesktop.listQuestionBankQuestions(query);
  }

  getQuestion(id: string): Promise<QuestionBankQuestionDetail | null> {
    return window.piDesktop.getQuestionBankQuestion(id);
  }

  setFavorite(request: QuestionBankFavoriteRequest): Promise<QuestionBankFavoriteResult> {
    return window.piDesktop.setQuestionBankFavorite(request);
  }
}

export const questionBankGateway: QuestionBankGateway = new DesktopQuestionBankGateway();
