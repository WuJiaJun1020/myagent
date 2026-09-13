import { AlertTriangle, Blocks, BrainCircuit, LoaderCircle, RefreshCw } from "lucide-react";
import { TooltipIconButton } from "../../components/ui/tooltip-icon-button";
import { useAgentStore } from "../../stores/agent-store";
import { useResourceStore } from "../../stores/resource-store";
import type { SidebarView } from "../../stores/ui-store";

export function ResourceSidebarSummary({ view }: { view: Extract<SidebarView, "mcp" | "memory"> }) {
  const status = useAgentStore((state) => state.processStatus);
  const tools = useResourceStore((state) => state.tools);
  const packages = useResourceStore((state) => state.packages);
  const managedResources = useResourceStore((state) => state.managedResources);
  const memories = useResourceStore((state) => state.memories);
  const issues = useResourceStore((state) => state.issues);
  const loading = useResourceStore((state) => state.loading);
  const error = useResourceStore((state) => state.error);
  const initialize = useResourceStore((state) => state.initialize);
  const isMcp = view === "mcp";

  return (
    <section className="resource-sidebar-summary">
      <header>
        <span className="section-label">{isMcp ? "Pi Resources" : "Memory Sources"}</span>
        <TooltipIconButton
          className="resource-refresh-button"
          label="刷新资源状态"
          disabled={loading || status.state !== "running"}
          onClick={() => void initialize(status.cwd)}
        >
          {loading ? <LoaderCircle className="spin" size={13} /> : <RefreshCw size={13} />}
        </TooltipIconButton>
      </header>
      <div className="resource-sidebar-icon">{isMcp ? <Blocks size={18} /> : <BrainCircuit size={18} />}</div>
      <strong>{isMcp ? `${packages.length} 个 Package` : `${memories.length} 个上下文来源`}</strong>
      <p>{isMcp ? `${managedResources.filter((resource) => resource.enabled).length}/${managedResources.length} 个资源已启用 · ${tools.length} 个 Tool` : "内容由 Pi 启动时加载，仅供只读检查。"}</p>
      {(error || issues.length > 0) && <span className="resource-sidebar-warning"><AlertTriangle size={12} />{error ? "资源读取失败" : `${issues.length} 个加载问题`}</span>}
    </section>
  );
}
