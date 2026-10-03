import { parentPort, workerData } from "node:worker_threads";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import batch from "../../../../resources/smart-library/question-bank/candidates.json";
import type { BankAction, BankBulkAction, QuestionBank, LibraryQuestion } from "../../../shared/contracts/library-question-bank";
import type { LibraryBook, LibraryEvidence } from "../../../shared/contracts/smart-library";
import { reviewEntry, reviewMany, validateQuestion, publishedQuestions } from "./review";
import { parseBook } from "../book-parser";
import { mapChapters, mapEvidence } from "../evaluation/source-map";
import { mergeCatalogue } from "./catalogue";
import type { BankRequest } from "./worker-contract";

const root=workerData.root as string;
let source:{book:string;raw:string}|undefined;
let pages:{book:string;canonical:Awaited<ReturnType<typeof parseBook>>;mapped:ReturnType<typeof mapChapters>;reader:Awaited<ReturnType<typeof parseBook>>}|undefined;
async function raw(book:string) {
  if(source?.book!==book) {
    const bytes=await readFile(join(root,book,"original.txt"));
    if(createHash("sha256").update(bytes).digest("hex")!==book)throw Error("原始图书 SHA-256 校验失败");
    source={book,raw:new TextDecoder("utf-8",{fatal:true}).decode(bytes)};pages=undefined;
  }
  return source!.raw;
}
function location(book:string){return join(root,"question-bank",book+".json");}
async function list(book:string):Promise<QuestionBank> {
  const seeds=(batch.questions as LibraryQuestion[]).filter(q=>q.source_sha256===book);
  let stored:QuestionBank|undefined;
  try {stored=JSON.parse(await readFile(location(book),"utf8"));}
  catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw Error("审核记录读取失败，已停止操作以避免覆盖，请保留记录检查");}
  const next=mergeCatalogue({batch:batch.batch,model:batch.model,promptVersion:batch.promptVersion,residentGeneration:batch.residentGeneration},seeds,stored);
  // One-time retirement migration on the matching book, in the same serialized
  // queue as edits. Keep retained entries byte-for-byte in meaning and save once.
  if(seeds.length&&stored&&(stored.entries.some(e=>!seeds.some(q=>q.sample_id===e.question.sample_id))||stored.residentGeneration!==batch.residentGeneration))return save(book,next);
  return next;
}
async function preview(book:string,q:LibraryQuestion,evidence:string):Promise<LibraryEvidence> {
  const text=await raw(book);validateQuestion(text,book,q);
  const e=q.evidence.find(e=>e.evidence_id===evidence);if(!e)throw Error("题目证据不存在");
  if(pages?.book!==book) {
    const bytes=Buffer.from(text,"utf8");
    const canonical=await parseBook(bytes,"original.txt",false),reader=await parseBook(bytes,"original.txt",true);
    const meta=JSON.parse(await readFile(join(root,book,"book.json"),"utf8")) as LibraryBook;
    if(meta.chapters.length!==reader.chapters.length||meta.chapters.some((c,i)=>c.title!==reader.chapters[i].title||c.characters!==reader.chapters[i].text.length))throw Error("阅读页与原书解析版本不一致，请重新导入后定位");
    pages={book,canonical,reader,mapped:mapChapters(text,canonical.chapters.map((c,i)=>({chapter:i,text:c.text})))};
  }
  const span=mapEvidence(text,pages.mapped,e),c=pages.canonical.chapters[span.chapter];
  const start=Math.max(0,span.start-240),end=Math.min(c.text.length,span.end+240);
  const result:LibraryEvidence={title:`${e.chapter_label} · ${e.evidence_id}`,text:c.text.slice(start,end),highlight:{start:span.start-start,end:span.end-start}};
  let canonicalChapter=0,cursor=0;
  for(const [page,p] of pages.reader.chapters.entries()) {
    let at=pages.canonical.chapters[canonicalChapter]?.text.indexOf(p.text,cursor)??-1;
    while(at<0&&canonicalChapter<pages.canonical.chapters.length-1){canonicalChapter++;cursor=0;at=pages.canonical.chapters[canonicalChapter].text.indexOf(p.text);}
    if(at<0)throw Error("阅读页映射失败");
    if(canonicalChapter===span.chapter&&span.start>=at&&span.end<=at+p.text.length){result.page=page;result.pageHighlight={start:span.start-at,end:span.end-at};break;}
    cursor=at+p.text.length;
  }
  if(result.page===undefined)result.locationError="此证据跨阅读页，可在原文上下文中核对。";
  return result;
}
async function handle(book:string,action:string,payload:any) {
  if(!/^[a-f0-9]{64}$/.test(book))throw Error("图书标识无效");
  const bank=await list(book);
  if(action==="list")return bank;
  if(action==="published") {
    const questions=publishedQuestions(bank.entries);
    if(questions.length){const text=await raw(book);for(const q of questions)validateQuestion(text,book,q);}
    return questions;
  }
  if(action==="review"&&payload?.action==="approve_many") {
    const next=reviewMany(bank.entries,payload as BankBulkAction);
    const text=await raw(book);
    for(let i=0;i<next.length;i++)if(next[i]!==bank.entries[i])validateQuestion(text,book,next[i].question);
    bank.entries=next;
    return save(book,bank);
  }
  const id=action==="evidence"?payload?.question:payload?.id;
  const entry=bank.entries.find(e=>e.question.sample_id===id);if(!entry)throw Error("题库中没有这道题");
  if(action==="evidence")return preview(book,entry.question,payload.evidence);
  if(action!=="review")throw Error("题库操作无效");
  const updated=reviewEntry(entry,payload as BankAction);
  // Validate both initial source and any human-edited answer/evidence descriptions.
  validateQuestion(await raw(book),book,updated.question);
  bank.entries[bank.entries.indexOf(entry)]=updated;
  return save(book,bank);
}
async function save(book:string,bank:QuestionBank) {
  const file=location(book);await mkdir(join(root,"question-bank"),{recursive:true});
  await writeFile(file+".tmp",JSON.stringify(bank));await rename(file+".tmp",file);return bank;
}
// Serialize every read/mutation to avoid stale approvals and concurrent lost writes.
let queue=Promise.resolve();
parentPort!.on("message",(message:BankRequest)=>{
  queue=queue.then(async()=>{try{parentPort!.postMessage({request:message.request,value:await handle(message.book,message.action,"payload" in message ? message.payload : undefined)});}catch(e){parentPort!.postMessage({request:message.request,error:e instanceof Error?e.message:String(e)});}});
});
