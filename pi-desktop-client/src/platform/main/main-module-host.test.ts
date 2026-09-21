import { describe, expect, it, vi } from "vitest";
import { MainModuleHost, type MainModule } from "./main-module-host";

function moduleWith(id: string, events: string[]): MainModule {
  return {
    id,
    start: vi.fn(() => { events.push(`start:${id}`); }),
    dispose: vi.fn(() => { events.push(`dispose:${id}`); }),
  };
}

describe("MainModuleHost", () => {
  it("starts in registration order and disposes in reverse order", async () => {
    const events: string[] = [];
    const host = new MainModuleHost();
    host.register(moduleWith("agent", events));
    host.register(moduleWith("interview", events));

    await host.start();
    await host.start();
    await host.dispose();
    await host.dispose();

    expect(events).toEqual([
      "start:agent",
      "start:interview",
      "dispose:interview",
      "dispose:agent",
    ]);
  });

  it("isolates a failed module while later modules and the shell can keep starting", async () => {
    const events: string[] = [];
    const host = new MainModuleHost();
    host.register(moduleWith("agent", events));
    const failedDispose = vi.fn(() => { events.push("dispose:interview"); });
    host.register({
      id: "interview",
      start: () => { throw new Error("interview startup failed"); },
      dispose: failedDispose,
    });
    host.register(moduleWith("reading", events));

    const failures = await host.start();

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ moduleId: "interview" });
    expect((failures[0]?.error as Error).message).toBe("interview startup failed");
    expect(failedDispose).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["start:agent", "dispose:interview", "start:reading"]);

    await host.dispose();
    expect(events).toEqual([
      "start:agent",
      "dispose:interview",
      "start:reading",
      "dispose:reading",
      "dispose:agent",
    ]);
  });

  it("rejects duplicate IDs and registration after startup", async () => {
    const host = new MainModuleHost();
    host.register(moduleWith("interview", []));
    expect(() => host.register(moduleWith("interview", []))).toThrow("已注册");

    await host.start();
    expect(() => host.register(moduleWith("reading", []))).toThrow("不能再注册");
    await host.dispose();
  });

  it("isolates a module whose startup never settles", async () => {
    const events: string[] = [];
    const host = new MainModuleHost({ startTimeoutMs: 10, disposeTimeoutMs: 10 });
    let startupSignal: AbortSignal | undefined;
    host.register({
      id: "stuck",
      start: (context) => {
        startupSignal = context?.signal;
        return new Promise<void>(() => undefined);
      },
      dispose: () => { events.push("dispose:stuck"); },
    });
    host.register(moduleWith("healthy", events));

    const failures = await host.start();

    expect(failures).toHaveLength(1);
    expect(failures[0]?.moduleId).toBe("stuck");
    expect((failures[0]?.error as Error).message).toContain("启动业务模块 stuck超时");
    expect(startupSignal?.aborted).toBe(true);
    expect(events).toEqual(["dispose:stuck", "start:healthy"]);
    await host.dispose();
  });

  it("bounds module disposal so shutdown can continue", async () => {
    const host = new MainModuleHost({ disposeTimeoutMs: 10 });
    host.register({
      id: "stuck",
      start: () => undefined,
      dispose: () => new Promise<void>(() => undefined),
    });

    await host.start();

    await expect(host.dispose()).rejects.toThrow("释放主进程模块时发生错误");
  });
});
