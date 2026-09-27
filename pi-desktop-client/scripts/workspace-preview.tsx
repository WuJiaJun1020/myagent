import { TooltipProvider } from "../src/renderer/components/ui/tooltip";
import { paletteOptions } from "../src/renderer/lib/workspace-theme";
export { workspaceThemeCss } from "../src/renderer/lib/workspace-theme";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageItem } from "../src/renderer/features/chat/MessageItem";
import { ToolCallCard } from "../src/renderer/features/tools/ToolCallCard";
import { AppearanceSettings } from "../src/renderer/features/settings/AppearanceSettings";
import { DiffViewer } from "../src/renderer/features/files/DiffViewer";
import { CodeEditor } from "../src/renderer/features/files/CodeEditor";
import { TerminalOutput } from "../src/renderer/features/terminal/TerminalOutput";
import type { AgentMessage } from "../src/shared/contracts/agent-events";

const messages: AgentMessage[] = [
  { id: "sample-user", role: "user", timestamp: 1, streaming: false, content: [{ type: "text", contentIndex: 0, text: "帮我检查订单服务的重试逻辑，先说明问题，再给出建议。" }] },
  { id: "sample-answer", role: "assistant", timestamp: 2, streaming: false, model: "演示模型", content: [{ type: "text", contentIndex: 0, text: "已经检查了请求入口和订单写入逻辑。建议将**重试条件**和**幂等校验**分别处理。\n\n1. 为每次业务操作分配稳定的请求标识。\n2. 临时故障允许有限重试，参数错误直接返回。\n3. 在写入端校验 `requestId`，避免重复创建订单。\n\n```ts\nconst result = await createOrder({ requestId, items });\n```\n\n这里是一段用于检查换行的长路径：`src/features/orders/services/idempotency/validate-request-before-writing.ts`。" }] },
];

export function renderPreview() {
  return renderToStaticMarkup(<TooltipProvider>
    <nav className="preview-controls" aria-label="样板状态">
      <strong>工作区样板</strong>
      {paletteOptions.map(option => <button key={option.value} data-palette-choice={option.value}>{option.label}</button>)}
      <button data-mode="light">浅色会话</button><button data-mode="dark">深色会话</button>
      <button data-mode="review">审查展开</button><button data-mode="settings">外观设置</button>
      <button data-mode="narrow">窄窗口</button>
      <button data-mode="surfaces">文件与终端</button><button data-mode="surface-dark">深色工具页</button><button data-mode="settings-narrow">窄设置页</button>
      <span>虚构内容 · 不连接模型或本地文件</span>
    </nav>
    <div className="preview-app">
      <aside className="sidebar">
        <div className="brand"><span className="brand-copy"><strong>Pi Desktop</strong></span></div>
        <nav className="sidebar-module-switcher"><button className="active"><span>◇</span><span><strong>Agent 工作区</strong></span></button><button><span>◉</span><span><strong>智能面试</strong></span></button><button><span>▤</span><span><strong>知识工坊</strong></span></button></nav>
        <nav className="sidebar-nav"><button className="nav-item active"><span>↗</span><span>会话</span></button><button className="nav-item"><span>▤</span><span>项目文件</span></button><button className="nav-item"><span>±</span><span>代码审查</span></button></nav>
        <section className="sidebar-projects"><span className="section-label">项目</span><button className="workspace-button">示例订单服务</button></section>
        <section className="sidebar-sessions"><span className="section-label">最近会话</span><div className="session-row active"><button className="session-item"><strong>检查重试与幂等</strong></button></div></section>
        <div className="sidebar-footer"><span className="connection"><i className="connection-dot" />设计预览</span></div>
      </aside>
      <main className="preview-main">
        <header className="topbar"><div className="workspace-heading"><strong>示例订单服务</strong><span>/</span><span>会话</span></div><span>文件　审查　终端</span></header>
        <div className="preview-columns">
          <section className="preview-conversation">
            <div className="activity-stream"><div className="timeline-content">
              <MessageItem message={messages[0]} />
              <ToolCallCard tool={{ id: "preview-read", name: "read", args: { path: "src/orders.ts" }, output: [], status: "done", startedAt: 1, completedAt: 200 }} />
              <MessageItem message={messages[1]} />
              <details className="thinking-block"><summary>展开完整工具记录（样板）</summary><pre>{'{"path":"src/orders.ts","status":"done"}'}</pre></details>
              <ToolCallCard tool={{ id: "preview-error", name: "bash", args: { command: "npm test" }, output: [{ type: "text", text: "演示错误：测试超时。完整内容应保持可查看。" }], status: "error", startedAt: 1, completedAt: 500 }} />
            </div></div>
            <footer className="composer-wrap"><div className="composer"><textarea aria-label="演示输入框" placeholder="描述你想完成的任务…" /><div className="composer-toolbar"><div className="composer-tools"><button className="composer-tool" aria-label="添加附件">＋</button><span className="approval-select">请求批准</span><span className="context-usage">12k / 128k</span></div><div className="composer-submit"><button className="composer-model-trigger"><span className="composer-model-name">用于测试长名称的演示模型</span><span className="composer-thinking-label">中</span></button><button className="send-button" disabled aria-label="预览不可发送">↑</button></div></div></div><p className="composer-caption">样板不发送请求，不修改实际设置。</p></footer>
          </section>
          <aside className="preview-review"><header>代码审查 <small>真实 Diff 组件 · 虚构内容</small></header><DiffViewer change={{path:"src/orders.ts",changeType:"modified",timestamp:1,unifiedDiff:"@@ -1,2 +1,2 @@\n-export const retries = 10;\n+export const retries = 3;\n export const timeout = 5000;"}} /></aside>
        </div>
        <section className="preview-settings settings-page-content"><div className="settings-page-inner"><header className="settings-page-heading"><h1>外观</h1></header><p>真实外观组件的静态样板，控件不修改客户端设置。</p><AppearanceSettings /></div></section>
        <section className="preview-surfaces"><CodeEditor file={{name:"orders.ts",path:"src/features/orders/idempotency/orders.ts",content:"export const retries = 3;\nexport async function createOrder(input: OrderInput) {\n  return repository.insert(input.requestId, input.items);\n}\n",size:180,modifiedAt:1,truncated:false}} /><TerminalOutput command="npm test" output={"演示测试输出\n✓ request id remains stable across retries\n✓ duplicate writes return the existing order"} status="done" /><TerminalOutput output="演示错误：连接超时，详细错误仍保持可读。" status="error" /></section>
      </main>
    </div>
  </TooltipProvider>);
}
