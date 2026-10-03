import { describe, expect, it } from "vitest";
import { reviewEntry, reviewMany, publishedQuestions, validateQuestion } from "../../../../../src/main/smart-library/question-bank/review";
import type { BankEntry } from "../../../../../src/shared/contracts/library-question-bank";
const initial=():BankEntry=>({revision:0,status:"pending",published:false,reviewNote:"",question:{sample_id:"S001",source_sha256:"book",difficulty:"简单",question_type:"事实",question:"问题",answer:"答案",reasoning:"说明",evidence:[{evidence_id:"a",chapter_id:"C0001",volume:"卷",chapter_label:"第一章",quote:"甲乙",supports:"第一条",required:true,start_utf16:0,end_utf16:2,line_start:1,line_end:1},{evidence_id:"b",chapter_id:"C0002",volume:"卷",chapter_label:"第二章",quote:"丙丁",supports:"第二条",required:true,start_utf16:2,end_utf16:4,line_start:1,line_end:1}]}});
describe("human question bank review gate",()=>{
  it("pending questions cannot publish; explicit approval alone does not publish",()=>{
    const entry=initial();expect(publishedQuestions([entry])).toEqual([]);
    expect(()=>reviewEntry(entry,{id:"S001",revision:0,action:"publish"})).toThrow(/审核通过/);
    const approved=reviewEntry(entry,{id:"S001",revision:0,action:"approve"});expect(publishedQuestions([approved])).toEqual([]);
    const published=reviewEntry(approved,{id:"S001",revision:1,action:"publish"});expect(publishedQuestions([published])).toHaveLength(1);
  });
  it("editing or rejecting an approved published question revokes eligibility",()=>{
    const published={...initial(),status:"approved" as const,published:true};
    const edited=reviewEntry(published,{id:"S001",revision:0,action:"save",edit:{question:"新问题",answer:"新答案",reasoning:"新推理",supports:["要点1","要点2"]}});
    expect(edited.status).toBe("pending");expect(edited.published).toBe(false);expect(published.question.question).toBe("问题");
    expect(publishedQuestions([reviewEntry(published,{id:"S001",revision:0,action:"reject"})])).toEqual([]);
  });
  it("rejects stale actions and verifies original coordinates/source",()=>{
    expect(()=>reviewEntry(initial(),{id:"S001",revision:9,action:"approve"})).toThrow(/已更新/);
    expect(()=>validateQuestion("甲乙丙丁","book",initial().question)).not.toThrow();
    expect(()=>validateQuestion("甲乙X丁","book",initial().question)).toThrow(/坐标/);
    expect(()=>validateQuestion("甲乙丙丁","other",initial().question)).toThrow(/同一份/);
  });
  it("bulk approval/publication touches only selected IDs and preserves edited content and notes",()=>{
    const edited={...initial(),revision:4,reviewNote:"人工保留",question:{...initial().question,answer:"人工修订答案"}};
    const other={...initial(),question:{...initial().question,sample_id:"S002"}};
    const approved=reviewMany([edited,other],{action:"approve_many",publish:false,entries:[{id:"S001",revision:4}]});
    expect(approved[0]).toMatchObject({status:"approved",published:false,revision:5,reviewNote:"人工保留",question:{answer:"人工修订答案"}});
    expect(approved[1]).toBe(other);expect(publishedQuestions(approved)).toHaveLength(0);
    const published=reviewMany(approved,{action:"approve_many",publish:true,entries:[{id:"S001",revision:5},{id:"S002",revision:0}]});
    expect(publishedQuestions(published)).toHaveLength(2);
    expect(edited.status).toBe("pending");expect(other.status).toBe("pending");
  });
  it("rejects the whole batch on stale, unknown, duplicate or malformed members",()=>{
    const first=initial(),second={...initial(),question:{...initial().question,sample_id:"S002"}};
    const entries=[first,second],before=structuredClone(entries);
    for(const targets of [[],[{id:"S001",revision:0},{id:"S002",revision:9}],[{id:"S001",revision:0},{id:"missing",revision:0}],[{id:"S001",revision:0},{id:"S001",revision:0}],[{id:"S001",revision:-1}]]){
      expect(()=>reviewMany(entries,{action:"approve_many",publish:true,entries:targets})).toThrow();
      expect(entries).toEqual(before);
    }
    expect(()=>reviewMany(entries,{action:"approve_many",entries:[{id:"S001",revision:0}],publish:"yes" as unknown as boolean})).toThrow();
  });
});
