import { Worker } from "node:worker_threads";
import { mkdir, readFile, writeFile, rename, readdir, cp, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join, extname, basename } from "node:path";
import type { IpcMain } from "electron";
import type { MainModule } from "../../platform/main/main-module-host";
import type { LibraryBook } from "../../shared/contracts/smart-library";
import type { ParsedBook } from "./book-parser";
import { LibraryLocalModelService } from "./local-models";
import { LibraryIndexService } from "./indexing/index-service";
import { LibraryModelRuntime } from "./model-runtime";
import { LibraryQaService } from "./qa/qa-service";
import type { ModelGateway } from "../../platform/shared/ai/model-gateway";
import { LibraryEvaluationService } from "./evaluation/evaluation-service";
import { LibraryQuestionBankService } from "./question-bank/bank-service";
import type { LibraryRuntimeLocations } from "../../platform/main/runtime/library-model-paths.mjs";
import { LibraryProfileStore } from "./strategies/profile-store";
import type { LibraryStrategyProfile } from "../../shared/contracts/library-strategy";
import type { EvaluationOptions } from "../../shared/contracts/library-evaluation";
export class LibraryModule implements MainModule {
  readonly id = "smart-library";
  private busy = false;
  private worker?: Worker;
  private writes = Promise.resolve();
  private models: LibraryLocalModelService;
  private indexes: LibraryIndexService;
  private runtime: LibraryModelRuntime;
  private searches = new Map<string, { cancelled: boolean; profile?: LibraryStrategyProfile }>();
  private qa: LibraryQaService;
  private evaluation: LibraryEvaluationService;
  private bank: LibraryQuestionBankService;
  private profiles: LibraryProfileStore;
  constructor(private root: string, private ipc: Pick<IpcMain, "handle" | "removeHandler">, private selectFiles: () => Promise<string[]>, appRoot = process.cwd(), private gateway?: ModelGateway, runtimeLocations?: Omit<LibraryRuntimeLocations, "dataRoot">) {
    this.evaluation = new LibraryEvaluationService(root, gateway);
    this.bank = new LibraryQuestionBankService(root);
    this.models = new LibraryLocalModelService(root); this.indexes = new LibraryIndexService(root);
    this.profiles = new LibraryProfileStore(root, () => this.models.get());
    this.qa = new LibraryQaService(this.indexes, gateway, id => this.book(id), () => this.models.get(), this.profiles);
    this.runtime = new LibraryModelRuntime(appRoot, async () => !this.evaluation.isBusy() && !this.qa.isBusy() && !this.models.isBusy() && !await this.indexes.isBusy(), 18081, { dataRoot: root, ...runtimeLocations });
  }
  start() {
    this.ipc.handle("smart-library:strategy-profiles", (_, request) => this.profiles.action(request));
    this.ipc.handle("smart-library:evaluation-runs", async (_, id) => { await this.book(id); return this.evaluation.runs(id); });
    this.ipc.handle("smart-library:question-bank", async (_,id,request) => { await this.book(id); return request ? this.bank.review(id,request) : this.bank.list(id); });
    this.ipc.handle("smart-library:question-bank-evidence", async (_,id,question,evidence) => { await this.book(id); return this.bank.evidence(id,question,evidence); });
    this.ipc.handle("smart-library:evaluate", async (_,id,action, options: EvaluationOptions = {}) => {
      await this.book(id);
      if(action==="start"&&(this.runtime.isStopping()||this.searches.size||this.qa.isBusy()||this.models.isBusy()||await this.indexes.isBusy()))throw Error("请先停止或等待当前检索、回答或建库完成，再运行评测");
      if(action==="status") {
        const state=await this.evaluation.action(id,action,undefined,[],undefined,options);
        if(state.state==="idle") {const bank=await this.bank.list(id);return {...state,total:bank.entries.filter(e=>e.status==="approved"&&e.published).length};}
        return state;
      }
      if(action!=="start") return this.evaluation.action(id,action,undefined,[],undefined,options);
      const ids=options.profileIds??[options.profileId??"standard-rag"];
      if(!Array.isArray(ids)||!ids.length||ids.length>16)throw Error("请选择 1–16 个方案");
      const profiles=await Promise.all(ids.map(profileId=>this.profiles.get(profileId)));
      for(const profile of profiles){const state=await this.indexes.requestProfile(profile,id,"status");if(!state.activeVersion||state.stale)throw Error(`${profile.name}：请先完成或重建该方案的索引`);}
      const configured=await this.gateway?.getConfiguredModel?.();
      for(const profile of profiles){if(!profile.answer.model)profile.answer.model=configured??null;if((profile.queryPlanning?.enabled||profile.rewrite.mode==="always")&&!profile.rewrite.model&&!profile.answer.model)throw Error(`${profile.name}：请先配置问题处理模型`);}
      const questions=await this.bank.published(id);
      return profiles.length>1?this.evaluation.compare(id,questions,profiles):this.evaluation.action(id,action,profiles[0].localModels,questions,profiles[0]);
    });
    this.ipc.handle("smart-library:evaluation-evidence", async (_,id,reference) => {
      await this.book(id);
      const span=await this.evaluation.reference(id,reference);
      return this.indexes.requestProfile(await this.profiles.get(span.profileId),id,"evaluation-evidence",undefined,undefined,span);
    });
    this.ipc.handle("smart-library:qa-models", () => this.qa.models());
    this.ipc.handle("smart-library:qa-strategies", () => this.qa.strategies());
    this.ipc.handle("smart-library:qa-sessions", (_, id, action, sessionId, title, range, strategyId) => this.qa.sessions(id, action, sessionId, title, range, strategyId));
    this.ipc.handle("smart-library:qa-history", (_, id, before, sessionId) => this.qa.history(id, before, sessionId));
    this.ipc.handle("smart-library:qa-ask", (event, id, request) => {
      if(this.evaluation.isBusy())throw Error("评测正在使用本地检索模型，请先停止或等待完成");
      if (this.runtime.isStopping()) throw Error("本地检索模型正在停止，请稍候");
      return this.qa.start(id, request, turn => { if (!event.sender.isDestroyed()) event.sender.send("smart-library:qa-update", turn); });
    });
    this.ipc.handle("smart-library:qa-stop", (_, id, turn) => this.qa.stop(id, turn));
    this.ipc.handle("smart-library:qa-evidence", (_, id, turn, number) => this.qa.evidence(id, turn, number));
    this.ipc.handle("smart-library:search", async (_, id, request) => {
      this.directory(id);
      if(this.evaluation.isBusy())throw Error("评测正在运行，请先停止或等待完成");
      if (!request || typeof request.token !== "string" || !/^[\w-]{1,100}$/.test(request.token)) throw Error("检索标识无效");
      const key = `${id}:${request.token}`;
      if (this.searches.has(key)) throw Error("检索已在运行");
      const state: {cancelled:boolean;profile?:LibraryStrategyProfile} = { cancelled: false }; this.searches.set(key, state);
      try {
        await this.book(id); const profile=await this.profiles.get(request.profileId);state.profile=profile;const settings=profile.localModels;
        if (state.cancelled) throw Error("检索已停止");
        if (this.runtime.isStopping()) throw Error("模型服务正在停止，请稍候检索");
        return await this.indexes.requestProfile(profile,id, "search", settings, undefined, request);
      } finally { this.searches.delete(key); }
    });
    this.ipc.handle("smart-library:cancel-search", (_, id, token) => {
      this.directory(id); const state = this.searches.get(`${id}:${token}`);
      if (!state) return; state.cancelled = true;
      if(state.profile)return this.indexes.requestProfile(state.profile,id,"cancel-search",undefined,undefined,token);
    });
    this.ipc.handle("smart-library:evidence", async (_, id, reference) => { await this.book(id); return this.indexes.requestProfile(await this.profiles.get(reference?.profileId),id,"evidence",undefined,undefined,reference); });
    this.ipc.handle("smart-library:model-runtime", async (_, action, profileId) => {
      if (action === "status") return this.runtime.status();
      if (action === "ensure") return this.runtime.ensure((await this.profiles.get(profileId)).localModels);
      if (action !== "start" && action !== "stop") throw Error("无效的模型服务操作");
      return this.runtime.action(action);
    });
    this.ipc.handle("smart-library:index", async (_, id, action, profileId) => {
      if(this.evaluation.isBusy()&&action!=="status")throw Error("评测正在运行，请先停止或等待完成");
      if (action === "start" && this.runtime.isStopping()) throw Error("模型服务正在停止，请稍候再启动任务");
      if (!["status", "prepare", "start", "pause", "rebuild"].includes(action)) throw Error("无效索引操作");
      await this.book(id);
      const profile=await this.profiles.get(profileId);
      if(["prepare","rebuild","start"].includes(action)&&(this.qa.isBusy()||this.searches.size||await this.indexes.isBusy()))throw Error("请先停止或等待当前索引、检索或回答完成");
      const settings = ["prepare", "start", "rebuild"].includes(action) ? profile.localModels : undefined;
      if (action === "start" && this.runtime.isStopping()) throw Error("模型服务正在停止，请稍候再启动任务");
      return this.indexes.requestProfile(profile,id,action,settings);
    });
    this.ipc.handle("smart-library:index-chunk", async (_, id, ordinal, profileId) => { await this.book(id); return this.indexes.requestProfile(await this.profiles.get(profileId),id,"chunk",undefined,ordinal); });
    this.ipc.handle("smart-library:local-models", () => this.models.get());
    this.ipc.handle("smart-library:save-local-models", async (_, settings) => {await this.models.save(settings);await this.profiles.updateDefaultModels(settings);});
    this.ipc.handle("smart-library:test-local-model", (_, kind, settings, caseId) => { if(this.evaluation.isBusy())throw Error("评测正在使用本地模型，请先停止或等待完成"); if (this.runtime.isStopping()) throw Error("模型服务正在停止"); return this.models.probe(kind, settings, caseId); });
    this.ipc.handle("smart-library:list", () => this.list());
    this.ipc.handle("smart-library:import", () => this.importBooks());
    this.ipc.handle("smart-library:chapter", (_, id, chapter) => this.chapter(id, chapter));
    this.ipc.handle("smart-library:remember", (_, id, chapter) => {
      const task = this.writes.then(async () => { const book = await this.book(id); this.validateChapter(book, chapter); book.chapter = chapter; await this.save(book); });
      this.writes = task.catch(() => {}); return task;
    });
  }
  async dispose() { for (const op of ["strategy-profiles", "evaluation-runs", "question-bank", "question-bank-evidence", "evaluation-evidence", "evaluate", "qa-strategies", "qa-sessions", "qa-models", "qa-history", "qa-ask", "qa-stop", "qa-evidence", "search", "cancel-search", "evidence", "list", "import", "chapter", "remember", "local-models", "save-local-models", "test-local-model", "index", "index-chunk", "model-runtime"]) this.ipc.removeHandler(`smart-library:${op}`); await this.bank.dispose(); await this.evaluation.dispose(); await this.qa.dispose(); await this.indexes.dispose(); await this.models.dispose(); await this.runtime.dispose(); await this.worker?.terminate(); await this.writes; }
  private directory(id: unknown) { if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) throw Error("无效的图书 ID"); return join(this.root, id); }
  private async book(id: string): Promise<LibraryBook> { return JSON.parse(await readFile(join(this.directory(id), "book.json"), "utf8")); }
  private validateChapter(book: LibraryBook, n: number) { if (!Number.isInteger(n) || n < 0 || n >= book.chapters.length) throw Error("章节不存在"); }
  private async save(book: LibraryBook) { const file = join(this.directory(book.id), "book.json"); await writeFile(file + ".tmp", JSON.stringify(book)); await rename(file + ".tmp", file); }
  async list(): Promise<LibraryBook[]> {
    await mkdir(this.root, { recursive: true }); const books: LibraryBook[] = [];
    for (const id of await readdir(this.root)) if (/^[a-f0-9]{64}$/.test(id)) { try { books.push(await this.book(id)); } catch { /* Incomplete imports are not shown. */ } }
    return books.sort((a, b) => b.addedAt - a.addedAt);
  }
  async chapter(id: string, n: number) { const book = await this.book(id); this.validateChapter(book, n); return readFile(join(this.directory(id), `${n}.txt`), "utf8"); }
  async importBooks() {
    if (this.busy) throw Error("正在导入，请稍候"); this.busy = true;
    const errors: string[] = [];
    try {
      for (const file of await this.selectFiles()) {
        let stage = "";
        try {
          if ((await stat(file)).size > 80 * 1024 * 1024) throw Error("单本图书不能超过 80 MB");
          const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk);
          const id = hash.digest("hex");
          if ((await this.list()).some(b => b.id === id)) continue;
          const parsed = await new Promise<ParsedBook>((resolve, reject) => {
            const worker = this.worker = new Worker(join(__dirname, "library-import.cjs"), { workerData: { path: file } });
            const timer = setTimeout(() => { void worker.terminate(); reject(Error("图书解析超时")); }, 90000);
            worker.once("message", value => value.error ? reject(Error(value.error)) : resolve(value.book));
            worker.once("error", reject); worker.once("exit", code => { clearTimeout(timer); if (code) reject(Error("图书解析已中断")); });
          });
          stage = join(this.root, `${id}.importing`); await rm(stage, { recursive: true, force: true }); await mkdir(stage, { recursive: true });
          const book: LibraryBook = { id, title: parsed.title, author: parsed.author, format: extname(file).toLowerCase() === ".epub" ? "epub" : "txt", addedAt: Date.now(), chapter: 0, chapters: parsed.chapters.map((c, i) => ({ id: i, title: c.title, characters: c.text.length })) };
          await cp(file, join(stage, `original.${book.format}`));
          for (const [i, chapter] of parsed.chapters.entries()) await writeFile(join(stage, `${i}.txt`), chapter.text);
          await writeFile(join(stage, "book.json"), JSON.stringify(book)); await rename(stage, this.directory(id)); stage = "";
        } catch (error) { errors.push(`${basename(file)}：${error instanceof Error ? error.message : error}`); }
        finally { if (stage) await rm(stage, { recursive: true, force: true }); }
      }
      return { books: await this.list(), errors };
    } finally { this.busy = false; }
  }
}
