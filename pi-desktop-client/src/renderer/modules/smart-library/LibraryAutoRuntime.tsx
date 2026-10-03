import { useSyncExternalStore } from "react";
import { CheckCircle2, LoaderCircle, AlertCircle } from "lucide-react";
import { LibraryRuntimeMonitor, type RuntimeSnapshot } from "./runtime-monitor";

const monitors = new Map<string, LibraryRuntimeMonitor>();
function getMonitor(profileId = "standard-rag") { let monitor=monitors.get(profileId); if(!monitor){monitor=new LibraryRuntimeMonitor(()=>({modelRuntime:action=>window.piDesktop.library.modelRuntime(action,profileId)}));monitors.set(profileId,monitor);}return monitor; }
export function useLibraryAutoRuntime(profileId = "standard-rag") {
  const monitor = getMonitor(profileId);
  const snapshot = useSyncExternalStore(monitor.subscribe, monitor.getSnapshot);
  const available = !snapshot.checking && !snapshot.error && (snapshot.status?.managedRequired === false || snapshot.status?.state === "ready");
  return { snapshot: {...snapshot,profileId}, available };
}
export function LibraryAutoRuntimeNotice({ snapshot }: { snapshot: RuntimeSnapshot & { profileId?: string } }) {
  const { status, checking, error } = snapshot;
  const failure = error || (status?.state === "failed" ? status.error || "请检查模型环境和启动日志" : "");
  const loading = checking || status?.state === "starting" || status?.state === "stopping";
  const custom = status?.managedRequired === false;
  const message = checking ? "正在检查本地模型服务…" : failure ? "本地模型服务启动失败" : custom ? "使用自定义本地模型服务" : status?.state === "ready" ? "本地模型服务已就绪" : status?.state === "starting" ? `正在自动启动本地模型服务…${status.elapsedSeconds ? ` ${status.elapsedSeconds} 秒` : ""}` : status?.state === "stopping" ? "本地模型服务正在停止…" : "本地模型服务已停止";
  return <div className={`library-auto-runtime${failure ? " is-failed" : ""}`} role={failure ? "alert" : "status"} aria-live="polite">
    <div>{loading ? <LoaderCircle size={14} className="is-loading"/> : failure || status?.state === "stopped" ? <AlertCircle size={14}/> : <CheckCircle2 size={14}/>}<span>{message}</span>
      {!loading && !custom && (failure || status?.state === "stopped") && <button type="button" onClick={() => void getMonitor(snapshot.profileId).ensure()}>重试启动</button>}
    </div>
    {failure && <p>{failure}</p>}
    {!checking && status?.notice && <p>{status.notice}</p>}
    {!checking && status?.log && failure && <details><summary>启动日志</summary><pre>{status.log}</pre></details>}
  </div>;
}
