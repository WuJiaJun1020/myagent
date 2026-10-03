import { expect,it } from "vitest";
import { mergeCatalogue } from "../../../../../src/main/smart-library/question-bank/catalogue";
import type { LibraryQuestion,QuestionBank } from "../../../../../src/shared/contracts/library-question-bank";
it("appending candidates preserves human reviews and edits; added IDs are pending",()=>{
  const seed={sample_id:"S001",question:"原问题",evidence:[]} as unknown as LibraryQuestion;
  const human={...seed,answer:"人工修订答案"};
  const stored:QuestionBank={batch:"inventory-v1",model:"luna",promptVersion:"v1",entries:[{question:human,revision:7,status:"approved",published:true,reviewNote:"已核对"}]};
  const next=mergeCatalogue({...stored,promptVersion:"v1 / v2"},[seed,{...seed,sample_id:"S011"}],stored);
  expect(next.entries[0]).toEqual(stored.entries[0]);
  expect(next.entries[1]).toMatchObject({revision:0,status:"pending",published:false});
  expect(mergeCatalogue({...stored,batch:"replacement"},[seed],stored).entries[0].status).toBe("pending");
});
it("resident seeds default to evaluation; retired IDs disappear without resetting retained reviews",()=>{
  const q={sample_id:"S011",generation:"fanren-expansion-v2",answer:"原答案"} as LibraryQuestion;
  const batch={batch:"inventory-v1",model:"luna",promptVersion:"v2",residentGeneration:"fanren-expansion-v2"};
  expect(mergeCatalogue(batch,[q]).entries[0]).toMatchObject({status:"approved",published:true});
  const edited={question:{...q,answer:"人工修改"},revision:8,status:"pending" as const,published:false,reviewNote:"重新核对"};
  const retired={...edited,question:{...q,sample_id:"S001"}};
  const stored={...batch,entries:[retired,edited]};
  const next=mergeCatalogue(batch,[q],stored);
  expect(next.entries).toEqual([edited]);
  expect(mergeCatalogue(batch,[{...q,sample_id:"S111",generation:"future"}]).entries[0]).toMatchObject({status:"pending",published:false});
});
