import { describe, expect, it, vi } from "vitest";
import { RecordingModelGateway } from "../../platform/shared/ai/testing";
import type { JobCollectionProgress } from "../../shared/contracts/interview";
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
    deleteInterview: vi.fn(async () => ({ interviews: [], counts: { draft: 0, preparing: 0, ready: 0,
      interviewing: 0, generating_report: 0, completed: 0 } })),
    finishInterview: vi.fn(() => ({} as never)),
    scoreInterview: vi.fn(async () => ({} as never)),
    sendChat: vi.fn(async () => ({} as never)),
    simulateCandidateTurn: vi.fn(async () => ({} as never)),
    startAlgorithmExam: vi.fn(async () => ({} as never)),
    saveAlgorithmDraft: vi.fn(() => ({} as never)),
    submitAlgorithmCode: vi.fn(async () => ({} as never)),
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
    importKnowledgeStudioQuestions: vi.fn(async () => ({ inserted: 1, updated: 0, unchanged: 0, alreadyImported: false })),
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
  it("exposes the existing Pi gateway model catalog to the interview UI", async () => {
    const { ipcMain, handlers } = createIpcMain();
    const gateway = Object.assign(new RecordingModelGateway(), {
      getAvailableModels: vi.fn(async () => [{ providerId: "openai-codex", modelId: "gpt-6-luna",
        name: "GPT-6 Luna", reasoningLevels: ["medium" as const], contextWindowTokens: 272_000 }]),
    });
    const module = new InterviewMainModule({ dataDirectory: "C:/app-data/interview",
      questionBankResourceDirectory: "C:/app/resources/interview-question-bank",
      ipcMain, getWindow: () => null, modelGateway: gateway, createService: () => createService() });
    await module.start();
    expect(await handlers.get("interview:get-chat-model-info")?.({})).toEqual({ availableModels: [{
      providerId: "openai-codex", modelId: "gpt-6-luna", name: "GPT-6 Luna", reasoningLevels: ["medium"],
      contextWindowTokens: 272_000,
    }] });
    await module.dispose();
  });
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
    expect(handlers.size).toBe(28);
    expect([...handlers.keys()]).toEqual(expect.arrayContaining([
      "interview:delete",
      "interview:finish",
      "interview:algorithm-start",
      "interview:algorithm-save-draft",
      "interview:algorithm-submit",
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
    expect(await handlers.get("interview:get-chat-model-info")?.({})).toEqual({ availableModels: [] });
    await handlers.get("interview:delete")?.({}, "interview-1");
    expect(service.deleteInterview).toHaveBeenCalledWith("interview-1");
    await handlers.get("interview:finish")?.({}, "interview-1");
    expect(service.finishInterview).toHaveBeenCalledWith("interview-1");

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
    expect(ipcMain.handle).toHaveBeenCalledTimes(28);
    expect(handlers.size).toBe(28);

    await module.dispose();
    await module.dispose();

    expect(service.close).toHaveBeenCalledTimes(1);
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(28);
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
