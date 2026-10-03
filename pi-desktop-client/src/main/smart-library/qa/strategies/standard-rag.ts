import { answerMessages, compatibleHistory, validateCitations } from "../qa-prompts";
import { defaultStrategyProfile } from "../../../../shared/contracts/library-strategy";
import { runRagEvidence } from "../rag-pipeline";
import type { LibraryQaStrategy } from "../strategy-types";

export const standardRag: LibraryQaStrategy = {
  info: { id: "standard-rag", name: "普通 RAG", version: "1", description: "关键词与向量混合检索、重排，再依据原文回答。" },
  async execute({ turn, book, signal, indexes, gateway, settings, loadHistory, request, checkpoint, answer }) {
    const profile = turn.profile ?? defaultStrategyProfile(await settings());
    const status = await indexes.request(book.id, "status");
    if (!status.activeVersion || status.stale) throw Error(status.stale ? "切片或向量配置已变化，请先重建该方案的索引" : "请先完成该方案的图书索引");
    turn.version = status.activeVersion;
    const previous = (await loadHistory()).turns.filter(t=>t.id!==turn.id && (t.sessionId??"default")===turn.sessionId);
    const history = compatibleHistory(previous, turn.version, turn.readingPage, profile.answer.historyRounds);
    if (previous.length && !history.length && profile.answer.historyRounds) turn.warnings.push("本次未使用旧索引或未完成回答的历史内容。");
    const result = await runRagEvidence({ profile, question: turn.question, token: turn.id, history, model: turn.model, reasoning:turn.reasoning, signal, version: turn.version,
      readingPage: turn.readingPage, readingStartPage: turn.readingStartPage,
      phase: async state=>{turn.state=state;await checkpoint(true);},
      search: input=>indexes.request(book.id,"search",profile.localModels,undefined,input),
      evidence: (reference,expandChars)=>indexes.request(book.id,"context-evidence",undefined,undefined,{reference,expandChars}),
      generate: async (input,trace)=>{
        turn.debug!.push(trace);
        const response=await gateway.generate(input,{signal,onPreparedRequest:p=>{trace.prepared=p;},onResponseDiagnostics:r=>{trace.response=r.text;trace.usage=r.usage;}});
        if(!response.ok)throw Error(response.error.message); trace.usage=response.value.usage;return response.value.text;
      },
    });
    turn.query=result.query;turn.retrieval=result.search;turn.citations=result.citations;turn.warnings.push(...result.warnings);
    if(!turn.citations.length){turn.answer="当前阅读范围内没有检索到可用的原文证据，暂不能据此回答。可以换一个说法、补充人物或事件名称，或调整阅读范围；这不代表书中没有答案。";turn.state="completed";return;}
    turn.state="answering";await checkpoint(true);
    const scope=turn.readingPage===undefined?"全书；检索仅返回有限候选，并非已完整扫描全书":`阅读页 ${(turn.readingStartPage??0)+1} 至 ${turn.readingPage+1}（${book.chapters[turn.readingPage].title}）末尾`;
    const messages=answerMessages(turn.question,history,turn.citations,scope);
    if(profile.answer.prompt)messages[0].content+=`\n用户配置的回答要求：\n${profile.answer.prompt}`;
    await answer(request("answer_book",messages,4096));
    const checked=validateCitations(turn.answer,turn.citations);turn.answer=checked.text;turn.warnings.push(...checked.warnings);turn.state="completed";
  },
};
