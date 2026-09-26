import type { IpcMain } from "electron";
import type { ProductModuleId } from "../../platform/shared/product-module";
import type { ModelGateway } from "../../platform/shared/ai/model-gateway";
import {
  INTERVIEW_IPC,
  type CandidateTurnProgress,
  type JobCollectionProgress,
} from "../../shared/contracts/interview";
import { QUESTION_BANK_IPC } from "../../shared/contracts/interview-question-bank";
import { QUESTION_PRACTICE_IPC } from "../../shared/contracts/interview-question-practice";
import type { MainModule } from "../../platform/main/main-module-host";
import { sendToRenderer, type RendererWindow } from "../send-to-renderer";
import { InterviewService } from "./interview-service";
import { InterviewChatAgent } from "./interview-chat-agent";
import { InterviewDirectorAgent } from "./interview-director-agent";
import { InterviewScoreAgent } from "./interview-score-agent";
import { LocalInterviewAlgorithmExecutor } from "./interview-algorithm-exam";
import { ElectronJobCollector } from "./job-collector";
import type { KnowledgeInterviewImportCounts, KnowledgeInterviewImportPayload } from "../../shared/contracts/knowledge-studio";

const INTERVIEW_IPC_CHANNELS = [
  INTERVIEW_IPC.getSnapshot,
  INTERVIEW_IPC.getInterview,
  INTERVIEW_IPC.getInterviewSession,
  INTERVIEW_IPC.createInterview,
  INTERVIEW_IPC.deleteInterview,
  INTERVIEW_IPC.finishInterview,
  INTERVIEW_IPC.scoreInterview,
  INTERVIEW_IPC.sendChat,
  INTERVIEW_IPC.simulateCandidateTurn,
  INTERVIEW_IPC.startAlgorithmExam,
  INTERVIEW_IPC.saveAlgorithmDraft,
  INTERVIEW_IPC.submitAlgorithmCode,
  INTERVIEW_IPC.getChatModelInfo,
  INTERVIEW_IPC.getJobLibrary,
  INTERVIEW_IPC.collectJobs,
  QUESTION_BANK_IPC.getSnapshot,
  QUESTION_BANK_IPC.listQuestions,
  QUESTION_BANK_IPC.getQuestion,
  QUESTION_BANK_IPC.setFavorite,
  QUESTION_PRACTICE_IPC.getOverview,
  QUESTION_PRACTICE_IPC.startSession,
  QUESTION_PRACTICE_IPC.getSession,
  QUESTION_PRACTICE_IPC.saveDraft,
  QUESTION_PRACTICE_IPC.submitAnswer,
  QUESTION_PRACTICE_IPC.completeReview,
  QUESTION_PRACTICE_IPC.skipQuestion,
  QUESTION_PRACTICE_IPC.abandonSession,
  QUESTION_PRACTICE_IPC.listHistory,
] as const;

type InterviewIpcChannel = (typeof INTERVIEW_IPC_CHANNELS)[number];

export type InterviewIpcMain = Pick<IpcMain, "handle" | "removeHandler">;

export type InterviewServicePort = Pick<
  InterviewService,
  "getSnapshot" | "getInterview" | "getInterviewSession" | "createInterview" | "deleteInterview" | "finishInterview" | "scoreInterview" | "sendChat" | "simulateCandidateTurn"
  | "startAlgorithmExam" | "saveAlgorithmDraft" | "submitAlgorithmCode"
  | "getJobLibrary" | "collectJobs"
  | "getQuestionBankSnapshot" | "listQuestionBankQuestions" | "getQuestionBankQuestion"
  | "setQuestionBankFavorite"
  | "importKnowledgeStudioQuestions"
  | "getQuestionPracticeOverview" | "startQuestionPractice" | "getQuestionPracticeSession"
  | "saveQuestionPracticeDraft" | "submitQuestionPracticeAnswer" | "completeQuestionPracticeReview"
  | "skipQuestionPracticeItem" | "abandonQuestionPracticeSession" | "listQuestionPracticeHistory"
  | "close"
