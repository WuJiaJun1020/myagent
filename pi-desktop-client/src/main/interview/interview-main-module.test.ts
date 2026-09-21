import { describe, expect, it, vi } from "vitest";
import type { InterviewPreparationProgress, JobCollectionProgress } from "../../shared/contracts/interview";
import type { RendererWindow } from "../send-to-renderer";
import {
  InterviewMainModule,
  type InterviewIpcMain,
  type InterviewServicePort,
} from "./interview-main-module";

type Handler = (event: unknown, ...args: unknown[]) => unknown;

function createIpcMain(failChannel?: string) {
  const handlers = new Map<string, Handler>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: Handler) => {
      if (channel === failChannel) throw new Error("registration failed");
      if (handlers.has(channel)) throw new Error(`duplicate handler: ${channel}`);
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
  } as unknown as InterviewIpcMain;
  return { ipcMain, handlers };
}

function createService(): InterviewServicePort {
  return {
    getSnapshot: vi.fn(() => ({
      interviews: [],
      counts: { draft: 0, preparing: 0, ready: 0, interviewing: 0, generating_report: 0, completed: 0 },
    })),
    getInterview: vi.fn(() => null),
    getInterviewSession: vi.fn(() => null),
    createInterview: vi.fn((request: unknown) => request as never),
    prepareInterview: vi.fn(async (_request: unknown, onProgress: (progress: InterviewPreparationProgress) => void) => {
      onProgress({
        interviewId: "interview-1",
        operationId: "operation-1",
        phase: "calling_model",
        message: "preparing",
      });
      return {} as never;
    }),
    getJobLibrary: vi.fn(() => ({ jobs: [], total: 0, bySource: { alibaba: 0, bytedance: 0 }, lastRun: null })),
    collectJobs: vi.fn(async (_request: unknown, onProgress: (progress: JobCollectionProgress) => void) => {
      onProgress({ runId: "run-1", source: "alibaba", phase: "searching", message: "collecting", collected: 1 });
      return { run: {} as never, snapshot: {} as never };
    }),
    getQuestionBankSnapshot: vi.fn(async () => ({
      total: 0,
      published: 0,
      favorites: 0,
      byKind: { technical: 0, project: 0, behavioral: 0, scenario: 0 },
      byDifficulty: { introductory: 0, intermediate: 0, advanced: 0 },
      roles: [],
      skills: [],
    })),
    listQuestionBankQuestions: vi.fn(async () => ({ items: [], total: 0, offset: 0, limit: 30, hasMore: false })),
    getQuestionBankQuestion: vi.fn(async () => null),
    setQuestionBankFavorite: vi.fn(async () => ({ questionId: "question-1", favorite: true, favorites: 1 })),
    getQuestionPracticeOverview: vi.fn(async () => ({
      completedSessions: 0,
      practicedQuestions: 0,
      dueReview: 0,
    })),
    startQuestionPractice: vi.fn(async () => ({} as never)),
    getQuestionPracticeSession: vi.fn(async () => null),
    saveQuestionPracticeDraft: vi.fn(async () => ({
      sessionId: "session-1",
      itemId: "item-1",
      draftRevision: 2,
      savedAt: "2026-09-21T00:00:00.000Z",
    })),
    submitQuestionPracticeAnswer: vi.fn(async () => ({} as never)),
    completeQuestionPracticeReview: vi.fn(async () => ({} as never)),
    skipQuestionPracticeItem: vi.fn(async () => ({} as never)),
    abandonQuestionPracticeSession: vi.fn(async () => ({} as never)),
    listQuestionPracticeHistory: vi.fn(async () => ({
      items: [],
      total: 0,
      offset: 0,
      limit: 20,
      hasMore: false,
    })),
    close: vi.fn(),
  };
}

