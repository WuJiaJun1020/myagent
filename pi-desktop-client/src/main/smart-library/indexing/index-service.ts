import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { WorkerClient } from "../../../platform/main/workers/worker-client";
import type { IndexArgs, IndexMethods } from "./worker-contract";
import type { LibraryStrategyProfile } from "../../../shared/contracts/library-strategy";
export type LibraryIndexPort = Pick<LibraryIndexService, "request">;
export class LibraryIndexService {
  private client: WorkerClient<IndexMethods>;
  private profiles = new Map<string, WorkerClient<IndexMethods>>();
  constructor(private root: string) {
    this.client = new WorkerClient(() => new Worker(join(__dirname, "library-index.cjs"), { workerData: { root } }), "索引服务", 240_000);
  }
  scoped(profile: LibraryStrategyProfile): LibraryIndexPort {
    return { request: <K extends keyof IndexArgs>(book: string, action: K, ...args: IndexArgs[K]) => this.requestProfile(profile, book, action, ...args) };
  }
  requestProfile<K extends keyof IndexArgs>(profile: LibraryStrategyProfile, book: string, action: K, ...args: IndexArgs[K]): Promise<IndexMethods[K]["output"]> {
    if (!/^[\w-]{1,100}$/.test(profile.id) || !/^[a-f0-9]{64}$/.test(book)) return Promise.reject(Error("策略或图书 ID 无效"));
    const [settings, ordinal, payload] = args;
    let client = this.client;
    if (profile.id !== "standard-rag") {
      client = this.profiles.get(profile.id)!;
      if (!client) { client = new WorkerClient(() => new Worker(join(__dirname,"library-index.cjs"), { workerData: { root: join(this.root,"strategy-indexes",profile.id), bookRoot: this.root } }), "策略索引服务", 240_000); this.profiles.set(profile.id, client); }
    }
    return client.request(action, { book, settings, ordinal, payload, profile } as IndexMethods[K]["input"], { timeoutMs: action === "prepare" || action === "rebuild" ? 600_000 : undefined });
  }
  request<K extends keyof IndexArgs>(book: string, action: K, ...args: IndexArgs[K]): Promise<IndexMethods[K]["output"]> {
    if (!/^[a-f0-9]{64}$/.test(book)) return Promise.reject(Error("无效的图书 ID"));
    const [settings, ordinal, payload] = args;
    const input = { book, settings, ordinal, payload } as IndexMethods[K]["input"];
    return this.client.request(action, input, { timeoutMs: action === "prepare" || action === "rebuild" ? 600_000 : undefined });
  }
  async dispose() { await Promise.all([this.client, ...this.profiles.values()].map(client=>client.dispose())); }
  async isBusy() { return (await Promise.all([this.client, ...this.profiles.values()].map(client=>client.started ? client.request("busy", {}, { timeoutMs: 30_000 }) : false))).some(Boolean); }
}
