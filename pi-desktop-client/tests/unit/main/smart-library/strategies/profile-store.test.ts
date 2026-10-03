import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LibraryProfileStore, validateStrategyProfile } from "../../../../../src/main/smart-library/strategies/profile-store";
import { defaultStrategyProfile, strategyIndexConfig, coverageStrategyProfile, COVERAGE_RAG_PROFILE_ID } from "../../../../../src/shared/contracts/library-strategy";
import { DEFAULT_LIBRARY_LOCAL_MODELS } from "../../../../../src/shared/contracts/smart-library";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root,{recursive:true,force:true}))); });
describe("saved library strategy profiles", () => {
  it("preserves the legacy default, copies independently, and persists names and settings", async () => {
    const root=await mkdtemp(join(tmpdir(),"library-profiles-"));roots.push(root);
    const store=new LibraryProfileStore(root,async()=>DEFAULT_LIBRARY_LOCAL_MODELS);
    const initial=await store.get();expect(initial.id).toBe("standard-rag");
    const list=await store.action({action:"create",copyFrom:initial.id});const copy=list.at(-1)!;
    expect(copy.id).not.toBe(initial.id);expect(copy.chunking).toEqual(initial.chunking);
    copy.name="长片段方案";copy.chunking.size=1200;
    await store.action({action:"save",profile:copy});
    const restarted=new LibraryProfileStore(root,async()=>DEFAULT_LIBRARY_LOCAL_MODELS);
    expect(await restarted.get(copy.id)).toMatchObject({name:"长片段方案",revision:2,chunking:{size:1200}});
    expect((await restarted.get()).chunking.size).toBe(800);
    await expect(restarted.action({action:"save",profile:copy})).rejects.toThrow("已被修改");
    expect(JSON.parse(await readFile(join(root,"strategy-profiles.json"),"utf8"))).toHaveLength(3);
  });
  it("only invalidates indexes for chunking or embedding changes", () => {
    const original=defaultStrategyProfile(),changed=structuredClone(original);
    changed.name="改名";changed.retrieval.batchSize=8;changed.rewrite.mode="always";changed.answer.prompt="按顺序回答";
    expect(strategyIndexConfig(changed)).toBe(strategyIndexConfig(original));
    changed.chunking.method="fixed";expect(strategyIndexConfig(changed)).not.toBe(strategyIndexConfig(original));
  });
  it("rejects unsafe IDs, invalid relationships and unsupported engines", () => {
    for (const patch of [{id:"../other"},{engine:"graph-rag"},{createdAt:NaN},{chunking:{method:"fixed",size:100,overlap:100}},{context:{chunks:9,expandChars:240,maxChars:24000,deduplicate:true}}]) {
      expect(()=>validateStrategyProfile({...defaultStrategyProfile(),...patch} as any)).toThrow();
    }
    const valid=defaultStrategyProfile();valid.retrieval.rerank=false;valid.retrieval.mode="keyword";valid.rewrite.mode="off";
    expect(validateStrategyProfile(valid)).toEqual(valid);
    for(const maxSubqueries of [0,5,NaN])expect(()=>validateStrategyProfile({...coverageStrategyProfile(),queryPlanning:{enabled:true,maxSubqueries,prompt:"test"}})).toThrow();
  });
  it("adds the coverage preset to legacy stores once without changing saved configurations",async()=>{
    const root=await mkdtemp(join(tmpdir(),"library-presets-"));roots.push(root);
    const store=new LibraryProfileStore(root,async()=>DEFAULT_LIBRARY_LOCAL_MODELS);
    const original=await store.get();original.name="我的基线";original.retrieval.fusionCandidates=20;
    await store.action({action:"save",profile:original});
    const preset=await store.get(COVERAGE_RAG_PROFILE_ID);expect(preset.queryPlanning?.enabled).toBe(true);
    expect(preset.retrieval.fusionCandidates).toBe(48);expect(strategyIndexConfig(preset)).toBe(strategyIndexConfig(original));
    preset.name="重命名方案 2";preset.queryPlanning!.maxSubqueries=2;await store.action({action:"save",profile:preset});
    const restarted=new LibraryProfileStore(root,async()=>DEFAULT_LIBRARY_LOCAL_MODELS);
    expect(await restarted.get()).toMatchObject({name:"我的基线",retrieval:{fusionCandidates:20}});
    expect(await restarted.get(COVERAGE_RAG_PROFILE_ID)).toMatchObject({name:"重命名方案 2",queryPlanning:{maxSubqueries:2}});
    expect((await restarted.list()).filter(p=>p.id===COVERAGE_RAG_PROFILE_ID)).toHaveLength(1);
  });
});
