import {
  AlertTriangle,
  Blocks,
  Box,
  FileText,
  ExternalLink,
  LoaderCircle,
  PackagePlus,
  Puzzle,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  RuntimeManagedResource,
  RuntimeManagedResourceType,
  RuntimePackageScope,
} from "../../../shared/contracts/runtime-resources";
import { useAgentStore } from "../../stores/agent-store";
import { useResourceStore } from "../../stores/resource-store";
import { useUiStore, type ResourceCenterTab } from "../../stores/ui-store";
import { SettingsSwitch } from "../settings/SettingsPrimitives";
import { agentGateway } from "../../services/agent-gateway";
import { OnlinePackageCatalog } from "./OnlinePackageCatalog";

const tabs: Array<{ id: ResourceCenterTab; label: string; icon: typeof Box }> = [
  { id: "online", label: "在线商店", icon: PackagePlus },
  { id: "packages", label: "已安装", icon: Box },
  { id: "skills", label: "Skills", icon: Sparkles },
  { id: "extensions", label: "Extensions", icon: Puzzle },
  { id: "prompts", label: "Prompts", icon: FileText },
  { id: "tools", label: "Tools", icon: Wrench },
];

const typeLabels: Record<RuntimeManagedResourceType, string> = {
  extensions: "Extension",
  skills: "Skill",
  prompts: "Prompt",
  themes: "Theme",
};

function resourceDescription(resource: RuntimeManagedResource, descriptions: Map<string, string>): string {
  return descriptions.get(`${resource.type}:${resource.name}`)
    ?? `${typeLabels[resource.type]} · ${resource.source.origin === "package" ? resource.source.label : "本地资源"}`;
}