>;

export type InterviewMainModuleOptions = {
  dataDirectory: string;
  questionBankResourceDirectory: string;
  algorithmResourceDirectory?: string;
  ipcMain: InterviewIpcMain;
  getWindow: () => RendererWindow | null;
  modelGateway?: ModelGateway;
  createService?: (dataDirectory: string, questionBankResourceDirectory: string) => InterviewServicePort;
};

/**
 * Owns the complete main-process lifecycle of the interview business module.
 *
 * Keeping construction, IPC registration and disposal together makes the
 * module independently testable and prevents the application entry point from
 * accumulating interview-specific behavior as the product grows.
 */
export class InterviewMainModule implements MainModule {
  readonly id = "interview" satisfies ProductModuleId;
  private service?: InterviewServicePort;
  private registered = false;
  private startTask?: Promise<void>;
  private disposeTask?: Promise<void>;

  constructor(private readonly options: InterviewMainModuleOptions) {}

  start(): Promise<void> {
    if (this.startTask) return this.startTask;
    this.startTask = this.startModule().catch((error: unknown) => {
      this.startTask = undefined;
      throw error;
    });
    return this.startTask;
  }

  private async startModule(): Promise<void> {
    if (this.service) return;

    const createService = this.options.createService ?? ((dataDirectory: string, questionBankResourceDirectory: string) => new InterviewService(
      dataDirectory,
      undefined,
      new ElectronJobCollector(),
      questionBankResourceDirectory,
      this.options.modelGateway ? new InterviewChatAgent(this.options.modelGateway) : undefined,
      this.options.algorithmResourceDirectory
        ? new LocalInterviewAlgorithmExecutor(this.options.algorithmResourceDirectory) : undefined,
      this.options.modelGateway ? new InterviewDirectorAgent(this.options.modelGateway) : undefined,
      this.options.modelGateway ? new InterviewScoreAgent(this.options.modelGateway) : undefined,
    ));
    this.service = createService(this.options.dataDirectory, this.options.questionBankResourceDirectory);

    try {
      this.registerIpc();
    } catch (error) {
      const service = this.service;
      this.service = undefined;
      try {
        await service.close();
      } catch (closeError) {
        throw new AggregateError([error, closeError], "智能面试模块启动回滚失败");
      }
      throw error;
    }
  }

  async importKnowledgeStudioQuestions(payload: KnowledgeInterviewImportPayload): Promise<KnowledgeInterviewImportCounts> {
    if (!this.service) throw new Error("智能面试模块尚未启动");
    return this.service.importKnowledgeStudioQuestions(payload);
  }

