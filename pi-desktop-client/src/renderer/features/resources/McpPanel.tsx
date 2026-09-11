import { AlertTriangle, Box, CheckCircle2, CircleOff, LoaderCircle, LockKeyhole, PlugZap, RefreshCw, ServerCog, Wrench } from "lucide-react";
import { motion } from "framer-motion";
import type { RuntimeToolPermission } from "../../../shared/contracts/runtime-resources";
import { useAgentStore } from "../../stores/agent-store";
import { useResourceStore } from "../../stores/resource-store";
import { useSettingsStore } from "../../stores/settings-store";

const permissionLabels: Record<RuntimeToolPermission, string> = {
  "workspace-read": "读取工作区",
  "workspace-write": "修改工作区",
  process: "执行进程",
  "external-service": "访问外部服务",
};

const scopeLabels = {
  builtin: "内置",
  user: "用户级",
  project: "项目级",
  temporary: "临时",
};

export function McpPanel() {
  const status = useAgentStore((state) => state.processStatus);
  const animationEnabled = useSettingsStore((state) => state.animationEnabled);
  const nativeMcp = useResourceStore((state) => state.nativeMcp);
  const tools = useResourceStore((state) => state.tools);
  const servers = useResourceStore((state) => state.mcpServers);
  const issues = useResourceStore((state) => state.issues);
  const loading = useResourceStore((state) => state.loading);
  const error = useResourceStore((state) => state.error);
  const initialize = useResourceStore((state) => state.initialize);
  const mcpTools = tools.filter((tool) => tool.source.kind === "mcp");

  return (
    <div className="resource-page-scroll">
      <main className="resource-page">
        <header className="resource-page-header">
          <div className="resource-page-mark mcp"><PlugZap size={21} /></div>
          <div><span className="eyebrow">EXTENSION RUNTIME</span><h1>MCP 与 Tool Registry</h1><p>检查 Pi 当前真正加载的扩展、Tool 来源和可见权限。</p></div>
          <button type="button" disabled={loading || status.state !== "running"} onClick={() => void initialize(status.cwd)}>
            {loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}刷新
          </button>
        </header>

        <section className="resource-capability-grid">
          <article className={nativeMcp ? "available" : "limited"}>
            {nativeMcp ? <CheckCircle2 size={17} /> : <CircleOff size={17} />}
            <div><small>Pi 原生 MCP</small><strong>{nativeMcp ? "可用" : "未内置"}</strong><p>{nativeMcp ? "当前运行时报告原生 MCP 支持。" : "Pi 0.85.1 通过 Extension Bridge 接入 MCP。"}</p></div>
          </article>
          <article>
            <ServerCog size={17} />
            <div><small>MCP 扩展</small><strong>{servers.length}</strong><p>{servers.filter((server) => server.status === "loaded").length} 个扩展已成功加载。</p></div>
          </article>
          <article>
            <Wrench size={17} />
            <div><small>MCP Tools</small><strong>{mcpTools.filter((tool) => tool.active).length}/{mcpTools.length}</strong><p>只统计当前 Pi Tool Registry 的真实状态。</p></div>
          </article>
        </section>

        <div className="resource-security-note"><LockKeyhole size={16} /><div><strong>权限与连接边界</strong><p>MCP 扩展在 Pi Agent 进程中运行，可能访问网络或本地资源。桌面端只展示 Pi 暴露的状态，不会将凭据或完整 Tool 参数写入设置。通用 Extension API 无法证明远端服务器在线，因此“已加载”不等于网络连通。权限标签根据 Tool 名称与来源生成，仅作风险提示，不代表操作系统沙箱授权。</p></div></div>

        {(error || issues.length > 0) && (
          <section className="resource-issues" role="alert">
            <header><AlertTriangle size={15} /><strong>资源加载问题</strong></header>
            {error && <p>{error}</p>}
            {issues.map((issue) => <p key={`${issue.source}:${issue.message}`}><span>{issue.source}</span>{issue.message}</p>)}
          </section>
        )}

        <section className="resource-section">
          <header><div><span className="eyebrow">MCP BRIDGES</span><h2>扩展状态</h2></div><small>{servers.length} 项</small></header>
          {servers.length === 0 ? (
            <div className="resource-empty"><Box size={22} /><strong>没有检测到 MCP Extension</strong><p>当前 Pi 不自带 MCP。安装并加载名称或来源中带有 MCP 标识的 Pi Extension 后，会在这里显示；当前不会伪造 Server 或连接状态。</p></div>
          ) : (
            <div className="mcp-server-grid">
              {servers.map((server) => (
                <motion.article key={server.id} initial={animationEnabled ? { opacity: 0, y: 5 } : false} animate={{ opacity: 1, y: 0 }}>
                  <header><span className={`resource-status-dot ${server.status}`} /><strong>{server.name}</strong><small>{scopeLabels[server.scope]}</small></header>
                  <p>{server.statusDetail}</p><code>{server.source}</code>
                  <div>{server.toolNames.length > 0 ? server.toolNames.map((tool) => <span key={tool}>{tool}</span>) : <span>未注册 Tool</span>}</div>
                </motion.article>
              ))}
            </div>
          )}
        </section>

        <section className="resource-section">
          <header><div><span className="eyebrow">RUNTIME INVENTORY</span><h2>全部 Tool 与来源</h2></div><small>{tools.filter((tool) => tool.active).length}/{tools.length} 已启用</small></header>
          <div className="tool-registry-list">
            {tools.map((tool) => (
              <article key={tool.name}>
                <span className={`tool-registry-state ${tool.active ? "active" : "inactive"}`}>{tool.active ? <CheckCircle2 size={14} /> : <CircleOff size={14} />}</span>
                <div><strong>{tool.name}</strong><p>{tool.description || "该 Tool 没有提供描述。"}</p><code>{tool.source.path}</code></div>
                <aside><span className={`tool-source-badge ${tool.source.kind}`}>{tool.source.label}</span><small>{scopeLabels[tool.source.scope]}</small></aside>
                {tool.permissions.length > 0 && <footer>{tool.permissions.map((permission) => <span key={permission}>{permissionLabels[permission]}</span>)}</footer>}
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
