import { EventEmitter } from "node:events";
import type { Worker } from "node:worker_threads";
import { afterEach, expect, it, vi } from "vitest";
import { WorkerClient } from "../../../../../src/platform/main/workers/worker-client";

type Methods = { read: { input: { book: string }; output: string }; write: { input: { text: string }; output: number } };
class FakeWorker extends EventEmitter {
  sent: { request: number; action: string }[] = [];
  postMessage = vi.fn((message: { request: number; action: string }) => { this.sent.push(message); });
  terminate = vi.fn(async () => { this.emit("exit", 0); return 0; });
}
const clients: WorkerClient<Methods>[] = [];
function fixture() {
  const workers: FakeWorker[] = [];
  const factory = vi.fn(() => { const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker; });
  const client = new WorkerClient<Methods>(factory, "测试服务", 100);
  clients.push(client); return { client, workers, factory };
}
afterEach(async () => { await Promise.all(clients.splice(0).map(c => c.dispose())); vi.useRealTimers(); });

it("starts lazily, matches replies by ID, and clears resolved deadlines", async () => {
  vi.useFakeTimers(); const { client, workers, factory } = fixture();
  expect(factory).not.toHaveBeenCalled();
  const input = { book: "A", request: -1, action: "spoofed" };
  const a = client.request("read", input), b = client.request("write", { text: "B" });
  await Promise.resolve(); const worker = workers[0];
  expect(worker.sent[0].action).toBe("read"); expect(worker.sent[0].request).toBeGreaterThan(0);
  worker.emit("message", { request: worker.sent[1].request, value: 42 });
  worker.emit("message", { request: worker.sent[0].request, value: "A" });
  expect(await a).toBe("A"); expect(await b).toBe(42);
  await vi.advanceTimersByTimeAsync(200); expect(worker.terminate).not.toHaveBeenCalled(); expect(factory).toHaveBeenCalledTimes(1);
});

it("fails hung requests and waits for termination before opening a replacement", async () => {
  vi.useFakeTimers(); const { client, workers, factory } = fixture();
  const first = client.request("write", { text: "old" }); const rejection = expect(first).rejects.toThrow("超时");
  await Promise.resolve(); let finish!: (code: number) => void;
  workers[0].terminate.mockImplementation(() => new Promise<number>(r => { finish = r; }));
  await vi.advanceTimersByTimeAsync(100); await rejection;
  const next = client.request("read", { book: "new" }); await Promise.resolve(); expect(factory).toHaveBeenCalledTimes(1);
  finish(0); await Promise.resolve(); await Promise.resolve(); expect(factory).toHaveBeenCalledTimes(2);
  workers[0].emit("message", { request: workers[0].sent[0].request, value: 999 });
  workers[1].emit("message", { request: workers[1].sent[0].request, value: "new" }); expect(await next).toBe("new");
});

it("rejects all pending work on exit and never retries writes automatically", async () => {
  const { client, workers, factory } = fixture();
  const a = client.request("write", { text: "change" }), b = client.request("read", { book: "B" });
  const failures = Promise.all([expect(a).rejects.toThrow("已退出"), expect(b).rejects.toThrow("已退出")]);
  await Promise.resolve(); workers[0].emit("exit", 1); await failures;
  expect(factory).toHaveBeenCalledTimes(1); expect(workers[0].sent).toHaveLength(2);
});

it("supports abort and dispose without leaving pending requests", async () => {
  const { client, workers } = fixture(); const controller = new AbortController();
  const a = client.request("read", { book: "A" }, { signal: controller.signal }); const rejected = expect(a).rejects.toThrow("取消");
  await Promise.resolve(); controller.abort(); await rejected; expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  const b = client.request("read", { book: "B" }); const stopped = expect(b).rejects.toThrow("关闭");
  await Promise.resolve(); await client.dispose(); await stopped;
  await expect(client.request("read", { book: "C" })).rejects.toThrow("关闭");
});

it("keeps a business error scoped to its request and handles postMessage failures", async () => {
  const { client, workers } = fixture();
  const a = client.request("read", { book: "A" }); const rejected = expect(a).rejects.toThrow("书不存在");
  await Promise.resolve(); workers[0].emit("message", { request: workers[0].sent[0].request, error: "书不存在" }); await rejected;
  expect(workers[0].terminate).not.toHaveBeenCalled();
  workers[0].postMessage.mockImplementation(() => { throw Error("clone failed"); });
  await expect(client.request("write", { text: "B" })).rejects.toThrow("clone failed"); expect(workers[0].terminate).toHaveBeenCalledTimes(1);
});

it("refuses replacement if an old worker could not be terminated", async () => {
  const { client, workers, factory } = fixture();
  const request = client.request("write", { text: "pending" }); const failed = expect(request).rejects.toThrow("已退出");
  await Promise.resolve(); workers[0].terminate.mockRejectedValue(Error("termination failed"));
  workers[0].emit("exit", 1); await failed;
  await expect(client.request("read", { book: "next" })).rejects.toThrow("旧进程未能结束"); expect(factory).toHaveBeenCalledTimes(1);
});
