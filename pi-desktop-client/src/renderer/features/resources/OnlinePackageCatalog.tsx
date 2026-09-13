import {
  AlertTriangle,
  Box,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  PackageCheck,
  Puzzle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PackageCatalogDetails,
  PackageCatalogEntry,
  PackageCatalogKind,
  PackageCatalogResult,
} from "../../../shared/contracts/package-catalog";
import type { RuntimePackageScope, RuntimePackageSummary } from "../../../shared/contracts/runtime-resources";
import { agentGateway } from "../../services/agent-gateway";

type CatalogFilter = "all" | PackageCatalogKind;
type CatalogSort = "relevance" | "downloads" | "recent";

const kindLabels: Record<PackageCatalogKind, string> = {
  extension: "Extension",
  skill: "Skill",
  prompt: "Prompt",
  theme: "Theme",
  package: "Package",
};

const compatibilityLabels = {
  full: "桌面兼容",
  partial: "部分兼容",
  unknown: "待验证",
} as const;

function packageNameFromSource(source: string): string | undefined {
  if (!source.startsWith("npm:")) return undefined;
  const spec = source.slice(4);
  if (spec.startsWith("@")) {
    const slash = spec.indexOf("/");
    const version = slash >= 0 ? spec.indexOf("@", slash) : -1;
    return version >= 0 ? spec.slice(0, version) : spec;
  }
  const version = spec.indexOf("@");
  return version >= 0 ? spec.slice(0, version) : spec;
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value?: string): string {
  if (!value) return "未知";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}

