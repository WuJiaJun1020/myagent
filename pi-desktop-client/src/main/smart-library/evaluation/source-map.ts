import type { EvaluationSpan } from "../../../shared/contracts/library-evaluation";

type Mapped = { text: string; offsets: Int32Array };
function replace(input:Mapped, pattern:RegExp, positions:(match:string)=>number[]):Mapped {
  const offsets=new Int32Array(input.text.length),parts:string[]=[];let cursor=0,output=0;
  for(const match of input.text.matchAll(pattern)) {
    const i=match.index!;parts.push(input.text.slice(cursor,i));offsets.set(input.offsets.subarray(cursor,i),output);output+=i-cursor;
    const selected=positions(match[0]);parts.push(selected.map(p=>input.text[i+p]).join(""));
    for(const p of selected)offsets[output++]=input.offsets[i+p];cursor=i+match[0].length;
  }
  parts.push(input.text.slice(cursor));offsets.set(input.offsets.subarray(cursor),output);output+=input.text.length-cursor;
  return {text:parts.join(""),offsets:offsets.subarray(0,output)};
}
function normalize(raw:string,start:number):Mapped {
  let input:Mapped={text:raw,offsets:Int32Array.from({length:raw.length},(_,i)=>start+i)};
  input=replace(input,/\r\n?/g,m=>m.length===2?[1]:[0]);input.text=input.text.replace(/\r/g,"\n");
  input=replace(input,/[ \t]+\n/g,m=>[m.length-1]);
  input=replace(input,/\n{3,}/g,()=>[0,1]);
  const left=input.text.length-input.text.trimStart().length,right=input.text.trimEnd().length;
  return {text:input.text.slice(left,right),offsets:input.offsets.subarray(left,right)};
}
const heading=/^\s*(?:第[零〇一二三四五六七八九十百千万两\d]+[卷章节回部篇]|chapter\s+\d+)[^\n]{0,65}$/i;
export function mapChapters(raw:string, canonical:{chapter:number;text:string}[]) {
  const chapters:Mapped[]=[];let start=0;
  const add=(end:number)=>{const mapped=normalize(raw.slice(start,end),start);if(mapped.text)chapters.push(mapped);};
  for(const line of raw.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
    if(!line[0])continue;
    if(heading.test(line[0].replace(/[\r\n]+$/,""))) {add(line.index!);start=line.index!+line[0].length;}
  }
  add(raw.length);
  if(chapters.length!==canonical.length||canonical.some((c,i)=>c.chapter!==i||c.text!==chapters[i].text))throw Error("评测原文映射与有效索引不同，已停止，不能按章节编号猜测匹配");
  return chapters;
}
function lowerBound(values:Int32Array,value:number) {let a=0,b=values.length;while(a<b){const m=(a+b)>>>1;if(values[m]<value)a=m+1;else b=m;}return a;}
export function mapEvidence(raw:string,chapters:Mapped[],e:{start_utf16:number;end_utf16:number;quote:string}):EvaluationSpan {
  if(!Number.isInteger(e.start_utf16)||!Number.isInteger(e.end_utf16)||e.start_utf16<0||e.end_utf16<=e.start_utf16||raw.slice(e.start_utf16,e.end_utf16)!==e.quote)throw Error("标准证据短引与原文坐标不一致");
  for(const [chapter,c] of chapters.entries()) {
    if(!c.offsets.length||e.start_utf16<c.offsets[0]||e.end_utf16-1>c.offsets[c.offsets.length-1])continue;
    const start=lowerBound(c.offsets,e.start_utf16),end=lowerBound(c.offsets,e.end_utf16);
    if(end>start)return {chapter,start,end};
  }
  throw Error("标准证据不在有效索引正文内（可能仅标在标题上）");
}
