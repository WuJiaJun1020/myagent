import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { LibraryModelRuntime } from "../../../../src/main/smart-library/model-runtime";
import { DEFAULT_LIBRARY_LOCAL_MODELS as defaults } from "../../../../src/shared/contracts/smart-library";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:fs/promises", () => ({ access: vi.fn(), readFile: vi.fn(async () => { throw Object.assign(Error("missing"), { code: "ENOENT" }); }) }));
vi.mock("node:net", () => ({ createServer: () => ({ once: () => {}, listen: (_port: number, _host: string, cb: () => void) => cb(), close: (cb: () => void) => cb() }) }));
let ready = false;
let runtime: LibraryModelRuntime;
beforeEach(() => {
  vi.clearAllMocks(); ready = false; vi.mocked(access).mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ready, models: [defaults.embeddingModel] }))));
  vi.mocked(spawn).mockImplementation(() => {
    const child = new EventEmitter();
    Object.assign(child, { stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: Object.assign(new EventEmitter(), { end: () => child.emit("close", 0) }), kill: () => child.emit("close", 0) });
    return child as ReturnType<typeof spawn>;
  });
  runtime = new LibraryModelRuntime(resolve("fixture"), async () => true);
});
afterEach(async () => { await runtime.dispose(); vi.unstubAllGlobals(); });
it("coalesces automatic and manual starts, waits for health and preserves hidden process ownership", async () => {
  const values = await Promise.all([runtime.ensure(defaults), runtime.ensure(defaults), runtime.action("start")]);
  expect(spawn).toHaveBeenCalledTimes(1); expect(values.every(value => value.state === "starting")).toBe(true);
  expect(vi.mocked(spawn).mock.calls[0][2]).toMatchObject({ windowsHide: true });
  ready = true; expect((await runtime.status()).state).toBe("ready");
  await runtime.ensure(defaults); expect(spawn).toHaveBeenCalledTimes(1);
  await runtime.action("stop"); ready = false; expect((await runtime.status()).state).toBe("stopped");
});
it("reuses a ready external service without spawning or taking ownership", async () => {
  ready = true; expect(await runtime.ensure(defaults)).toMatchObject({ state: "ready", owned: false });
  expect(spawn).not.toHaveBeenCalled(); await expect(runtime.action("stop")).rejects.toThrow("不是由本客户端启动");
});
it("skips unrelated custom services and starts the managed half of a mixed configuration", async () => {
  const custom = { ...defaults, embeddingUrl: "http://localhost:19000/embed", rerankerUrl: "http://localhost:19000/rerank" };
  expect(await runtime.ensure(custom)).toMatchObject({ managedRequired: false }); expect(spawn).not.toHaveBeenCalled();
  expect(await runtime.ensure({ ...custom, embeddingUrl: defaults.embeddingUrl })).toMatchObject({ state: "starting", managedRequired: true, notice: expect.stringContaining("自定义") });
  expect(spawn).toHaveBeenCalledTimes(1);
});
it("persists missing-environment failures and allows recovery on retry", async () => {
  vi.mocked(access).mockRejectedValueOnce(Error("missing"));
  await expect(runtime.ensure(defaults)).rejects.toThrow("未找到本地 GPU 模型环境");
  expect(await runtime.status()).toMatchObject({ state: "failed", error: expect.stringContaining("GPU 模型环境") });
  expect(spawn).not.toHaveBeenCalled();
  expect((await runtime.ensure(defaults)).state).toBe("starting"); expect(spawn).toHaveBeenCalledTimes(1);
});
it("does not spawn if the client exits while the initial health check is pending", async () => {
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(r => { resolve = r; }));
  const starting = runtime.ensure(defaults), quitting = runtime.dispose();
  resolve(new Response(JSON.stringify({ ready: false })));
  await expect(starting).rejects.toThrow("客户端正在退出"); await quitting; expect(spawn).not.toHaveBeenCalled();
});