function formatBytes(value?: number): string {
  if (!value) return "未知";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function kindIcon(kind: PackageCatalogKind) {
  if (kind === "extension") return Puzzle;
  if (kind === "skill") return Sparkles;
  if (kind === "prompt") return FileText;
  return Box;
}

export function OnlinePackageCatalog({
  packages,
  disabled,
  projectTrusted,
  scope,
  mutation,
  onScopeChange,
  onInstall,
}: {
  packages: RuntimePackageSummary[];
  disabled: boolean;
  projectTrusted: boolean;
  scope: RuntimePackageScope;
  mutation: string | null;
  onScopeChange: (scope: RuntimePackageScope) => void;
  onInstall: (source: string) => Promise<void>;
}) {
  const [searchText, setSearchText] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PackageCatalogResult | null>(null);
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [sort, setSort] = useState<CatalogSort>("relevance");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [details, setDetails] = useState<PackageCatalogDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const installedNames = useMemo(() => new Set(packages.flatMap((pkg) => {
    const name = packageNameFromSource(pkg.source);
    return name ? [name] : [];
  })), [packages]);

  const loadCatalog = useCallback(async (query: string, targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const next = await agentGateway.searchPackageCatalog({ query, page: targetPage, pageSize: 24 });
      setResult(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog(activeQuery, page);
  }, [activeQuery, loadCatalog, page, refreshKey]);

  useEffect(() => {
    if (!selectedName) {
      setDetails(null);
      setDetailsError(null);
      return;
    }
    let cancelled = false;
    setDetailsLoading(true);
    setDetailsError(null);
    void agentGateway.getPackageCatalogDetails(selectedName)
      .then((next) => {
        if (!cancelled) setDetails(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setDetailsError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setDetailsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedName]);

  const entries = useMemo(() => {
    const filtered = (result?.entries ?? []).filter((entry) => filter === "all" || entry.kinds.includes(filter));
    if (sort === "downloads") return [...filtered].sort((left, right) => right.monthlyDownloads - left.monthlyDownloads);
    if (sort === "recent") {
      return [...filtered].sort((left, right) => Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? ""));
    }
    return filtered;
  }, [filter, result?.entries, sort]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  function submitSearch(event: React.FormEvent): void {
    event.preventDefault();
    setPage(0);
    setActiveQuery(searchText.trim());
    if (activeQuery === searchText.trim()) setRefreshKey((value) => value + 1);
  }

  function openLink(url: string): void {
    void agentGateway.openExternal(url);
  }

  return (
    <section className="resource-section online-package-section">
      <header>
        <div><span className="eyebrow">PI PACKAGE CATALOG</span><h2>在线 Package 商店</h2></div>
        <small>来自 npm · pi-package</small>
      </header>

      <form className="catalog-toolbar" onSubmit={submitSearch}>
        <label className="catalog-search"><Search size={15} /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索名称、作者或功能…" /><button type="submit">搜索</button></label>
        <select value={filter} onChange={(event) => setFilter(event.target.value as CatalogFilter)} aria-label="资源类型">
          <option value="all">全部类型</option>
          <option value="extension">Extensions</option>
          <option value="skill">Skills</option>
          <option value="prompt">Prompts</option>
          <option value="theme">Themes</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as CatalogSort)} aria-label="排序方式">
          <option value="relevance">相关度</option>
          <option value="downloads">本页下载量</option>
          <option value="recent">本页最新</option>
        </select>
        <button type="button" className="catalog-refresh" title="刷新" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)}>
          {loading ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
        </button>
      </form>

      <div className="catalog-scope-row">
        <span>安装位置</span>
        <select value={scope} disabled={disabled} onChange={(event) => onScopeChange(event.target.value as RuntimePackageScope)}>
          <option value="user">当前用户</option>
          <option value="project" disabled={!projectTrusted}>当前项目</option>
        </select>
        <p>第三方 Package 会在 Pi Agent 进程中运行；“npm OIDC”只表示发布流程身份可验证，不代表代码经过安全审核。</p>
      </div>

      {mutation && <p className="resource-operation"><LoaderCircle className="spin" size={14} />正在处理：{mutation}</p>}
      {error && <div className="catalog-error" role="alert"><AlertTriangle size={15} /><span>{error}</span><button type="button" onClick={() => setRefreshKey((value) => value + 1)}>重试</button></div>}

      {selectedName && (
        <aside className="catalog-details">
          <header><div><span className="eyebrow">PACKAGE DETAILS</span><strong>{selectedName}</strong></div><button type="button" onClick={() => setSelectedName(null)}>关闭</button></header>
          {detailsLoading && <div className="catalog-details-loading"><LoaderCircle className="spin" size={16} />正在读取 npm manifest…</div>}
          {detailsError && <div className="catalog-error"><AlertTriangle size={15} />{detailsError}</div>}
          {details && details.name === selectedName && (
            <>
              <p>{details.description}</p>
              <div className="catalog-detail-grid">
                <span><small>版本</small><strong>{details.version}</strong></span>
                <span><small>许可证</small><strong>{details.license ?? "未声明"}</strong></span>
                <span><small>解包大小</small><strong>{formatBytes(details.unpackedSize)}</strong></span>
                <span><small>Node.js</small><strong>{details.nodeRequirement ?? "未声明"}</strong></span>
                <span><small>依赖</small><strong>{details.dependencyNames.length}</strong></span>
                <span><small>安装脚本</small><strong className={details.hasInstallScript ? "risk" : "safe"}>{details.hasInstallScript ? "存在" : "没有"}</strong></span>
              </div>
              <div className="catalog-manifest">
                {details.manifest.extensions.map((path) => <code key={`e:${path}`}>Extension · {path}</code>)}
                {details.manifest.skills.map((path) => <code key={`s:${path}`}>Skill · {path}</code>)}
                {details.manifest.prompts.map((path) => <code key={`p:${path}`}>Prompt · {path}</code>)}
                {details.manifest.themes.map((path) => <code key={`t:${path}`}>Theme · {path}</code>)}
                {details.manifest.extensions.length + details.manifest.skills.length + details.manifest.prompts.length + details.manifest.themes.length === 0 && <span>没有声明显式 Pi manifest，安装后将按约定目录发现资源。</span>}
              </div>
              {details.hasInstallScript && <div className="catalog-risk-note"><AlertTriangle size={14} />该 Package 声明了 npm 安装脚本，安装时可能执行本地代码，请先检查源码。</div>}
              {details.kinds.includes("theme") && <div className="catalog-risk-note neutral"><AlertTriangle size={14} />Pi TUI Theme 不会改变桌面客户端主题，只会作为 Pi 资源安装。</div>}
              <footer>
                <button type="button" onClick={() => openLink(details.links.piCatalog)}>pi.dev <ExternalLink size={13} /></button>
                <button type="button" onClick={() => openLink(details.links.npm)}>npm <ExternalLink size={13} /></button>
                {details.links.repository && <button type="button" onClick={() => openLink(details.links.repository!)}>源码 <ExternalLink size={13} /></button>}
                <button type="button" disabled={disabled || installedNames.has(details.name)} onClick={() => void onInstall(`npm:${details.name}`)}><Download size={13} />安装最新版</button>
                <button type="button" disabled={disabled || installedNames.has(details.name)} onClick={() => void onInstall(`npm:${details.name}@${details.version}`)}><Download size={13} />固定版本安装</button>
              </footer>
            </>
          )}
        </aside>
      )}

      {loading && !result ? (
        <div className="resource-empty"><LoaderCircle className="spin" size={22} /><strong>正在连接 Package Catalog</strong><p>从 npm Registry 获取带有 pi-package 标记的公开包。</p></div>
      ) : entries.length === 0 && !error ? (
        <div className="resource-empty"><Search size={22} /><strong>没有找到匹配的 Package</strong><p>可以换一个关键词，或切回“全部类型”。</p></div>
      ) : (
        <div className={`catalog-package-grid ${loading ? "loading" : ""}`}>
          {entries.map((entry) => {
            const Icon = kindIcon(entry.kinds[0] ?? "package");
            const installed = installedNames.has(entry.name);
            return (
              <article key={entry.name} className={selectedName === entry.name ? "selected" : ""}>
                <header>
                  <span className="catalog-package-icon"><Icon size={17} /></span>
                  <div><strong>{entry.name}</strong><small>v{entry.version} · {entry.publisher}</small></div>
                  {installed && <span className="catalog-installed"><PackageCheck size={13} />已安装</span>}
                </header>
                <p>{entry.description}</p>
                <div className="catalog-kind-row">
                  {entry.kinds.map((kind) => <span key={kind}>{kindLabels[kind]}</span>)}
                  <span className={`compatibility ${entry.compatibility}`}>{entry.compatibility === "full" ? <ShieldCheck size={11} /> : null}{compatibilityLabels[entry.compatibility]}</span>
                  {entry.trustedPublisher && <span className="trusted-publisher"><ShieldCheck size={11} />npm OIDC</span>}
                </div>
                <footer>
                  <span><Download size={12} />{compactNumber(entry.monthlyDownloads)}/月</span>
                  <span>{formatDate(entry.publishedAt)}</span>
                  <button type="button" onClick={() => setSelectedName(entry.name)}>详情</button>
                  <button type="button" className="primary" disabled={disabled || installed} onClick={() => setSelectedName(entry.name)}>{installed ? "已安装" : "检查并安装"}</button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {result && result.total > result.pageSize && (
        <footer className="catalog-pagination">
          <span>npm 找到约 {compactNumber(result.total)} 个结果 · 第 {page + 1}/{totalPages} 页</span>
          <div>
            <button type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft size={14} />上一页</button>
            <button type="button" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>下一页<ChevronRight size={14} /></button>
          </div>
        </footer>
      )}
    </section>
  );
}
