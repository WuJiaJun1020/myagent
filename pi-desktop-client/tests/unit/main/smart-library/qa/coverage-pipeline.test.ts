import { describe, expect, it, vi } from "vitest";
import { runRagEvidence, type RagPipelineOptions } from "../../../../../src/main/smart-library/qa/rag-pipeline";
import { coverageStrategyProfile } from "../../../../../src/shared/contracts/library-strategy";
import type { LibrarySearchHit, LibrarySearchRequest, LibrarySearchResult, LibraryEvidenceReference } from "../../../../../src/shared/contracts/smart-library";

function fixture(spans=[{chapter:0,start:0,end:100}]) {
  const profile=coverageStrategyProfile();profile.context.expandChars=0;
  const source="甲乙丙丁戊己庚辛壬癸".repeat(200);
  const hits:LibrarySearchHit[]=spans.map((span,i)=>({...span,id:String(i),ordinal:i,title:`章 ${span.chapter}`,text:source.slice(span.start,span.end),selectionReason:"按要点保留"}));
  const search=vi.fn(async(input:LibrarySearchRequest):Promise<LibrarySearchResult>=>({version:"v1",hits,warnings:[],keywordCount:hits.length,vectorCount:hits.length,reranked:true,elapsedMs:1,plan:{queries:[input.query,...input.subqueries??[]],routes:[],candidates:[]}}));
  const generate=vi.fn(async()=>JSON.stringify({subqueries:["物品如何获得","物品后来如何使用"]}));
  const evidence=vi.fn(async(reference:LibraryEvidenceReference,expand:number)=>{const hit=hits.find(h=>h.id===reference.id)!;const start=Math.max(0,hit.start-expand),end=Math.min(source.length,hit.end+expand);return {title:hit.title,text:source.slice(start,end),highlight:{start:hit.start-start,end:hit.end-start}};});
  const options:RagPipelineOptions={profile,question:"物品怎样获得，后来如何使用",token:"t",history:[],model:{providerId:"p",modelId:"m"},signal:new AbortController().signal,version:"v1",search,evidence,generate};
  return {options,source,hits,search,generate,evidence};
}
describe("multi-query QA and evaluation pipeline",()=>{
  it("plans once, retains the original query and exact model request, and preserves reading limits",async()=>{
    const f=fixture();f.options.readingPage=4;f.options.readingStartPage=2;f.options.profile.rewrite.mode="always";
    f.options.profile.rewrite.model={providerId:"planner",modelId:"plan"};
    const result=await runRagEvidence(f.options);
    expect(f.generate).toHaveBeenCalledOnce();expect(result.debug[0].purpose).toBe("检索规划");expect(result.debug[0].request.model?.modelId).toBe("plan");
    expect(JSON.parse(result.debug[0].request.messages[1].content)).toEqual({question:f.options.question,maxSubqueries:4,historyForPronounsOnly:[]});
    expect(f.search.mock.calls[0][0]).toMatchObject({query:f.options.question,subqueries:["物品如何获得","物品后来如何使用"],readingPage:4,readingStartPage:2});
  });
  it("accepts simple questions and removes original/duplicate subqueries",async()=>{
    const f=fixture();f.generate.mockResolvedValue('{"subqueries":[]}');
    expect((await runRagEvidence(f.options)).search.plan?.queries).toHaveLength(1);
    f.generate.mockResolvedValue(JSON.stringify({subqueries:[f.options.question,"物品如何获得","物品 如何获得"]}));
    expect((await runRagEvidence(f.options)).search.plan?.queries).toHaveLength(2);
  });
  it("records invalid planning as a visible fallback, and never retrieves after cancellation",async()=>{
    const f=fixture();f.generate.mockResolvedValue('{"subqueries":[42]}');
    const result=await runRagEvidence(f.options);expect(result.warnings.join()).toContain("检索规划失败");expect(result.debug[0].error).toBeTruthy();expect(f.search.mock.calls[0][0].subqueries).toEqual([]);
    const stopped=fixture(),controller=new AbortController();stopped.options.signal=controller.signal;
    stopped.generate.mockImplementation(async()=>{controller.abort();return '{"subqueries":[]}';});
    await expect(runRagEvidence(stopped.options)).rejects.toThrow();expect(stopped.search).not.toHaveBeenCalled();
  });
  it("merges touching original excerpts without crossing chapters or losing source IDs",async()=>{
    const f=fixture([{chapter:0,start:10,end:50},{chapter:0,start:40,end:80},{chapter:1,start:10,end:50}]);f.options.profile.context.expandChars=10;
    const result=await runRagEvidence(f.options);
    expect(result.citations).toHaveLength(2);expect(result.citations[0].excerpt.text).toBe(f.source.slice(0,90));
    expect(result.citations[0].sourceIds).toEqual(["0","1"]);expect(result.citations[0].reference.contextSpan).toEqual({start:0,end:90});
    expect(result.citations[0].excerpt.highlight).toEqual({start:10,end:50});expect(result.search.plan?.contexts?.[1].decision).toBe("merged");
  });
  it("merges a bridge across previously separate excerpts and preserves the first citation's highlight",async()=>{
    const f=fixture([{chapter:0,start:80,end:120},{chapter:0,start:0,end:40},{chapter:0,start:30,end:100}]);f.options.profile.context.chunks=2;
    const result=await runRagEvidence(f.options);expect(result.citations).toHaveLength(1);
    expect(result.citations[0].sourceIds).toEqual(["0","1","2"]);expect(result.citations[0].excerpt.text).toBe(f.source.slice(0,120));expect(result.citations[0].excerpt.highlight).toEqual({start:80,end:120});
  });
  it("continues after an over-budget excerpt so shorter evidence is not discarded",async()=>{
    const f=fixture([{chapter:0,start:0,end:600},{chapter:1,start:0,end:800},{chapter:2,start:0,end:300}]);f.options.profile.context.maxChars=1000;
    const result=await runRagEvidence(f.options);expect(result.citations.map(c=>c.reference.id)).toEqual(["0","2"]);expect(result.search.plan?.contexts?.map(d=>d.decision)).toEqual(["included","budget","included"]);
    expect(result.warnings.join()).toContain("字符预算");
  });
});
