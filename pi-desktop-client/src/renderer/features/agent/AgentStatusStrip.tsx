import { Clock3, Layers3, ListTodo, TriangleAlert } from "lucide-react";
import { useAgentStore } from "../../stores/agent-store";
import { agentGateway } from "../../services/agent-gateway";

export function AgentStatusStrip() {
  const queue = useAgentStore((state) => state.queue);
  const compaction = useAgentStore((state) => state.compaction);
  const retry = useAgentStore((state) => state.retry);
  const error = useAgentStore((state) => state.error);
  const extensionNotices = useAgentStore((state) => state.extensionNotices);
  const extensionStatusByKey = useAgentStore((state) => state.extensionStatuses);
  const extensionStatuses = Object.values(extensionStatusByKey);
  const clearError = useAgentStore((state) => state.setError);
  const queueSize = queue.steering.length + queue.followUp.length;

  if (queueSize === 0 && compaction.phase === "idle" && retry.phase === "idle" && !error && extensionNotices.length === 0 && extensionStatuses.length === 0) return null;

  return (
    <div className="agent-status-strip" role="status">
      {queueSize > 0 && <span><ListTodo size={14} />{queueSize} 个后续任务等待执行</span>}
      {compaction.phase === "running" && <span><Layers3 size={14} />正在压缩会话上下文</span>}
      {compaction.phase === "failed" && <span className="danger"><TriangleAlert size={14} />上下文压缩失败</span>}
      {retry.phase === "waiting" && (
        <span className="warning"><Clock3 size={14} />请求重试 {retry.attempt ?? ""}/{retry.maxAttempts ?? ""}<button type="button" onClick={() => void agentGateway.abortRetry()}>取消重试</button></span>
      )}
      {retry.phase === "failed" && <span className="danger"><TriangleAlert size={14} />自动重试失败</span>}
      {extensionStatuses.map((text, index) => <span className="extension-status" key={`${text}-${index}`}>{text}</span>)}
      {extensionNotices.map((notice) => <span className={`extension-notice ${notice.severity}`} key={notice.id}>{notice.message}</span>)}
      {error && (
        <span className="danger status-error">
          <TriangleAlert size={14} />{error}
          <button type="button" onClick={() => clearError(null)}>关闭</button>
        </span>
      )}
    </div>
  );
}
