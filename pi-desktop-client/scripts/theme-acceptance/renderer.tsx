import { createRoot } from "react-dom/client";
import { WorkspaceApplication } from "../../src/renderer/app/WorkspaceApplication";
import { useSettingsStore as settings } from "../../src/renderer/stores/settings-store";
import { useUiStore as ui } from "../../src/renderer/stores/ui-store";
import { useAgentStore as agent } from "../../src/renderer/stores/agent-store";
import { useSessionStore as session } from "../../src/renderer/stores/session-store";
import { useWorkspaceStore as workspace } from "../../src/renderer/stores/workspace-store";
import "../../src/renderer/lib/theme-bootstrap";

const host = (window as any).qaHost;
const file = {name:"acceptance.txt", path:"acceptance.txt", content:"Original acceptance file", size:24, modifiedAt:1, truncated:false};
const bridge = {
  getWindowMaximized: async () => false, onWindowMaximized: () => () => {},
  getTerminalProfiles: async () => [{id:"qa",name:"Acceptance PTY"}],
  createTerminal: host.create, killTerminal: host.kill, resizeTerminal: host.resize,
  writeTerminal: host.write, clearTerminal: () => {}, onTerminalData: host.onData, onTerminalExit: host.onExit,
  listWorkspaceDirectory: async () => ({path:"", entries:[{name:file.name,path:file.path,kind:"file"}],truncated:false}),
  getWorkspaceGitStatus: async () => ({ available:true,branch:"acceptance",additions:1,deletions:1,files:[{path:file.path,indexStatus:" ",workTreeStatus:"M",additions:1,deletions:1,binary:false}]}),
  getWorkspaceGitDiff: async () => ({path:file.path,staged:false,scope:"unstaged",diff:"@@ -1 +1 @@\n-Original acceptance file\n+Edited acceptance file",truncated:false}),
};
window.piDesktop = new Proxy(bridge, {get(target,key) { if(key in target) return target[key as keyof typeof bridge]; throw new Error(`Unexpected backend access: ${String(key)}`); }}) as any;
if (!localStorage.getItem("qa-seeded")) { settings.setState({theme:"light",palette:"gray",accent:"theme",animationEnabled:false}); localStorage.setItem("qa-seeded","true"); }
const messages = Array.from({length:30}, (_, i) => ({id:`qa-message-${i}`,role:i%2 ? "assistant" as const : "user" as const,timestamp:i+1,streaming:false,content:[{type:"text" as const,contentIndex:0,text:`验收对话 ${i+1}：这一段用于检查滚动位置与正文排版。保留当前上下文，不发送请求。`}]}));
agent.setState({processStatus:{state:"running",cwd:host.cwd}, messagesById:Object.fromEntries(messages.map(message=>[message.id,message])),timelineOrder:messages.map(message=>({type:"message",id:message.id}))});
session.setState({session:{id:"qa-session",mode:"work",approvalPolicy:"ask",thinkingLevel:"medium",isStreaming:false,isCompacting:false,isRetrying:false,steeringMode:"all",followUpMode:"all",autoCompactionEnabled:true,autoRetryEnabled:true,messageCount:1,pendingMessageCount:0,model:{provider:"qa",id:"qa",name:"验收模型名称（不发送请求）",api:"qa",reasoning:true,supportsImages:false,contextWindow:272000,maxTokens:1000}}});
workspace.setState({cwd:host.cwd,filesByPath:{[file.path]:file},activeFilePath:file.path});
ui.setState({agentDetailPanelOpen:false,terminalPanelOpen:true});
(window as any).qa = { settings, ui, workspace, session, file, errors:[] };
window.addEventListener("error", event => (window as any).qa.errors.push(event.message));
window.addEventListener("unhandledrejection", event => (window as any).qa.errors.push(String(event.reason)));
createRoot(document.getElementById("root")!).render(<WorkspaceApplication />);
