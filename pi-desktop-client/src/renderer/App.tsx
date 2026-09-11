import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, FolderOpen, LoaderCircle, RotateCw, Send, Square, Terminal, Wrench } from "lucide-react";
import type { ProcessStatus, RpcMessage } from "../shared/rpc";

type TimelineItem =
  | { id: string; type: "user"; text: string }
  | { id: string; type: "assistant"; text: string; streaming: boolean }
  | { id: string; type: "tool"; name: string; args: unknown; output: string; status: "running" | "done" | "error" };

type ExtensionRequest = RpcMessage & {
  id: string;
  method: "select" | "confirm" | "input" | "editor";
  title?: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  prefill?: string;
};

const initialStatus: ProcessStatus = { state: "starting", cwd: "" };

export function App() {
  const [status, setStatus] = useState(initialStatus);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extensionRequest, setExtensionRequest] = useState<ExtensionRequest | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const activeMessageId = useRef<string | null>(null);

  useEffect(() => {
    void window.piDesktop.getStatus().then(setStatus);
    const offStatus = window.piDesktop.onStatus(setStatus);
    const offEvent = window.piDesktop.onEvent(handleEvent);
    return () => {
      offStatus();
      offEvent();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items]);

  const statusLabel = useMemo(() => ({
    starting: "正在启动",
    running: "已连接",
    stopped: "已停止",
    error: "连接失败",
  })[status.state], [status.state]);

  function handleEvent(event: RpcMessage) {
    if (event.type === "agent_start") setBusy(true);
    if (event.type === "agent_settled") {
      setBusy(false);
      activeMessageId.current = null;
    }

    if (event.type === "message_start") {
      const message = event.message as { role?: string } | undefined;
      if (message?.role === "assistant") {
        const id = crypto.randomUUID();
        activeMessageId.current = id;
        setItems((current) => [...current, { id, type: "assistant", text: "", streaming: true }]);
      }
    }

    if (event.type === "message_update") {
      const update = event.assistantMessageEvent as { type?: string; delta?: string } | undefined;
      if (update?.type === "text_delta" && update.delta) {
        let id = activeMessageId.current;
        if (!id) {
          id = crypto.randomUUID();
          activeMessageId.current = id;
          setItems((current) => [...current, { id: id!, type: "assistant", text: update.delta!, streaming: true }]);
        } else {
          setItems((current) => current.map((item) =>
            item.id === id && item.type === "assistant" ? { ...item, text: item.text + update.delta } : item,
          ));
        }
      }
    }

    if (event.type === "message_end" && activeMessageId.current) {
      const id = activeMessageId.current;
      setItems((current) => current.map((item) =>
        item.id === id && item.type === "assistant" ? { ...item, streaming: false } : item,
      ));
    }

    if (event.type === "tool_execution_start") {
      const id = String(event.toolCallId);
      setItems((current) => [...current, {
        id,
        type: "tool",
        name: String(event.toolName ?? "tool"),
        args: event.args,
        output: "",
        status: "running",
      }]);
    }

    if (event.type === "tool_execution_update") {
      const id = String(event.toolCallId);
      const partial = event.partialResult as { content?: Array<{ type: string; text?: string }> } | undefined;
      const output = partial?.content?.map((part) => part.text ?? "").join("") ?? "";
      setItems((current) => current.map((item) => item.id === id && item.type === "tool" ? { ...item, output } : item));
    }

    if (event.type === "tool_execution_end") {
      const id = String(event.toolCallId);
      const result = event.result as { content?: Array<{ type: string; text?: string }> } | undefined;
      const output = result?.content?.map((part) => part.text ?? "").join("") ?? "";
      setItems((current) => current.map((item) => item.id === id && item.type === "tool" ? {
        ...item,
        output: output || item.output,
        status: event.isError ? "error" : "done",
      } : item));
    }

    if (event.type === "extension_ui_request") {
      const method = String(event.method);
      if (["select", "confirm", "input", "editor"].includes(method)) {
        setExtensionRequest(event as ExtensionRequest);
        setDialogValue(String(event.prefill ?? ""));
      }
    }
  }

  async function sendPrompt() {
    const message = input.trim();
    if (!message || status.state !== "running") return;
    setInput("");
    setError(null);
    setItems((current) => [...current, { id: crypto.randomUUID(), type: "user", text: message }]);
    try {
      await window.piDesktop.send({ type: busy ? "follow_up" : "prompt", message });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function abort() {
    try {
      await window.piDesktop.send({ type: "abort" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function answerExtension(value: { value?: string; confirmed?: boolean; cancelled?: boolean }) {
    if (!extensionRequest) return;
    await window.piDesktop.respondToExtension({
      type: "extension_ui_response",
      id: extensionRequest.id,
      ...value,
    });
    setExtensionRequest(null);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><Bot size={21} /><span>Pi Desktop</span></div>
        <button className="workspace-button" onClick={() => void window.piDesktop.selectWorkspace().then(setStatus)}>
          <FolderOpen size={16} />
          <span><small>当前工作区</small>{status.cwd || "未选择"}</span>
        </button>
        <div className="sidebar-section">
          <span className="section-label">会话</span>
          <button className="session active"><span className="session-dot" />当前会话</button>
        </div>
        <div className="sidebar-footer">
          <div className={`connection ${status.state}`}><span />{statusLabel}</div>
          <button className="icon-button" title="重启 Pi" onClick={() => void window.piDesktop.restart().then(setStatus)}><RotateCw size={16} /></button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div><strong>当前会话</strong><span>{busy ? "Pi 正在工作" : "等待任务"}</span></div>
          {busy && <LoaderCircle className="spin" size={18} />}
        </header>

        <section className="timeline">
          {items.length === 0 && (
            <div className="empty-state">
              <Bot size={30} />
              <h1>向 Pi 交代一个任务</h1>
              <p>Pi 可以读取当前工作区、执行工具并持续返回结果。</p>
            </div>
          )}
          {items.map((item) => item.type === "user" ? (
            <div className="message user-message" key={item.id}>{item.text}</div>
          ) : item.type === "assistant" ? (
            <article className="message assistant-message" key={item.id}>
              <div className="message-icon"><Bot size={16} /></div>
              <div className="message-body"><pre>{item.text || " "}</pre>{item.streaming && <span className="cursor" />}</div>
            </article>
          ) : (
            <details className={`tool-card ${item.status}`} key={item.id} open={item.status === "running"}>
              <summary><span><Wrench size={15} />{item.name}</span><span className="tool-status">{item.status === "running" ? "运行中" : item.status === "error" ? "失败" : "完成"}</span></summary>
              <div className="tool-content">
                <code>{JSON.stringify(item.args, null, 2)}</code>
                {item.output && <pre>{item.output}</pre>}
              </div>
            </details>
          ))}
          <div ref={endRef} />
        </section>

        <footer className="composer-wrap">
          {error && <div className="error-banner">{error}</div>}
          {status.detail && status.state === "error" && <div className="error-banner">{status.detail}</div>}
          <div className="composer">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendPrompt();
                }
              }}
              placeholder={busy ? "追加一个后续任务..." : "描述你希望 Pi 完成的任务..."}
              rows={3}
            />
            <div className="composer-actions">
              <span><Terminal size={14} />{status.cwd ? "本地工作区" : "未连接"}</span>
              {busy ? (
                <button className="stop-button" title="停止" onClick={() => void abort()}><Square size={15} /></button>
              ) : (
                <button className="send-button" title="发送" disabled={!input.trim() || status.state !== "running"} onClick={() => void sendPrompt()}><Send size={16} /></button>
              )}
            </div>
          </div>
        </footer>
      </main>

      {extensionRequest && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>{extensionRequest.title ?? "Pi 请求确认"}</h2>
            {extensionRequest.message && <p>{extensionRequest.message}</p>}
            {extensionRequest.method === "select" && (
              <div className="option-list">{extensionRequest.options?.map((option) => <button key={option} onClick={() => void answerExtension({ value: option })}>{option}</button>)}</div>
            )}
            {(extensionRequest.method === "input" || extensionRequest.method === "editor") && (
              <textarea value={dialogValue} placeholder={extensionRequest.placeholder} rows={extensionRequest.method === "editor" ? 8 : 3} onChange={(event) => setDialogValue(event.target.value)} />
            )}
            <div className="modal-actions">
              <button onClick={() => void answerExtension({ cancelled: true })}>取消</button>
              {extensionRequest.method === "confirm" && <button className="primary" onClick={() => void answerExtension({ confirmed: true })}>允许</button>}
              {(extensionRequest.method === "input" || extensionRequest.method === "editor") && <button className="primary" onClick={() => void answerExtension({ value: dialogValue })}>提交</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