describe("InterviewMainModule", () => {
  it("owns service construction, IPC forwarding and progress delivery", async () => {
    const { ipcMain, handlers } = createIpcMain();
    const service = createService();
    const send = vi.fn();
    const window: RendererWindow = {
      isDestroyed: () => false,
      webContents: { isDestroyed: () => false, send },
    };
    const createServiceFactory = vi.fn(() => service);
    const module = new InterviewMainModule({
      dataDirectory: "C:/app-data/interview",
      questionBankResourceDirectory: "C:/app/resources/interview-question-bank",
      ipcMain,
      getWindow: () => window,
      createService: createServiceFactory,
    });

    await module.start();

    expect(createServiceFactory).toHaveBeenCalledWith(
      "C:/app-data/interview",
      "C:/app/resources/interview-question-bank",
    );
    expect(handlers.size).toBe(20);
    expect([...handlers.keys()]).toEqual(expect.arrayContaining([
      "interview:question-practice:get-overview",
      "interview:question-practice:start-session",
      "interview:question-practice:get-session",
      "interview:question-practice:save-draft",
      "interview:question-practice:submit-answer",
      "interview:question-practice:complete-review",
      "interview:question-practice:skip-question",
      "interview:question-practice:abandon-session",
      "interview:question-practice:list-history",
    ]));
    expect(await handlers.get("interview:get-snapshot")?.({})).toEqual({
      interviews: [],
      counts: { draft: 0, preparing: 0, ready: 0, interviewing: 0, generating_report: 0, completed: 0 },
    });

    const request = { sources: ["alibaba"], keywords: ["AI"], limitPerSource: 10 };
    await handlers.get("interview:collect-jobs")?.({}, request);
    expect(service.collectJobs).toHaveBeenCalledWith(request, expect.any(Function));
    expect(send).toHaveBeenCalledWith("interview:job-collection-progress", {
      runId: "run-1",
      source: "alibaba",
      phase: "searching",
      message: "collecting",
      collected: 1,
    });

    const prepareRequest = { interviewId: "interview-1", operationId: "operation-1", privacyConfirmed: true };
    await handlers.get("interview:prepare")?.({}, prepareRequest);
    expect(service.prepareInterview).toHaveBeenCalledWith(prepareRequest, expect.any(Function));
    expect(send).toHaveBeenCalledWith("interview:preparation-progress", {
      interviewId: "interview-1",
      operationId: "operation-1",
      phase: "calling_model",
      message: "preparing",
    });

    const questionQuery = { search: "Python", limit: 20 };
    await handlers.get("interview:question-bank:list")?.({}, questionQuery);
    expect(service.listQuestionBankQuestions).toHaveBeenCalledWith(questionQuery);
    const favoriteRequest = { questionId: "question-1", favorite: true };
    await handlers.get("interview:question-bank:set-favorite")?.({}, favoriteRequest);
    expect(service.setQuestionBankFavorite).toHaveBeenCalledWith(favoriteRequest);

    const practiceStartRequest = {
      operationId: "practice-1",
      selection: { kind: "single", questionId: "question-1" },
    };
    await handlers.get("interview:question-practice:start-session")?.({}, practiceStartRequest);
    expect(service.startQuestionPractice).toHaveBeenCalledWith(practiceStartRequest);
    await handlers.get("interview:question-practice:get-session")?.({}, "session-1");
    expect(service.getQuestionPracticeSession).toHaveBeenCalledWith("session-1");
    const reviewRequest = {
      sessionId: "session-1",
      itemId: "item-1",
      operationId: "review-1",
      expectedStateVersion: 2,
      selfRating: "developing",
      coveredRubricIds: ["fundamentals"],
    };
    await handlers.get("interview:question-practice:complete-review")?.({}, reviewRequest);
    expect(service.completeQuestionPracticeReview).toHaveBeenCalledWith(reviewRequest);
    await handlers.get("interview:question-practice:list-history")?.({}, { limit: 20, offset: 0 });
    expect(service.listQuestionPracticeHistory).toHaveBeenCalledWith({ limit: 20, offset: 0 });
  });

  it("makes start, registration and disposal idempotent", async () => {
    const { ipcMain, handlers } = createIpcMain();
    const service = createService();
    const createServiceFactory = vi.fn(() => service);
    const module = new InterviewMainModule({
      dataDirectory: "C:/app-data/interview",
      questionBankResourceDirectory: "C:/app/resources/interview-question-bank",
      ipcMain,
      getWindow: () => null,
      createService: createServiceFactory,
    });

    await module.start();
    await module.start();
    module.registerIpc();

    expect(createServiceFactory).toHaveBeenCalledTimes(1);
    expect(ipcMain.handle).toHaveBeenCalledTimes(20);
    expect(handlers.size).toBe(20);

    await module.dispose();
    await module.dispose();

    expect(service.close).toHaveBeenCalledTimes(1);
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(20);
    expect(handlers.size).toBe(0);
  });

  it("rolls back partially registered handlers when startup fails", async () => {
    const { ipcMain, handlers } = createIpcMain("interview:question-practice:complete-review");
    const service = createService();
    const module = new InterviewMainModule({
      dataDirectory: "C:/app-data/interview",
      questionBankResourceDirectory: "C:/app/resources/interview-question-bank",
      ipcMain,
      getWindow: () => null,
      createService: () => service,
    });

    await expect(module.start()).rejects.toThrow("registration failed");
    expect(handlers.size).toBe(0);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith("interview:question-practice:submit-answer");
    expect(ipcMain.removeHandler).toHaveBeenCalledWith("interview:get-snapshot");
    expect(service.close).toHaveBeenCalledTimes(1);
  });
});
