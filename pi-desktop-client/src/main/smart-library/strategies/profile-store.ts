import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { defaultStrategyProfile, coverageStrategyProfile, COVERAGE_RAG_PROFILE_ID, type LibraryStrategyProfile, type StrategyProfileAction } from "../../../shared/contracts/library-strategy";
import type { LibraryLocalModels } from "../../../shared/contracts/smart-library";
import { validateLocalModels } from "../local-models";

export function validateStrategyProfile(value: LibraryStrategyProfile): LibraryStrategyProfile {
  if (!value || typeof value.id !== "string" || !/^[\w-]{1,100}$/.test(value.id) || value.engine !== "standard-rag") throw Error("策略类型或标识无效");
  const text = (v: unknown, max: number, required = false) => { if (typeof v !== "string" || v.length > max || (required && !v.trim())) throw Error("策略名称或提示词无效"); return v; };
  const integer = (v: number, min: number, max: number) => { if (!Number.isInteger(v) || v < min || v > max) throw Error(`策略数值须在 ${min}–${max} 之间`); };
  integer(value.createdAt, 0, Number.MAX_SAFE_INTEGER); integer(value.updatedAt, 0, Number.MAX_SAFE_INTEGER);
  text(value.name, 80, true); text(value.description, 500); integer(value.revision, 1, Number.MAX_SAFE_INTEGER);
  if (!value.chunking || !["paragraph", "fixed"].includes(value.chunking.method)) throw Error("切片方式无效");
  integer(value.chunking.size, 100, 4000); integer(value.chunking.overlap, 0, value.chunking.size - 1);
  validateLocalModels(value.localModels);
  const r = value.retrieval;
  if (!r || !["keyword", "vector", "hybrid"].includes(r.mode) || typeof r.rerank !== "boolean" || ![1,2,4,8,16].includes(r.batchSize)) throw Error("召回配置无效");
  integer(r.keywordCandidates, 1, 200); integer(r.vectorCandidates, 1, 200); integer(r.fusionCandidates, 1, 64); integer(r.returnedChunks, 1, r.fusionCandidates); integer(r.rrfK, 1, 200);
  const c = value.context; if (!c || typeof c.deduplicate !== "boolean") throw Error("上下文配置无效");
  integer(c.chunks, 1, r.returnedChunks); integer(c.expandChars, 0, 2000); integer(c.maxChars, value.chunking.size + c.expandChars * 2, 128000);
  if (!value.rewrite || !["off", "history", "always"].includes(value.rewrite.mode) || !value.answer) throw Error("模型处理配置无效");
  text(value.rewrite.prompt, 12000, true); text(value.answer.prompt, 12000); integer(value.answer.historyRounds, 0, 20);
  if (value.queryPlanning !== undefined) {
    if (!value.queryPlanning || typeof value.queryPlanning.enabled !== "boolean") throw Error("检索规划配置无效");
    integer(value.queryPlanning.maxSubqueries, 1, 4); text(value.queryPlanning.prompt, 12000, true);
  }
  for (const stage of [value.rewrite, value.answer]) {
    if (stage.model !== null && (!stage.model || typeof stage.model.providerId !== "string" || !stage.model.providerId || typeof stage.model.modelId !== "string" || !stage.model.modelId)) throw Error("策略模型无效");
    if (stage.reasoning !== undefined && !["minimal","low","medium","high","xhigh","max"].includes(stage.reasoning)) throw Error("思考深度无效");
  }
  return structuredClone({ ...value, name: value.name.trim(), localModels: validateLocalModels(value.localModels) });
}
export class LibraryProfileStore {
  private writes = Promise.resolve();
  constructor(private root: string, private models: () => Promise<LibraryLocalModels>) {}
  private async read(): Promise<LibraryStrategyProfile[]> {
    let profiles: LibraryStrategyProfile[];
    try { const data = JSON.parse(await readFile(join(this.root, "strategy-profiles.json"), "utf8")); if (!Array.isArray(data) || !data.length) throw Error("策略文件无效"); profiles = data.map(validateStrategyProfile); if (new Set(profiles.map(p=>p.id)).size !== profiles.length) throw Error("策略标识重复"); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; profiles = [defaultStrategyProfile(await this.models())]; }
    // Introduce the preset without rewriting existing profiles or starting an index task.
    if (!profiles.some(p => p.id === COVERAGE_RAG_PROFILE_ID)) profiles.push(coverageStrategyProfile((profiles.find(p => p.id === "standard-rag") ?? profiles[0]).localModels));
    return profiles;
  }
  async list() { await this.writes; return this.read(); }
  async get(id = "standard-rag") { const profile = (await this.list()).find(p=>p.id===id); if (!profile) throw Error("策略方案不存在，请刷新后选择"); return profile; }
  action(request: StrategyProfileAction = { action: "list" }): Promise<LibraryStrategyProfile[]> {
    if (request.action === "list") return this.list();
    const operation = this.writes.then(async () => {
      const profiles = await this.read();
      if (request.action === "create") {
        const source = request.copyFrom ? profiles.find(p=>p.id===request.copyFrom) : defaultStrategyProfile(await this.models());
        if (!source) throw Error("要复制的方案不存在");
        profiles.push({ ...structuredClone(source), id: randomUUID(), name: request.copyFrom ? `${source.name.slice(0,75)} 副本` : "新策略方案", revision: 1, createdAt: Date.now(), updatedAt: Date.now() });
      } else if (request.action === "save") {
        const profile = validateStrategyProfile(request.profile), index = profiles.findIndex(p=>p.id===profile.id);
        if (index < 0 || profiles[index].revision !== profile.revision) throw Error("方案已被修改，请刷新后再保存");
        profiles[index] = { ...profile, revision: profile.revision + 1, createdAt: profiles[index].createdAt, updatedAt: Date.now() };
      } else throw Error("策略操作无效");
      await mkdir(this.root, { recursive: true }); const file = join(this.root, "strategy-profiles.json"); await writeFile(file + ".tmp", JSON.stringify(profiles)); await rename(file + ".tmp", file);
      return profiles;
    });
    this.writes = operation.then(()=>{},()=>{}); return operation;
  }
  async updateDefaultModels(models: LibraryLocalModels) { const profile = await this.get(); return this.action({ action: "save", profile: { ...profile, localModels: models } }); }
}
