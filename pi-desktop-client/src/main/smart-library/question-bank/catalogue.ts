import type { BankEntry, LibraryQuestion, QuestionBank } from "../../../shared/contracts/library-question-bank";
export function mergeCatalogue(batch:{batch:string;model:string;promptVersion:string;residentGeneration?:string},seeds:LibraryQuestion[],stored?:QuestionBank):QuestionBank {
  const byId=new Map(stored?.entries.map(e=>[e.question.sample_id,e]));
  return {...batch,entries:seeds.map(q=>{
    const old=byId.get(q.sample_id);
    // Append under a stable inventory ID: preserve human edits/approvals of existing IDs.
    // Replacing the inventory explicitly must not inherit approvals merely by reused IDs.
    const resident=!!batch.residentGeneration&&q.generation===batch.residentGeneration;
    return old&&stored?.batch===batch.batch?old:{question:q,revision:0,status:resident?"approved":"pending",published:resident,reviewNote:""} satisfies BankEntry;
  })};
}
