import type { ModelGateway, ModelRequest } from "../../../platform/shared/ai/model-gateway";
import type { LibraryBook, LibraryQaRange, LibraryQaDebugCall, LibraryEvidence, LibraryLocalModels, LibraryQaHistory, LibraryQaInput, LibraryQaTurn, LibraryQaSession } from "../../../shared/contracts/smart-library";
import type { LibraryIndexService } from "../indexing/index-service";
import { getQaStrategy, listQaStrategies } from "./strategy-registry";
import { DEFAULT_LIBRARY_QA_STRATEGY } from "../../../shared/contracts/smart-library";
import type { QaSessionAction } from "../indexing/worker-contract";

import type { LibraryProfileStore } from "../strategies/profile-store";
import { defaultStrategyProfile } from "../../../shared/contracts/library-strategy";

type Task = { turn: LibraryQaTurn; controller: AbortController; ready: Promise<void>; done?: Promise<void>; publish: (turn: LibraryQaTurn) => void; writes: Promise<void>; lastPublish: number; lastSave: number };
export class LibraryQaService {
  private task?: Task;
  private disposed = false;
  private managing = false;
  constructor(private indexes: LibraryIndexService, private gateway: ModelGateway | undefined,
    private readBook: (book: string) => Promise<LibraryBook>, private settings: () => Promise<LibraryLocalModels>, private profiles?: LibraryProfileStore) {}
  async models() { return { models: await this.gateway?.getAvailableModels?.() ?? [], configured: await this.gateway?.getConfiguredModel?.() ?? null }; }
  async strategies() { return this.profiles ? (await this.profiles.list()).map(p=>({id:p.id,name:p.name,version:String(p.revision),description:p.description,model:p.answer.model,reasoning:p.answer.reasoning})) : listQaStrategies(); }
  isBusy() { return !!this.task; }
  async sessions(book: string, action: QaSessionAction = "list", sessionId?: string, title?: string, range?: LibraryQaRange | null, strategyId?: string) {
    if (this.disposed) throw Error("图书问答已关闭");
    const mutation = action !== "list";
    if (mutation && (this.task || this.managing)) throw Error("请先停止或等待当前回答完成，再管理会话");
    if (mutation) this.managing = true;
    try { if(action === "strategy") { if(typeof strategyId !== "string") throw Error("回答策略无效"); if(this.profiles)await this.profiles.get(strategyId);else getQaStrategy(strategyId); } const metadata=await this.readBook(book); if(action==="range" && range && (range.end>=metadata.chapters.length || range.start<0 || range.start>range.end)) throw Error("检索页码范围无效"); return await this.indexes.request(book, "qa-sessions", undefined, undefined, { action, sessionId, title, range, strategyId }); }
    finally { if (mutation) this.managing = false; }
  }
  async history(book: string, before?: number, sessionId = "default"): Promise<LibraryQaHistory> {
    await this.readBook(book); const result: LibraryQaHistory = await this.indexes.request(book, "qa-list", undefined, undefined, { before, sessionId });
    if (this.task?.turn.book === book) result.turns = result.turns.map(t => t.id === this.task!.turn.id ? structuredClone(this.task!.turn) : t);
    return result;
  }
  private publish(task: Task) { task.turn.revision++; task.turn.updatedAt = Date.now(); task.lastPublish = Date.now(); try { task.publish(structuredClone(task.turn)); } catch { /* Window may have closed. */ } }
  private save(task: Task) {
    task.lastSave = Date.now(); const snapshot = structuredClone(task.turn);
    task.writes = task.writes.then(async () => { const saved: LibraryQaTurn = await this.indexes.request(snapshot.book, "qa-save", undefined, undefined, snapshot); task.turn.seq = saved.seq; });
    return task.writes;
  }
  async start(book: string, input: LibraryQaInput, publish: Task["publish"]): Promise<LibraryQaTurn> {
    if (this.disposed) throw Error("图书问答已关闭");
    if (this.managing) throw Error("正在管理会话，请稍后发送");
    if (this.task) throw Error("已有图书回答正在生成，请先停止或等待完成");
    if (!this.gateway) throw Error("模型网关不可用，请检查模型设置并重启客户端");
    if (!input || (input.sessionId !== undefined && (typeof input.sessionId !== "string" || !/^[\w-]{1,100}$/.test(input.sessionId))) || typeof input.id !== "string" || !/^[\w-]{1,100}$/.test(input.id) || typeof input.question !== "string" || !input.question.trim() || input.question.length > 200
      || !input.model || typeof input.model.providerId !== "string" || typeof input.model.modelId !== "string"
      || (input.readingPage !== undefined && (!Number.isInteger(input.readingPage) || input.readingPage < 0))) throw Error("问题或模型配置无效，问题限 200 字符");
    const turn: LibraryQaTurn = { id: input.id, sessionId: input.sessionId ?? "default", question: input.question.trim(), model: input.model, reasoning: input.reasoning, readingPage: input.readingPage, readingStartPage: input.readingStartPage, debug: [],
      book, revision: 0, createdAt: Date.now(), updatedAt: Date.now(), state: "retrieving", answer: "", citations: [], warnings: [] };
    let release!: () => void;
    const task: Task = { turn, ready: new Promise<void>(resolve => { release = resolve; }), controller: new AbortController(), publish, writes: Promise.resolve(), lastPublish: 0, lastSave: 0 };
    this.task = task;
    try {
      const metadata = await this.readBook(book); if (input.readingPage !== undefined && input.readingPage >= metadata.chapters.length) throw Error("阅读页不存在");
      if(input.readingStartPage!==undefined && (!Number.isInteger(input.readingStartPage) || input.readingStartPage<0 || input.readingPage===undefined || input.readingStartPage>input.readingPage)) throw Error("检索起止页码无效");
      const sessions: LibraryQaSession[] = await this.indexes.request(book, "qa-sessions", undefined, undefined, { action: "list" });
      const session = sessions.find(row => row.id === turn.sessionId);
      if (!session && turn.sessionId !== "default") throw Error("会话不存在");
      if(!this.profiles)getQaStrategy(session?.strategyId ?? DEFAULT_LIBRARY_QA_STRATEGY);
      const profile = this.profiles ? await this.profiles.get(session?.strategyId ?? DEFAULT_LIBRARY_QA_STRATEGY) : defaultStrategyProfile(await this.settings());
      const strategy = { info: {id:profile.id,name:profile.name,version:String(profile.revision),description:profile.description} };
      getQaStrategy(profile.engine);
      // The profile supplies a UI default; the visible composer selection wins.
      turn.profile={...profile,answer:{...profile.answer,model:turn.model,reasoning:turn.reasoning}};
      if (input.strategyId !== undefined && input.strategyId !== strategy.info.id) throw Error("会话策略已变化，请刷新后重新发送");
      turn.strategyId = strategy.info.id;
      turn.strategy = { ...strategy.info };
      const available = (await this.models()).models;
      const model = available.find(m => m.providerId === turn.model.providerId && m.modelId === turn.model.modelId);
      if (!model) throw Error("选择的回答模型不可用，请在模型设置中配置后刷新列表");
      if (turn.reasoning && !model.reasoningLevels.includes(turn.reasoning)) throw Error("该模型不支持选择的思考程度");
      task.controller.signal.throwIfAborted();
      if (await this.indexes.request(book, "qa-get", undefined, undefined, turn.id)) throw Error("此问题已提交，请不要重复发送");
      if (task.controller.signal.aborted) throw Error("已停止发送");
      await this.save(task); this.publish(task);
      const initial = structuredClone(turn);
      task.done = this.run(task, metadata);
      return initial;
    } catch (e) { if (this.task === task) this.task = undefined; throw e; } finally { release(); }
  }
  async stop(book: string, id: string) {
    const task = this.task; if (task?.turn.book !== book || task.turn.id !== id) return;
    task.controller.abort();
    await (this.profiles && task.turn.profile ? this.indexes.scoped(task.turn.profile) : this.indexes).request(book, "cancel-search", undefined, undefined, id);
  }
  private request(turn: LibraryQaTurn, purpose: string, messages: ModelRequest["messages"], output: number): ModelRequest {
    return { metadata: { moduleId: "smart-library", purpose, privacy: "internal", budget: { timeoutMs: purpose === "rewrite_question" ? 45000 : 120000, maxInputTokens: 24000, maxOutputTokens: output }, traceId: turn.id },
      model: turn.model, reasoning: turn.reasoning, messages, responseFormat: { type: "text" } };
  }
  private async answer(task: Task, answerRequest: ModelRequest, label = "图书回答") {
    const turn = task.turn, signal = task.controller.signal;
      const trace:LibraryQaDebugCall={purpose:label,request:structuredClone(answerRequest)};turn.debug!.push(trace);
      let completed = false;
      for await (const event of this.gateway!.stream(answerRequest, { signal, onPreparedRequest:prepared=>{trace.prepared=prepared;} })) {
        signal.throwIfAborted();
        if (event.type === "started" && event.diagnostics) {
          turn.context = { estimatedInputTokens: event.diagnostics.estimatedInputTokens, modelContextWindowTokens: event.diagnostics.modelContextWindowTokens }; this.publish(task);
        } else if (event.type === "usage") { turn.usage = event.usage; this.publish(task); }
        else if (event.type === "text_delta") {
          const firstText = !turn.answer;
          turn.answer += event.delta;
          if (turn.answer.length > 24000) { turn.answer = turn.answer.slice(0, 24000); throw Error("回答超过长度上限，已保留前段内容"); }
          turn.updatedAt = Date.now();
          if (firstText || Date.now() - task.lastPublish >= 60) this.publish(task);
          if (Date.now() - task.lastSave >= 1000) await this.save(task);
        } else if (event.type === "failed") throw Error(event.error.message);
        else if (event.type === "completed") {
          trace.response=event.response.text;trace.usage=event.response.usage;
          turn.answer = event.response.text.slice(0, 24000); turn.usage = event.response.usage;
          if (event.response.text.length > 24000) throw Error("回答超过长度上限，已保留前段内容");
          if (event.response.finishReason !== "stop" || !turn.answer.trim()) throw Error(event.response.finishReason === "length" ? "回答达到模型输出上限，已保存不完整内容，可重试或降低思考程度" : "模型未正常完成回答，已保留收到的内容");
          completed = true;
        }
      }
      if (!completed) throw Error("模型连接中断，回答未完成");
  }
  private async run(task: Task, book: LibraryBook) {
    const turn = task.turn; const signal = task.controller.signal; const timer = setTimeout(() => task.controller.abort(Error("问答处理超时")), 240000);
    try {
      const strategy = getQaStrategy(turn.profile?.engine ?? turn.strategy!.id);
      await strategy.execute({ turn, book, signal, indexes: this.profiles && turn.profile ? this.indexes.scoped(turn.profile) : this.indexes, gateway: this.gateway!, settings: this.settings,
        loadHistory: () => this.history(book.id, undefined, turn.sessionId),
        request: (purpose, messages, output) => this.request(turn, purpose, messages, output),
        checkpoint: async persist => { signal.throwIfAborted(); if (persist) await this.save(task); this.publish(task); },
        answer: request => this.answer(task, request),
      });
    } catch (e) {
      turn.state = signal.aborted ? "stopped" : "failed";
      turn.error = signal.aborted ? "已停止，收到的内容已保留。" : e instanceof Error ? e.message : "回答失败，请重试";
      const trace=turn.debug?.at(-1);if(trace){trace.error=turn.error;if(trace.purpose==="图书回答"&&!trace.response)trace.response=turn.answer;}
      // Cancel the transport on exceptional termination too (e.g. output limit).
      task.controller.abort();
    } finally {
      clearTimeout(timer); turn.updatedAt = Date.now();
      try { await this.save(task); } catch { turn.state = "failed"; turn.error = "本轮保存失败，请先复制回答；重启后可能只能恢复上次保存的内容。"; }
      this.publish(task); if (this.task === task) this.task = undefined;
    }
  }
  async evidence(book: string, id: string, number: number): Promise<LibraryEvidence> {
    await this.readBook(book);
    const turn: LibraryQaTurn | null = await this.indexes.request(book, "qa-get", undefined, undefined, id);
    const citation = turn?.citations.find(c => c.number === number); if (!citation) throw Error("引用不存在或不属于当前图书");
    try { return await (this.profiles && turn?.profile ? this.indexes.scoped(turn.profile) : this.indexes).request(book, "evidence", undefined, undefined, citation.reference); }
    catch { return { ...citation.excerpt, page: undefined, pageHighlight: undefined, locationError: "索引或原文定位已变化，显示当时保存的证据；请重新提问后跳转。" }; }
  }
  async dispose() { this.disposed = true; const task = this.task; if (task) { await this.stop(task.turn.book, task.turn.id); await task.ready; await task.done; } }
}
