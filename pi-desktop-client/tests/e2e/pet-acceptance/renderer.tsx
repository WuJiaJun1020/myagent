import { createRoot } from "react-dom/client";
import { Sidebar } from "../../../src/renderer/components/layout/Sidebar";
import { AgentSidebar } from "../../../src/renderer/modules/agent/AgentSidebar";
import { TooltipProvider } from "../../../src/renderer/components/ui/tooltip";
import { useAgentStore } from "../../../src/renderer/stores/agent-store";
import { useUiStore } from "../../../src/renderer/stores/ui-store";
import { themeStyle } from "../../../src/renderer/lib/workspace-theme";
useAgentStore.setState({processStatus:{state:"running",cwd:"D:/Acceptance"}});
useUiStore.setState({activeModule:"agent",moduleViews:{agent:"activity",interview:"dashboard","knowledge-studio":"studio","smart-library":"library"}});
const errors:string[]=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
function theme(mode:"light"|"dark"){document.documentElement.dataset.theme=mode;document.documentElement.style.colorScheme=mode;for(const[key,value]of Object.entries(themeStyle('gray',mode)))document.documentElement.style.setProperty(key,value);}
theme('dark');(window as any).qa={theme,errors};
createRoot(document.getElementById('root')!).render(<TooltipProvider delayDuration={100}><div style={{display:'flex',height:'100vh',background:'var(--bg-app)'}}><Sidebar><AgentSidebar/></Sidebar><main style={{padding:24,color:'var(--text)',flex:1}}>Pi Desktop · 桌宠验收</main></div></TooltipProvider>);
