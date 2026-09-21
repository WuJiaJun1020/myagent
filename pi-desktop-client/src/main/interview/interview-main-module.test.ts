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
      ipcMain,
      getWindow: () => window,
      createService: createServiceFactory,
    });

    await module.start();

    expect(createServiceFactory).toHaveBeenCalledWith("C:/app-data/interview");
    expect(handlers.size).toBe(7);
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
  });

  it("makes start, registration and disposal idempotent", async () => {
    const { ipcMain, handlers } = createIpcMain();
    const service = createService();
    const createServiceFactory = vi.fn(() => service);
    const module = new InterviewMainModule({
      dataDirectory: "C:/app-data/interview",
      ipcMain,
      getWindow: () => null,
      createService: createServiceFactory,
    });

    await module.start();
    await module.start();
    module.registerIpc();

    expect(createServiceFactory).toHaveBeenCalledTimes(1);
    expect(ipcMain.handle).toHaveBeenCalledTimes(7);
    expect(handlers.size).toBe(7);

    await module.dispose();
    await module.dispose();

    expect(service.close).toHaveBeenCalledTimes(1);
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(7);
    expect(handlers.size).toBe(0);
  });

  it("rolls back partially registered handlers when startup fails", async () => {
    const { ipcMain, handlers } = createIpcMain("interview:create");
    const service = createService();
    const module = new InterviewMainModule({
      dataDirectory: "C:/app-data/interview",
      ipcMain,
      getWindow: () => null,
      createService: () => service,
    });

    await expect(module.start()).rejects.toThrow("registration failed");
    expect(handlers.size).toBe(0);
    expect(service.close).toHaveBeenCalledTimes(1);
  });
});
