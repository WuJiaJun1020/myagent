import type { BankAction, BankBulkAction, BankEntry, LibraryQuestion } from "../../../shared/contracts/library-question-bank";

export function validateQuestion(raw: string, source: string, q: LibraryQuestion) {
  if (q.source_sha256 !== source) throw Error("题目与当前图书不是同一份原文");
  if (!q.question.trim() || !q.answer.trim() || !q.reasoning.trim()) throw Error("题目、答案和推理说明不能为空");
  if (q.evidence.length < 2 || !q.evidence.some(e => e.required)) throw Error("证据不足");
  const ids = new Set<string>();
  for (const e of q.evidence) {
    if (ids.has(e.evidence_id)) throw Error("证据编号重复"); ids.add(e.evidence_id);
    if (!Number.isInteger(e.start_utf16) || !Number.isInteger(e.end_utf16) || e.start_utf16 < 0 || e.end_utf16 <= e.start_utf16 || !e.quote || raw.slice(e.start_utf16,e.end_utf16) !== e.quote) throw Error(`证据 ${e.evidence_id} 与原文坐标不一致`);
    if (!e.supports.trim()) throw Error("证据支持的答案要点不能为空");
  }
}

// Only explicit human review actions can cross the approval/publication gate.
export function reviewEntry(entry: BankEntry, request: BankAction): BankEntry {
  if (request.revision !== entry.revision) throw Error("题目已更新，请重新打开后审核");
  const next = structuredClone(entry);
  if (request.reviewNote !== undefined) {
    if (typeof request.reviewNote !== "string" || request.reviewNote.length > 5000) throw Error("审核备注过长");
    next.reviewNote = request.reviewNote.trim();
  }
  switch(request.action) {
    case "note": break;
    case "save": {
      const edit = request.edit;
      if (!edit || ![edit.question,edit.answer,edit.reasoning].every(v => typeof v === "string" && v.trim() && v.length <= 20000) || !Array.isArray(edit.supports) || edit.supports.length !== next.question.evidence.length || !edit.supports.every(v => typeof v === "string" && v.trim() && v.length <= 5000)) throw Error("编辑内容无效");
      Object.assign(next.question,{question:edit.question.trim(),answer:edit.answer.trim(),reasoning:edit.reasoning.trim()});
      next.question.evidence.forEach((e,i) => e.supports=edit.supports[i].trim());
      next.status="pending"; next.published=false; break;
    }
    case "approve": next.status="approved"; break;
    case "reject": next.status="rejected"; next.published=false; break;
    case "reset": next.status="pending"; next.published=false; break;
    case "publish": if(next.status!=="approved") throw Error("请先审核通过，才能加入评测"); next.published=true; break;
    case "unpublish": next.published=false; break;
    default: throw Error("题库操作无效");
  }
  next.revision++; next.updatedAt=Date.now(); return next;
}
export function publishedQuestions(entries: BankEntry[]) { return entries.filter(e => e.status === "approved" && e.published).map(e => structuredClone(e.question)); }

// Build the whole result before persistence: a stale or invalid member cannot
// leave a partially approved batch. Never replace questions or review notes.
export function reviewMany(entries: BankEntry[], request: BankBulkAction): BankEntry[] {
  if (!Array.isArray(request.entries) || !request.entries.length || request.entries.length > entries.length || typeof request.publish !== "boolean") throw Error("批量审核请求无效");
  const targets=new Map<string,number>();
  for (const target of request.entries) {
    if (!target || typeof target.id !== "string" || !Number.isInteger(target.revision) || target.revision < 0 || targets.has(target.id)) throw Error("批量审核题目或版本无效");
    const entry=entries.find(e=>e.question.sample_id===target.id);
    if (!entry) throw Error(`题库中没有题目 ${target.id}`);
    if (entry.revision !== target.revision) throw Error(`题目 ${target.id} 已更新，请重新打开题库后重试`);
    targets.set(target.id,target.revision);
  }
  return entries.map(entry=>{
    if (!targets.has(entry.question.sample_id)) return entry;
    const next=reviewEntry(entry,{id:entry.question.sample_id,revision:entry.revision,action:"approve"});
    if (request.publish) next.published=true;
    return next;
  });
}