export function ResourceCenterPanel() {
  const status = useAgentStore((state) => state.processStatus);
  const agentBusy = useAgentStore((state) => state.busy);
  const packages = useResourceStore((state) => state.packages);
  const resources = useResourceStore((state) => state.managedResources);
  const commandResources = useResourceStore((state) => state.commandResources);
  const extensions = useResourceStore((state) => state.extensions);
  const tools = useResourceStore((state) => state.tools);
  const issues = useResourceStore((state) => state.issues);
  const projectTrusted = useResourceStore((state) => state.projectTrusted);
  const loading = useResourceStore((state) => state.loading);
  const mutation = useResourceStore((state) => state.mutation);
  const error = useResourceStore((state) => state.error);
  const reload = useResourceStore((state) => state.reload);
  const mutate = useResourceStore((state) => state.mutate);
  const tab = useUiStore((state) => state.resourceCenterTab);
  const setTab = useUiStore((state) => state.setResourceCenterTab);
  const [source, setSource] = useState("");
  const [scope, setScope] = useState<RuntimePackageScope>("user");
  const disabled = status.state !== "running" || agentBusy || loading || Boolean(mutation);

  const descriptions = useMemo(() => new Map(commandResources.map((resource) => [
    `${resource.kind === "skill" ? "skills" : "prompts"}:${resource.name}`,
    resource.description ?? "没有提供说明。",
  ])), [commandResources]);

  const visibleResources = resources.filter((resource) => resource.type === tab);
  const counts: Record<ResourceCenterTab, number> = {
    online: 0,
    packages: packages.length,
    skills: resources.filter((resource) => resource.type === "skills").length,
    extensions: resources.filter((resource) => resource.type === "extensions").length,
    prompts: resources.filter((resource) => resource.type === "prompts").length,
    tools: tools.length,
  };

  async function installPackage(packageSource?: string): Promise<void> {
    const nextSource = packageSource?.trim() || source.trim();
    if (!nextSource) return;
    const target = scope === "project" ? "当前项目" : "当前用户";
    if (!window.confirm(`确认安装到${target}？\n\n${nextSource}\n\nPi Extension 可以执行本地代码，请只安装可信来源。`)) return;
    try {
      await mutate(status.cwd, { type: "install", source: nextSource, scope });
      if (!packageSource) setSource("");
    } catch {
      // The resource store exposes the actionable error in this panel.
    }
  }

  async function removePackage(packageSource: string, packageScope: RuntimePackageScope): Promise<void> {
    if (!window.confirm(`确认移除这个 Package？\n\n${packageSource}`)) return;
    try {
      await mutate(status.cwd, { type: "remove", source: packageSource, scope: packageScope });
    } catch {
      // The resource store exposes the actionable error in this panel.
    }
  }

  async function updatePackage(packageSource: string, packageScope: RuntimePackageScope): Promise<void> {
    try {
      await mutate(status.cwd, { type: "update", source: packageSource, scope: packageScope });
    } catch {
      // The resource store exposes the actionable error in this panel.
    }
  }

  async function setEnabled(resource: RuntimeManagedResource, enabled: boolean): Promise<void> {
    if (resource.source.scope !== "user" && resource.source.scope !== "project") return;
    try {
      await mutate(status.cwd, {
        type: "set-enabled",
        resourceType: resource.type,
        path: resource.path,
        source: resource.sourceId,
        scope: resource.source.scope,
        enabled,
      });
    } catch {
      // The resource store exposes the actionable error in this panel.
    }
  }

  return (
    <div className="resource-page-scroll">
      <main className="resource-page resource-center-page">
        <header className="resource-page-header">
          <div className="resource-page-mark"><Blocks size={21} /></div>
          <div>
            <span className="eyebrow">PI NATIVE RESOURCES</span>
            <h1>资源中心</h1>
            <p>管理 Pi Packages、Skills、Extensions、Prompt Templates 和 Tool Registry。</p>
          </div>
          <button type="button" disabled={tab !== "online" && disabled} onClick={() => tab === "online" ? void agentGateway.openExternal("https://pi.dev/packages") : void reload(status.cwd)}>
            {tab === "online" ? <ExternalLink size={14} /> : loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{tab === "online" ? "打开 pi.dev" : "重新加载"}
          </button>
        </header>

        <div className="resource-security-note">
          <ShieldAlert size={16} />
          <div>
            <strong>资源在 Pi Agent 进程中运行</strong>
            <p>Extension 可以访问本地文件、启动进程和访问网络。项目级资源只有在项目受信任后才能安装和加载。</p>
          </div>
          <span className={`resource-trust-badge ${projectTrusted ? "trusted" : "untrusted"}`}>
            {projectTrusted ? "项目已信任" : "项目未信任"}
          </span>
        </div>

        {(error || issues.length > 0) && (
          <section className="resource-issues" role="alert">
            <header><AlertTriangle size={15} /><strong>资源诊断</strong></header>
            {error && <p><span>操作失败</span>{error}</p>}
            {issues.map((issue) => <p key={`${issue.source}:${issue.message}`}><span>{issue.source}</span>{issue.message}</p>)}
          </section>
        )}

        <nav className="resource-tabs" aria-label="资源类型">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              <Icon size={15} /><span>{label}</span><small>{id === "online" ? "在线" : counts[id]}</small>
            </button>
          ))}
        </nav>

        {tab === "online" && (
          <OnlinePackageCatalog
            packages={packages}
            disabled={disabled}
            projectTrusted={projectTrusted}
            scope={scope}
            mutation={mutation}
            onScopeChange={setScope}
            onInstall={installPackage}
          />
        )}

        {tab === "packages" && (
          <section className="resource-section resource-package-section">
            <header><div><span className="eyebrow">INSTALL SOURCE</span><h2>安装与管理 Package</h2></div></header>
            <div className="package-install-row">
              <PackagePlus size={17} />
              <input
                value={source}
                disabled={disabled}
                placeholder="npm:@scope/package、Git URL 或本地路径"
                onChange={(event) => setSource(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void installPackage();
                }}
              />
              <select value={scope} disabled={disabled} onChange={(event) => setScope(event.target.value as RuntimePackageScope)}>
                <option value="user">当前用户</option>
                <option value="project" disabled={!projectTrusted}>当前项目</option>
              </select>
              <button type="button" disabled={disabled || !source.trim()} onClick={() => void installPackage()}>安装</button>
            </div>
            {mutation && <p className="resource-operation"><LoaderCircle className="spin" size={14} />正在处理：{mutation}</p>}
            {packages.length === 0 ? (
              <div className="resource-empty"><Box size={22} /><strong>尚未配置 Package</strong><p>可以从 npm、Git 或本地目录安装 Pi Package。</p></div>
            ) : (
              <div className="package-list">
                {packages.map((pkg) => (
                  <article key={pkg.id}>
                    <div className={`package-state ${pkg.installed ? "installed" : "missing"}`}><Box size={17} /></div>
                    <div>
                      <strong>{pkg.source}</strong>
                      <p>{pkg.installedPath ?? "尚未安装到本地"}</p>
                      <span>{pkg.scope === "project" ? "项目级" : "用户级"}{pkg.filtered ? " · 已配置资源过滤" : " · 加载全部资源"}</span>
                    </div>
                    <div className="package-actions">
                      <button type="button" title="更新" disabled={disabled || !pkg.installed} onClick={() => void updatePackage(pkg.source, pkg.scope)}><RotateCw size={14} />更新</button>
                      <button type="button" className="danger" title="移除" disabled={disabled} onClick={() => void removePackage(pkg.source, pkg.scope)}><Trash2 size={14} />移除</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {(tab === "skills" || tab === "extensions" || tab === "prompts") && (
          <section className="resource-section">
            <header>
              <div><span className="eyebrow">RESOURCE CONFIG</span><h2>{tabs.find((item) => item.id === tab)?.label}</h2></div>
              <small>{visibleResources.filter((resource) => resource.enabled).length}/{visibleResources.length} 已启用</small>
            </header>
            {visibleResources.length === 0 ? (
              <div className="resource-empty"><Puzzle size={22} /><strong>没有发现此类资源</strong><p>安装包含对应资源的 Package，或放入 Pi 的用户/项目资源目录。</p></div>
            ) : (
              <div className="managed-resource-list">
                {visibleResources.map((resource) => (
                  <article key={resource.id}>
                    <div>
                      <strong>{resource.name}</strong>
                      <p>{resourceDescription(resource, descriptions)}</p>
                      <code>{resource.displayPath}</code>
                      {resource.type === "extensions" && (() => {
                        const detail = extensions.find((extension) => extension.path === resource.displayPath);
                        if (!detail) return null;
                        return (
                          <div className="managed-resource-contributions">
                            {detail.toolNames.map((name) => <span key={`tool:${name}`}>Tool · {name}</span>)}
                            {detail.commandNames.map((name) => <span key={`command:${name}`}>/{name}</span>)}
                            {detail.shortcuts.map((shortcut) => (
                              <span key={`shortcut:${shortcut.shortcut}`} title={shortcut.description}>快捷键 · {shortcut.shortcut}</span>
                            ))}
                            {detail.toolNames.length === 0 && detail.commandNames.length === 0 && detail.shortcuts.length === 0 && <span>扩展已加载，未注册 Tool、命令或快捷键</span>}
                          </div>
                        );
                      })()}
                    </div>
                    <aside><span>{resource.source.scope === "project" ? "项目级" : "用户级"}</span><small>{resource.source.origin === "package" ? resource.source.label : "本地"}</small></aside>
                    <SettingsSwitch checked={resource.enabled} disabled={disabled} label={`${resource.enabled ? "停用" : "启用"} ${resource.name}`} onChange={(enabled) => void setEnabled(resource, enabled)} />
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "tools" && (
          <section className="resource-section">
            <header><div><span className="eyebrow">TOOL REGISTRY</span><h2>当前 Agent Tools</h2></div><small>{tools.filter((tool) => tool.active).length}/{tools.length} 已启用</small></header>
            <div className="tool-registry-list">
              {tools.map((tool) => (
                <article key={tool.name}>
                  <span className={`tool-registry-state ${tool.active ? "active" : "inactive"}`}><Wrench size={14} /></span>
                  <div><strong>{tool.name}</strong><p>{tool.description || "该 Tool 没有提供描述。"}</p><code>{tool.source.path}</code></div>
                  <aside><span className={`tool-source-badge ${tool.source.kind}`}>{tool.source.label}</span><small>{tool.active ? "当前会话已启用" : "当前会话未启用"}</small></aside>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
