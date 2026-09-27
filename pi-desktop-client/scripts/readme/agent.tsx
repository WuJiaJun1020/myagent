// Public documentation fixture: no real conversations, files, credentials or model calls.
import { createRoot } from "react-dom/client";
import { WorkspaceApplication } from "../../src/renderer/app/WorkspaceApplication";
import { useSettingsStore as settings } from "../../src/renderer/stores/settings-store";
import { useUiStore as ui } from "../../src/renderer/stores/ui-store";
import { useAgentStore as agent } from "../../src/renderer/stores/agent-store";
import { useSessionStore as sessions } from "../../src/renderer/stores/session-store";
import { useProjectStore as projects } from "../../src/renderer/stores/project-store";
import "../../src/renderer/lib/theme-bootstrap";

const cwd = "D:/Projects/workspace-demo";
const text = (id: string, role: "user" | "assistant", value: string, timestamp: number) => ({
  id, role, timestamp, streaming: false, content: [{type: "text", contentIndex: 0, text: value}],
});
const messages = [
  text("request", "user", "帮我梳理这个项目的发布流程，并整理一份可执行的检查清单。", 1000),
  text("reply", "assistant", "项目可以按三个步骤准备发布：\n\n### 1. 检查代码\n\n确认类型检查、测试与生产构建通过，检查本次变更涉及的会话、浏览器和界面交互。\n\n### 2. 验证安装包\n\n在打包环境中检查 Pi 运行时、内置 Python、资料解析和向量检索，再验证安装后的主要操作。\n\n### 3. 整理版本说明\n\n记录新增功能与已知限制，附上安装包、便携版和 SHA-256 校验值。\n\n```powershell\nnpm run typecheck\nnpm test\nnpm run build\n```\n\n可以从右上角打开项目文件、代码审查或终端，继续完成检查。", 2000),
];
const bridge = {getWindowMaximized: async()=>false, onWindowMaximized: ()=>()=>{}};
window.piDesktop = new Proxy(bridge, {get(t,k){if(k in t)return t[k as keyof typeof t];throw Error(`Unexpected demo backend call: ${String(k)}`);}}) as any;
settings.setState({theme:"dark",palette:"gray",accent:"theme",animationEnabled:false});
ui.setState({activeModule:"agent",moduleViews:{agent:"activity",interview:"dashboard","knowledge-studio":"studio"},agentDetailPanelOpen:false,terminalPanelOpen:false});
projects.setState({directories:[cwd,"D:/Projects/learning-notes"]});
agent.setState({activeSessionId:"demo",processStatus:{state:"running",cwd},messagesById:Object.fromEntries(messages.map(m=>[m.id,m])) as any,timelineOrder:messages.map(m=>({type:"message",id:m.id})),busy:false});
sessions.setState({session:{id:"demo",mode:"work",approvalPolicy:"ask",thinkingLevel:"medium",isStreaming:false,isCompacting:false,isRetrying:false,steeringMode:"all",followUpMode:"all",autoCompactionEnabled:true,autoRetryEnabled:true,messageCount:2,pendingMessageCount:0,model:{id:"demo",provider:"demo",name:"演示模型",api:"demo",reasoning:true,supportsImages:false,contextWindow:128000,maxTokens:4096}} as any,
 sessions:[{id:"demo",name:"准备项目发布",mode:"work",scope:"workspace",firstMessage:"",createdAt:1,modifiedAt:2,messageCount:2,current:true,workspace:{cwd,name:"workspace-demo",current:true,available:true}},{id:"notes",name:"整理学习计划",mode:"work",scope:"workspace",firstMessage:"",createdAt:1,modifiedAt:1,messageCount:2,current:false,workspace:{cwd:"D:/Projects/learning-notes",name:"learning-notes",current:false,available:true}}]});
(window as any).qa={settings,ui,errors:[]};
window.addEventListener("error",e=>(window as any).qa.errors.push(e.message));
createRoot(document.getElementById("root")!).render(<WorkspaceApplication/>);
