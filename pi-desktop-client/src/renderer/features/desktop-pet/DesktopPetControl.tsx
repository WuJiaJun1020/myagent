import { PawPrint, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HintButton } from "../../components/ui/tooltip";
import type { PetSettingsPatch, PetSnapshot } from "../../../shared/contracts/desktop-pet";
import "./desktop-pet.css";

function PetScaleSlider({ title, scale, disabled, onCommit }: { title: string; scale: number; disabled: boolean; onCommit: (scale: number) => Promise<void> }) {
  const savedPercent = Math.round(scale * 100);
  const [percent, setPercent] = useState(savedPercent);
  const submitting = useRef(false);
  const commit = (value: number) => {
    if (disabled || submitting.current || value === savedPercent) return;
    submitting.current = true;
    void onCommit(value / 100).finally(() => { submitting.current = false; });
  };
  return <label className="desktop-pet-scale">{title}
    <input type="range" min="1" max="100" step="1" aria-label="桌宠大小" value={percent} disabled={disabled}
      onChange={event => setPercent(Number(event.currentTarget.value))}
      onPointerUp={event => commit(Number(event.currentTarget.value))}
      onBlur={event => commit(Number(event.currentTarget.value))}
      onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) commit(Number(event.currentTarget.value)); }} />
    <output>{percent}%</output>
  </label>;
}

export function DesktopPetControl() {
  const [open,setOpen]=useState(false),[state,setState]=useState<PetSnapshot|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const root=useRef<HTMLDivElement>(null),toggle=useRef<HTMLButtonElement>(null);
  const [placement,setPlacement]=useState({left:12,bottom:60,maxHeight:400});
  useLayoutEffect(()=>{if(!open)return;const place=()=>{const r=toggle.current?.getBoundingClientRect();if(r)setPlacement({left:Math.max(12,Math.min(r.right-270,innerWidth-282)),bottom:innerHeight-r.top+10,maxHeight:Math.max(120,r.top-24)});};place();window.addEventListener('resize',place);return()=>window.removeEventListener('resize',place);},[open]);
  useEffect(()=>{if(!('getDesktopPet' in window.piDesktop))return;let mounted=true;void window.piDesktop.getDesktopPet().then(s=>{if(mounted)setState(s);}).catch(e=>{if(mounted)setError(String(e.message||e));});const off=window.piDesktop.onDesktopPetState(s=>{if(mounted)setState(s);});return()=>{mounted=false;off();};},[]);
  useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);toggle.current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key,true);};},[open]);
  const configure=async(patch:PetSettingsPatch)=>{setBusy(true);setError("");try{setState(await window.piDesktop.configureDesktopPet(patch));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const action=state?.actions.find(item=>item.id===state.settings.action),scale=state?state.settings.scales[state.settings.action]:.2;
  return <div className="desktop-pet-control" ref={root}>
    <HintButton ref={toggle} className={`icon-button ${state?.settings.enabled?'active':''}`} type="button" aria-label="桌宠" hint="桌宠" aria-expanded={open} aria-controls="desktop-pet-panel" onClick={()=>setOpen(v=>!v)}><PawPrint size={16}/></HintButton>
    {open&&<section id="desktop-pet-panel" className="desktop-pet-panel" style={placement} role="dialog" aria-labelledby="desktop-pet-heading">
      <header><strong id="desktop-pet-heading">韩立 · 桌宠</strong><button className="icon-button" type="button" aria-label="关闭桌宠面板" onClick={()=>setOpen(false)}><X size={14}/></button></header>
      <p className="desktop-pet-hint">选择动画放到桌面，拖动桌宠可移动。</p>
      <div className="desktop-pet-actions" role="group" aria-label="桌宠动画">
        {state?.actions.map(action=><button type="button" className={state.settings.enabled&&state.settings.action===action.id?'selected':''} disabled={busy} aria-pressed={state.settings.enabled&&state.settings.action===action.id} onClick={()=>void configure({enabled:true,action:action.id})} key={action.id}><img src={action.posterUrl} alt=""/><span><strong>{action.title}</strong><small>{action.frameCount} 帧 · {Math.round(state.settings.scales[action.id]*100)}%</small></span></button>)}
      </div>
      {state&&<><PetScaleSlider key={`${state.settings.action}-${scale}`} title={action?.title ?? "大小"} scale={scale} disabled={busy} onCommit={value=>configure({scale:value})}/>
      <p className="desktop-pet-hint">大小独立保存 · 100% = 原图 {action?.width} × {action?.height}</p>
      <div className="desktop-pet-buttons"><button type="button" disabled={busy||!state.settings.enabled} onClick={()=>void configure({enabled:false})}>隐藏桌宠</button></div></>}
      {!state&&!error&&<p className="desktop-pet-hint">正在读取桌宠…</p>}{error&&<p className="desktop-pet-error" role="alert">{error}</p>}
    </section>}
  </div>;
}
