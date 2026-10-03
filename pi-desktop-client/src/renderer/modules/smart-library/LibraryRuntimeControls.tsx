import { useEffect, useRef, useState } from "react";
import type { LibraryRuntimeStatus } from "../../../shared/contracts/smart-library";
const labels = { stopped: "未启动", starting: "正在加载模型", ready: "服务已就绪", stopping: "正在停止", failed: "启动失败" };
export function LibraryRuntimeControls({ disabled = false, runtimeStatus, active = true }: { disabled?: boolean; runtimeStatus?: LibraryRuntimeStatus; active?: boolean }) {
  const [localStatus, setStatus] = useState<LibraryRuntimeStatus>();
  const status = runtimeStatus ?? localStatus;
  const observing = runtimeStatus !== undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const alive = useRef(true);
  const locked = useRef(false);
  useEffect(() => {
    alive.current = true; let mounted = true; let timer: ReturnType<typeof setTimeout>;
    if (observing || !active) return () => { alive.current = false; };
    const poll = async () => {
      const current = generation.current;
      try { const value = await window.piDesktop.library.modelRuntime("status"); if (mounted && !locked.current && current === generation.current) setStatus(value); }
      catch (e) { if (mounted) setError(String(e)); }
      if (mounted) timer = setTimeout(poll, 2000);
    };
    void poll(); return () => { mounted = false; alive.current = false; clearTimeout(timer); };
  }, [observing, active]);
  async function act(action: "start" | "stop") {
    if (locked.current) return;
    locked.current = true; generation.current++; setBusy(true); setError("");
    try { const value = await window.piDesktop.library.modelRuntime(action); if (alive.current) setStatus(value); }
    catch (e) { if (alive.current) setError(String(e)); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="library-runtime-controls" aria-label="本地模型服务">
    <div className="library-model-test"><strong>本地模型服务</strong><span role="status">{status ? labels[status.state] : "正在检测…"}{status?.state === "starting" ? ` · ${status.elapsedSeconds ?? 0} 秒` : ""}</span>
      {status && !status.owned && status.state !== "ready" && <button disabled={busy || disabled} onClick={() => void act("start")}>{busy ? "正在启动…" : "启动服务"}</button>}
      {status?.owned && <button disabled={busy || disabled || status.busy || status.state === "stopping"} onClick={() => void act("stop")}>{status.state === "starting" ? "取消启动" : "停止服务"}</button>}
    </div>
    <p>{status?.state === "ready" && !status.owned ? "检测到外部启动的服务，可直接使用；请在原终端停止它。" : "后台启动，无需另开终端。关闭此弹窗继续运行，退出或重启客户端时停止。"}</p>
    {status?.gpu && <p>{status.gpu}</p>}
    <small>管理默认 127.0.0.1:18081 服务，不会修改下方自定义接口或自动下载模型。</small>
    {(error || status?.error) && <p className="library-model-error" role="alert">{error || status?.error}</p>}
    {status?.log && <details><summary>启动日志</summary><pre>{status.log}</pre></details>}
  </section>;
}
