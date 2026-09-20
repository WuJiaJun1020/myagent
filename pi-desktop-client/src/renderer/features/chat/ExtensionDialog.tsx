import { motion } from "framer-motion";
import { Bot, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { agentGateway } from "../../services/agent-gateway";
import { useAgentStore } from "../../stores/agent-store";
import { useSettingsStore } from "../../stores/settings-store";

export function ExtensionDialog() {
  const request = useAgentStore((state) => state.interactionRequests[0]);
  const dismissInteraction = useAgentStore((state) => state.dismissInteraction);
  const setError = useAgentStore((state) => state.setError);
  const animationEnabled = useSettingsStore((state) => state.animationEnabled);
  const [value, setValue] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    setValue(request?.method === "editor" ? request.prefill ?? "" : "");
  }, [request]);

  useEffect(() => {
    const timeout = request && "timeout" in request ? request.timeout : undefined;
    if (!request || !timeout || timeout <= 0) {
      setRemainingSeconds(null);
      return undefined;
    }
    const requestId = request.id;
    const deadline = Date.now() + timeout;
    let expired = false;
    const update = () => {
      const remaining = deadline - Date.now();
      if (remaining > 0) {
        setRemainingSeconds(Math.max(1, Math.ceil(remaining / 1000)));
        return;
      }
      if (expired) return;
      expired = true;
      setRemainingSeconds(0);
      dismissInteraction(requestId);
      void agentGateway.respondToInteraction(request, { cancelled: true }).catch(() => undefined);
    };
    update();
    const interval = window.setInterval(update, Math.min(1000, Math.max(100, timeout)));
    return () => window.clearInterval(interval);
  }, [dismissInteraction, request]);

  if (!request) return null;
  const isToolApproval = request.method === "confirm" && request.title === "批准工具调用";

  async function answer(response: { value?: string; confirmed?: boolean; cancelled?: boolean }): Promise<void> {
    try {
      await agentGateway.respondToInteraction(request, response);
      dismissInteraction(request.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return (
    <motion.div
      className="modal-backdrop"
      role="presentation"
      initial={animationEnabled ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: animationEnabled ? 0.16 : 0 }}
    >
      <motion.section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="extension-dialog-title"
        initial={animationEnabled ? { opacity: 0, scale: 0.98, y: 8 } : false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: animationEnabled ? 0.18 : 0 }}
      >
        <header className="modal-header">
          <span className="modal-icon">{isToolApproval ? <ShieldCheck size={16} /> : <Bot size={16} />}</span>
          <div><small>{isToolApproval ? "TOOL APPROVAL" : "PI EXTENSION"}</small><h2 id="extension-dialog-title">{request.title}</h2></div>
          <button type="button" title="取消" onClick={() => void answer({ cancelled: true })}><X size={16} /></button>
        </header>
        {request.method === "confirm" && <p className="modal-message">{request.message}</p>}
        {remainingSeconds !== null && (
          <p className="extension-dialog-timeout" aria-live="polite">请在 {remainingSeconds} 秒内完成操作</p>
        )}
        {request.method === "select" && (
          <div className="option-list">
            {request.options.map((option) => (
              <button type="button" key={option} onClick={() => void answer({ value: option })}>{option}</button>
            ))}
          </div>
        )}
        {(request.method === "input" || request.method === "editor") && (
          <textarea
            autoFocus
            value={value}
            placeholder={request.method === "input" ? request.placeholder : undefined}
            rows={request.method === "editor" ? 9 : 3}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        <footer className="modal-actions">
          <button type="button" onClick={() => void answer({ cancelled: true })}>{isToolApproval ? "拒绝" : "取消"}</button>
          {request.method === "confirm" && (
            <button className="primary" type="button" onClick={() => void answer({ confirmed: true })}>允许</button>
          )}
          {(request.method === "input" || request.method === "editor") && (
            <button className="primary" type="button" onClick={() => void answer({ value })}>提交</button>
          )}
        </footer>
      </motion.section>
    </motion.div>
  );
}
