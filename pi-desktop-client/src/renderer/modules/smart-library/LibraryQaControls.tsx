import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import type { AiAvailableModel, ModelReasoningLevel } from "../../../platform/shared/ai/model-gateway";
import type { LibraryQaTurn, LibraryQaStrategyInfo } from "../../../shared/contracts/smart-library";
import { useComposerPopover } from "../../features/chat/use-composer-popover";
import { HoverHint } from "../../components/ui/tooltip";

const labels = { minimal: "最少", low: "低", medium: "中", high: "高", xhigh: "超高", max: "最大" };
export const modelKey = (m: {providerId: string; modelId: string}) => JSON.stringify([m.providerId,m.modelId]);
function Popup({ label, trigger, children, className = "", disabled = false, dismissOnSelect = false }: {disabled?: boolean; dismissOnSelect?: boolean; label: string; trigger: ReactNode; children: ReactNode; className?: string}) {
  const [open,setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const position = useComposerPopover(open,button,panel);
  useEffect(()=>{
    if(!open)return;
    const pointer=(e:PointerEvent)=>{if(!button.current?.contains(e.target as Node)&&!panel.current?.contains(e.target as Node))setOpen(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(false);button.current?.focus();}};
    document.addEventListener("pointerdown",pointer);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",pointer);document.removeEventListener("keydown",escape);};
  },[open]);
  return <div className={`composer-model-control ${className} ${open?"open":""}`}><HoverHint disabled={open} content={label}><button ref={button} type="button" className={className?"context-usage":"composer-model-trigger"} disabled={disabled} aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{trigger}</button></HoverHint>{open&&createPortal(<div ref={panel} className="composer-popover composer-model-popover library-qa-control-popover" role="dialog" aria-label={label} style={position} onClick={e=>{if(dismissOnSelect && (e.target as HTMLElement).closest("button:not(:disabled)"))setOpen(false);}}>{children}</div>,document.body)}</div>;
}
export function QaModelControl({models,selected,reasoning,disabled,onModel,onReasoning,onRefresh}: {models: AiAvailableModel[]; selected?: AiAvailableModel; reasoning: ModelReasoningLevel|""; disabled:boolean; onModel:(key:string)=>void; onReasoning:(value:ModelReasoningLevel|"")=>void; onRefresh:()=>void}) {
  const groups=[...new Set(models.map(m=>m.providerId))];
  return <Popup label="选择图书模型与思考深度" trigger={<><span className="composer-model-name">{selected?.name??"选择模型"}</span>{!!selected?.reasoningLevels.length&&<span className="composer-thinking-label">{reasoning?labels[reasoning]:"默认"}</span>}<ChevronDown size={12}/></>}>
    <section className="composer-model-section"><header>模型</header><div className="composer-model-list">{groups.map(provider=><div className="composer-model-group" key={provider}><small>{provider}</small>{models.filter(m=>m.providerId===provider).map(m=><button type="button" key={modelKey(m)} disabled={disabled} className={selected&&modelKey(m)===modelKey(selected)?"active":""} aria-pressed={!!selected&&modelKey(m)===modelKey(selected)} onClick={()=>onModel(modelKey(m))}><span>{m.name}</span>{selected&&modelKey(m)===modelKey(selected)&&<Check size={14}/>}</button>)}</div>)}</div></section>
    {!!selected?.reasoningLevels.length&&<section className="composer-thinking-section"><header>思考深度</header><div>{(["",...selected.reasoningLevels] as const).map(level=><button type="button" key={level} disabled={disabled} className={reasoning===level?"active":""} aria-pressed={reasoning===level} onClick={()=>onReasoning(level)}>{level?labels[level]:"默认"}</button>)}</div></section>}
    <button className="library-qa-refresh-models" type="button" onClick={onRefresh}>刷新模型列表</button>
  </Popup>;
}
export function QaUsageControl({turn}: {turn?: LibraryQaTurn}) {
  const usage=turn?.usage;
  const actual=usage?.inputTokens===undefined?undefined:usage.inputTokens+(usage.cachedInputTokens??0)+(usage.cachedWriteTokens??0);
  const input=actual??turn?.context?.estimatedInputTokens,limit=turn?.context?.modelContextWindowTokens;
  const percent=input!==undefined&&limit?Math.min(100,input/limit*100):0;
  const rate=usage?.cachedInputTokens!==undefined&&actual!==undefined&&actual>0?Math.min(100,usage.cachedInputTokens/actual*100):undefined;
  const fmt=(v:number)=>v>=1000?`${parseFloat((v/1000).toFixed(1))}K`:String(v);
  return <Popup className="library-qa-context" label="图书上下文与缓存用量" trigger={<><svg className="context-ring" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle className="context-ring-track" cx="9" cy="9" r="7"/><circle className="context-ring-value" cx="9" cy="9" r="7" pathLength="100" strokeDasharray={`${percent} 100`}/></svg><span className="context-usage-label">{input===undefined?"—":`${actual===undefined?"≈":""}${fmt(input)}`} / {limit?fmt(limit):"—"}</span></>}>
    <div className="library-qa-usage-details"><strong>上下文与缓存</strong><p>输入：{input??"—"} tokens{actual===undefined&&input!==undefined?"（估算）":""}<br/>模型窗口：{limit??"—"} tokens<br/>输出：{usage?.outputTokens??"—"} tokens<br/>缓存读取：{usage?.cachedInputTokens??"未报告"} tokens<br/>缓存命中率：{rate===undefined?"—":`${rate.toFixed(1)}%`}</p><p>最近一次本会话的回答请求，范围以该轮记录为准；不含追问改写，也不是历史累计用量。命中率按缓存读取占总输入计算。无数据时显示 —。</p></div>
  </Popup>;
}

export function QaStrategyControl({ strategies, selectedId, disabled, onSelect }: {strategies: LibraryQaStrategyInfo[]; selectedId: string; disabled: boolean; onSelect: (id: string) => void}) {
  const selected = strategies.find(strategy => strategy.id === selectedId);
  return <Popup label="选择图书回答策略" disabled={disabled} dismissOnSelect trigger={<><span className="composer-model-name">{selected?.name ?? "策略不可用"}</span><ChevronDown size={12}/></>}>
    <section className="composer-model-section library-qa-strategies"><header>回答策略</header><div className="composer-model-list">{strategies.map(strategy => <button key={strategy.id} type="button" disabled={disabled} aria-pressed={strategy.id===selectedId} className={strategy.id===selectedId?"active":""} onClick={()=>onSelect(strategy.id)}><span><strong>{strategy.name}</strong><small>{strategy.description}</small></span>{strategy.id===selectedId&&<Check size={14}/>}</button>)}</div></section>
  </Popup>;
}
