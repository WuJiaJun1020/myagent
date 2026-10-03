import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { BrowserPanel } from "../../../src/renderer/features/browser/BrowserPanel";
import { MarkdownContent } from "../../../src/renderer/features/chat/MarkdownContent";
import { useBrowserStore } from "../../../src/renderer/stores/browser-store";
import "../../../src/renderer/styles/browser.css";
import "../../../src/renderer/styles/conversation.css";

function Demo() {
  const open = useBrowserStore(state => state.open);
  return <TooltipProvider><main style={{ display: "grid", gridTemplateColumns: "240px minmax(0, 1fr)", height: "100vh" }}>
    <section style={{ padding: 20 }}><h3>会话</h3><MarkdownContent content="[打开小游戏](./game.html)" /><div id="chinese-link"><MarkdownContent content="[中文小游戏](<./网页小游戏/猜数字 v2.html>)" /></div><button id="reopen" onClick={() => useBrowserStore.getState().show()}>打开浏览器</button></section>
    {open && <BrowserPanel />}
  </main></TooltipProvider>;
}
createRoot(document.getElementById("root")!).render(<Demo />);
