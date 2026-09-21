import { describe, expect, it, vi } from "vitest";
import type { AlgorithmPracticeSnapshot } from "../../shared/contracts/algorithm-practice";
import type { AlgorithmPracticeServicePort } from "./algorithm-practice-service";
import {
  AlgorithmPracticeMainModule,
  type AlgorithmPracticeIpcMain,
} from "./algorithm-practice-main-module";

type Handler = (event: unknown, ...args: unknown[]) => unknown;

function createIpcMain(failChannel?: string) {
  const handlers = new Map<string, Handler>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: Handler) => {
      if (channel === failChannel) throw new Error("registration failed");
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
  } as unknown as AlgorithmPracticeIpcMain;
  return { ipcMain, handlers };
}

function createService(): AlgorithmPracticeServicePort {
  return {
    getSnapshot: vi.fn(async (): Promise<AlgorithmPracticeSnapshot> => ({
      collection: { id: "hot-100", title: "Hot 100", description: "" },
      categories: [],
      problems: [],
      runtime: { available: false, source: "missing", displayName: "missing" },
      solved: { leetcode: 0, acm: 0 },
    })),
    getProblem: vi.fn((slug: unknown) => slug as never),
    saveDraft: vi.fn(),
    resetDraft: vi.fn(),
    run: vi.fn(async () => ({} as never)),
    close: vi.fn(),
  };
}

describe("AlgorithmPracticeMainModule", () => {
  it("owns all judge IPC handlers and forwards requests", async () => {
    const { ipcMain, handlers } = createIpcMain();
    const service = createService();
    const createServiceFactory = vi.fn(() => service);
    const module = new AlgorithmPracticeMainModule({
      dataDirectory: "C:/data/algorithm",
      resourceDirectory: "C:/app/resources/algorithm-practice",
      ipcMain,
      createService: createServiceFactory,
    });

    await module.start();
    expect(createServiceFactory).toHaveBeenCalledWith({
      dataDirectory: "C:/data/algorithm",
      resourceDirectory: "C:/app/resources/algorithm-practice",
    });
    expect(handlers.size).toBe(5);
    await handlers.get("algorithm-practice:run")?.({}, { slug: "two_sum" });
    expect(service.run).toHaveBeenCalledWith({ slug: "two_sum" });

    await module.dispose();
    await module.dispose();
    expect(service.close).toHaveBeenCalledTimes(1);
    expect(handlers.size).toBe(0);
  });

  it("removes partial IPC registration and closes the service on startup failure", async () => {
    const { ipcMain, handlers } = createIpcMain("algorithm-practice:reset-draft");
    const service = createService();
    const module = new AlgorithmPracticeMainModule({
      dataDirectory: "C:/data/algorithm",
      resourceDirectory: "C:/app/resources/algorithm-practice",
      ipcMain,
      createService: () => service,
    });

    await expect(module.start()).rejects.toThrow("registration failed");
    expect(handlers.size).toBe(0);
    expect(service.close).toHaveBeenCalledTimes(1);
  });
});