  registerIpc(): void {
    if (this.registered) return;
    const service = this.service;
    if (!service) throw new Error("智能面试模块尚未启动");

    const registeredChannels: InterviewIpcChannel[] = [];
    const handle = (channel: InterviewIpcChannel, listener: Parameters<IpcMain["handle"]>[1]): void => {
      this.options.ipcMain.handle(channel, listener);
      registeredChannels.push(channel);
    };

    try {
      handle(INTERVIEW_IPC.getSnapshot, () => service.getSnapshot());
      handle(INTERVIEW_IPC.getInterview, (_event, id: unknown) => service.getInterview(id));
      handle(INTERVIEW_IPC.getInterviewSession, (_event, id: unknown) => service.getInterviewSession(id));
      handle(INTERVIEW_IPC.createInterview, (_event, request: unknown) => service.createInterview(request));
      handle(INTERVIEW_IPC.deleteInterview, (_event, id: unknown) => service.deleteInterview(id));
      handle(INTERVIEW_IPC.finishInterview, (_event, id: unknown) => service.finishInterview(id));
      handle(INTERVIEW_IPC.scoreInterview, (_event, request: unknown) => service.scoreInterview(request));
      handle(INTERVIEW_IPC.sendChat, (_event, request: unknown) => service.sendChat(request));
      handle(INTERVIEW_IPC.simulateCandidateTurn, (_event, request: unknown) => service.simulateCandidateTurn(
        request, (progress) => this.sendCandidateTurnProgress(progress)));
      handle(INTERVIEW_IPC.startAlgorithmExam, (_event, id: unknown) => service.startAlgorithmExam(id));
      handle(INTERVIEW_IPC.saveAlgorithmDraft, (_event, request: unknown) => service.saveAlgorithmDraft(request));
      handle(INTERVIEW_IPC.submitAlgorithmCode, (_event, request: unknown) => service.submitAlgorithmCode(request));
      handle(INTERVIEW_IPC.getChatModelInfo, async () => ({
        availableModels: await this.options.modelGateway?.getAvailableModels?.() ?? [],
      }));
      handle(INTERVIEW_IPC.getJobLibrary, () => service.getJobLibrary());
      handle(INTERVIEW_IPC.collectJobs, (_event, request: unknown) => service.collectJobs(
        request,
        (progress) => this.sendJobProgress(progress),
      ));
      handle(QUESTION_BANK_IPC.getSnapshot, () => service.getQuestionBankSnapshot());
      handle(QUESTION_BANK_IPC.listQuestions, (_event, query: unknown) => service.listQuestionBankQuestions(query));
      handle(QUESTION_BANK_IPC.getQuestion, (_event, id: unknown) => service.getQuestionBankQuestion(id));
      handle(QUESTION_BANK_IPC.setFavorite, (_event, request: unknown) => service.setQuestionBankFavorite(request));
      handle(QUESTION_PRACTICE_IPC.getOverview, () => service.getQuestionPracticeOverview());
      handle(QUESTION_PRACTICE_IPC.startSession, (_event, request: unknown) => service.startQuestionPractice(request));
      handle(QUESTION_PRACTICE_IPC.getSession, (_event, sessionId: unknown) => service.getQuestionPracticeSession(sessionId));
      handle(QUESTION_PRACTICE_IPC.saveDraft, (_event, request: unknown) => service.saveQuestionPracticeDraft(request));
      handle(QUESTION_PRACTICE_IPC.submitAnswer, (_event, request: unknown) => service.submitQuestionPracticeAnswer(request));
      handle(QUESTION_PRACTICE_IPC.completeReview, (_event, request: unknown) => service.completeQuestionPracticeReview(request));
      handle(QUESTION_PRACTICE_IPC.skipQuestion, (_event, request: unknown) => service.skipQuestionPracticeItem(request));
      handle(QUESTION_PRACTICE_IPC.abandonSession, (_event, request: unknown) => service.abandonQuestionPracticeSession(request));
      handle(QUESTION_PRACTICE_IPC.listHistory, (_event, query: unknown) => service.listQuestionPracticeHistory(query));
      this.registered = true;
    } catch (error) {
      for (const channel of registeredChannels.reverse()) this.options.ipcMain.removeHandler(channel);
      throw error;
    }
  }

  dispose(): Promise<void> {
    this.disposeTask ??= this.disposeModule();
    return this.disposeTask;
  }

  private async disposeModule(): Promise<void> {
    if (this.registered) {
      for (const channel of INTERVIEW_IPC_CHANNELS) this.options.ipcMain.removeHandler(channel);
      this.registered = false;
    }

    const service = this.service;
    this.service = undefined;
    await service?.close();
  }

  private sendJobProgress(progress: JobCollectionProgress): void {
    sendToRenderer(this.options.getWindow(), INTERVIEW_IPC.jobCollectionProgress, progress);
  }


  private sendCandidateTurnProgress(progress: CandidateTurnProgress): void {
    sendToRenderer(this.options.getWindow(), INTERVIEW_IPC.candidateTurnProgress, progress);
  }
}
