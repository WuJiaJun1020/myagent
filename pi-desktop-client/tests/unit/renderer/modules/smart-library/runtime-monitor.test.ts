import { afterEach, expect, it, vi } from "vitest";
import type { LibraryRuntimeStatus } from "../../../../../src/shared/contracts/smart-library";
import { LibraryRuntimeMonitor } from "../../../../../src/renderer/modules/smart-library/runtime-monitor";

afterEach(() => vi.useRealTimers());
const ready: LibraryRuntimeStatus = { state: "ready", owned: false, busy: false, managedRequired: true };
it("does nothing until a panel opens and shares pending startup across panels", async () => {
  let resolve!: (value: LibraryRuntimeStatus) => void;
  const modelRuntime = vi.fn(() => new Promise<LibraryRuntimeStatus>(r => { resolve = r; }));
  const monitor = new LibraryRuntimeMonitor(() => ({ modelRuntime }));
  expect(modelRuntime).not.toHaveBeenCalled();
  const closeA = monitor.subscribe(() => {}), closeB = monitor.subscribe(() => {});
  expect(modelRuntime).toHaveBeenCalledTimes(1);
  closeA(); resolve(ready); await monitor.ensure();
  expect(monitor.getSnapshot().status?.state).toBe("ready");
  closeB();
});
it("reports readiness only after health polling, stops polling when all panels close", async () => {
  vi.useFakeTimers();
  const modelRuntime = vi.fn().mockResolvedValueOnce({ ...ready, state: "starting" }).mockResolvedValue(ready);
  const monitor = new LibraryRuntimeMonitor(() => ({ modelRuntime }));
  const close = monitor.subscribe(() => {}); await monitor.ensure();
  expect(monitor.getSnapshot().status?.state).toBe("starting");
  await vi.advanceTimersByTimeAsync(2000);
  expect(monitor.getSnapshot().status?.state).toBe("ready");
  close(); await vi.advanceTimersByTimeAsync(6000);
  expect(modelRuntime).toHaveBeenCalledTimes(2);
});
it("keeps startup failures visible without repeatedly restarting, supports explicit retry", async () => {
  vi.useFakeTimers();
  const modelRuntime = vi.fn().mockImplementation((action: string) => action === "status" ? Promise.resolve({ ...ready, state: "failed", error: "GPU 环境不存在" }) : Promise.reject(Error("GPU 环境不存在")));
  const monitor = new LibraryRuntimeMonitor(() => ({ modelRuntime }));
  const close = monitor.subscribe(() => {}); await monitor.ensure();
  expect(monitor.getSnapshot().error).toContain("GPU 环境不存在");
  await vi.advanceTimersByTimeAsync(6000); expect(modelRuntime.mock.calls.filter(([action]) => action === "ensure")).toHaveLength(1);
  expect(monitor.getSnapshot().status?.error).toContain("GPU 环境不存在");
  modelRuntime.mockResolvedValue(ready);
  await monitor.ensure(); expect(monitor.getSnapshot().status?.state).toBe("ready"); close();
});
it("does not poll or claim readiness for unmanaged custom endpoints", async () => {
  vi.useFakeTimers();
  const modelRuntime = vi.fn().mockResolvedValue({ state: "stopped", owned: false, busy: false, managedRequired: false, notice: "自行启动" });
  const monitor = new LibraryRuntimeMonitor(() => ({ modelRuntime }));
  const close = monitor.subscribe(() => {}); await monitor.ensure();
  await vi.advanceTimersByTimeAsync(6000);
  expect(modelRuntime).toHaveBeenCalledTimes(1); expect(monitor.getSnapshot().status?.notice).toBe("自行启动"); close();
});
it("rechecks on reopening and observes manual recovery after a process fails", async () => {
  vi.useFakeTimers();
  const modelRuntime = vi.fn().mockResolvedValueOnce(ready).mockResolvedValueOnce({ ...ready, state: "failed", error: "进程退出" }).mockResolvedValue(ready);
  const monitor = new LibraryRuntimeMonitor(() => ({ modelRuntime }));
  const close = monitor.subscribe(() => {}); await monitor.ensure();
  await vi.advanceTimersByTimeAsync(2000); expect(monitor.getSnapshot().status?.error).toBe("进程退出");
  await vi.advanceTimersByTimeAsync(2000); expect(monitor.getSnapshot().status?.state).toBe("ready"); close();
  const closeAgain = monitor.subscribe(() => {}); await monitor.ensure();
  expect(monitor.getSnapshot().status?.state).toBe("ready"); closeAgain();
});
