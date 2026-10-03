import { describe, expect, it, vi } from "vitest";
import { runRagEvidence, type RagPipelineOptions } from "../../../../../src/main/smart-library/qa/rag-pipeline";
import { defaultStrategyProfile } from "../../../../../src/shared/contracts/library-strategy";
import type { ModelRequest } from "../../../../../src/platform/shared/ai/model-gateway";
import type { LibraryQaTurn, LibraryQaDebugCall, LibrarySearchRequest, LibraryEvidenceReference } from "../../../../../src/shared/contracts/smart-library";

function fixture() {
  const profile=defaultStrategyProfile();profile.context.expandChars=0;profile.context.maxChars=800;
  const search=vi.fn(async (input:LibrarySearchRequest)=>({version:"v1",hits:[0,1].map(i=>({id:String(i),ordinal:i,chapter:0,title:"章",text:"甲".repeat(500),start:i*500,end:(i+1)*500})),warnings:[],keywordCount:2,vectorCount:2,reranked:true,elapsedMs:1}));
  const generate=vi.fn(async (_request:ModelRequest,_trace:LibraryQaDebugCall)=>'{"query":"苏禾归还铜钥匙了吗"}');
  const evidence=vi.fn(async(_reference:LibraryEvidenceReference,_expandChars:number)=>({title:"章",text:"甲".repeat(500),highlight:{start:0,end:500}}));
  const options:RagPipelineOptions={profile,question:"她还了吗",token:"t",history:[],model:{providerId:"p",modelId:"m"},signal:new AbortController().signal,version:"v1",search,evidence,generate};
  return {options,search,generate,evidence};
}
describe("shared QA and evaluation evidence pipeline",()=>{
  it("history-only rewrite skips independent evaluation questions and honors context budget",async()=>{
    const f=fixture(),result=await runRagEvidence(f.options);
    expect(f.generate).not.toHaveBeenCalled();expect(f.search.mock.calls[0][0].query).toBe("她还了吗");
    expect(result.citations).toHaveLength(1);expect(result.warnings.join()).toContain("字符预算");
    expect(f.evidence.mock.calls[0][1]).toBe(0);
  });
  it("always rewrite executes with no history, uses its own model and records exact request",async()=>{
    const f=fixture();f.options.profile.rewrite.mode="always";f.options.profile.rewrite.model={providerId:"other",modelId:"rewrite"};
    const result=await runRagEvidence(f.options);const request=f.generate.mock.calls[0][0];
    expect(request.model?.modelId).toBe("rewrite");expect(JSON.parse(request.messages[1].content).historyForPronounsOnly).toEqual([]);
    expect(f.search.mock.calls[0][0].query).toBe("苏禾归还铜钥匙了吗");expect(result.debug[0].request).toEqual(request);
    expect(result.rewriteMs).toBeGreaterThanOrEqual(0);
  });
  it("history rewrite and disabled rewrite behave the same in both callers",async()=>{
    const f=fixture();f.options.history=[{question:"钥匙给谁",answer:"苏禾",citations:[]} as unknown as LibraryQaTurn];
    await runRagEvidence(f.options);expect(f.generate).toHaveBeenCalledOnce();
    f.options.profile.rewrite.mode="off";await runRagEvidence(f.options);expect(f.generate).toHaveBeenCalledOnce();
  });
  it("marks rewrite failures and rejects changed indexes or misaligned evidence",async()=>{
    const f=fixture();f.options.profile.rewrite.mode="always";f.generate.mockResolvedValue("invalid");
    expect((await runRagEvidence(f.options)).warnings.join()).toContain("追问改写失败");
    f.options.version="v2";await expect(runRagEvidence(f.options)).rejects.toThrow("索引已更新");
    f.options.version="v1";f.evidence.mockResolvedValue({title:"章",text:"错误",highlight:{start:0,end:2}});
    await expect(runRagEvidence(f.options)).rejects.toThrow("上下文");
  });
  it("aborting a rewrite never starts retrieval",async()=>{
    const f=fixture(),controller=new AbortController();f.options.signal=controller.signal;f.options.profile.rewrite.mode="always";
    f.generate.mockImplementation(async()=>{controller.abort();return '{"query":"甲"}';});
    await expect(runRagEvidence(f.options)).rejects.toThrow();expect(f.search).not.toHaveBeenCalled();
  });
});
