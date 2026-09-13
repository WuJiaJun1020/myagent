import type {
  PackageCatalogCompatibility,
  PackageCatalogDetails,
  PackageCatalogEntry,
  PackageCatalogKind,
  PackageCatalogManifest,
  PackageCatalogQuery,
  PackageCatalogResult,
} from "../../shared/contracts/package-catalog";

type UnknownRecord = Record<string, unknown>;
type CatalogFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const NPM_REGISTRY = "https://registry.npmjs.org";
const SEARCH_TTL_MS = 2 * 60_000;
const DETAILS_TTL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_LENGTH = 5_000_000;
const MAX_DESCRIPTION_LENGTH = 600;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
    : [];
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeHttpUrl(value: unknown): string | undefined {
  const raw = readString(value);
  if (!raw) return undefined;
  try {
    const normalized = raw.startsWith("git+") ? raw.slice(4) : raw;
    const url = new URL(normalized);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function repositoryUrl(value: unknown): string | undefined {
  if (typeof value === "string") return safeHttpUrl(value);
  return isRecord(value) ? safeHttpUrl(value.url) : undefined;
}

function inferKinds(keywords: string[], manifest?: PackageCatalogManifest): PackageCatalogKind[] {
  const kinds = new Set<PackageCatalogKind>();
  if (manifest?.extensions.length) kinds.add("extension");
  if (manifest?.skills.length) kinds.add("skill");
  if (manifest?.prompts.length) kinds.add("prompt");
  if (manifest?.themes.length) kinds.add("theme");
  const normalized = keywords.map((keyword) => keyword.toLocaleLowerCase());
  if (normalized.some((keyword) => keyword === "extension" || keyword.includes("pi-extension"))) kinds.add("extension");
  if (normalized.some((keyword) => keyword === "skill" || keyword === "skills" || keyword.includes("agent-skill"))) kinds.add("skill");
  if (normalized.some((keyword) => keyword === "prompt" || keyword === "prompts" || keyword.includes("prompt-template"))) kinds.add("prompt");
  if (normalized.some((keyword) => keyword === "theme" || keyword === "themes" || keyword.includes("pi-theme"))) kinds.add("theme");
  if (kinds.size === 0) kinds.add("package");
  return [...kinds];
}

function inferCompatibility(kinds: PackageCatalogKind[], keywords: string[]): PackageCatalogCompatibility {
  const normalized = keywords.join(" ").toLocaleLowerCase();
  if (/(^|[-_ ])(tui|terminal|statusline|status-line|footer|overlay|fullscreen|theme)([-_ ]|$)/u.test(normalized)) {
    return "partial";
  }
  if (kinds.every((kind) => kind === "skill" || kind === "prompt")) return "full";
  if (kinds.includes("theme")) return "partial";
  return "unknown";
}

function parseManifest(value: unknown): PackageCatalogManifest {
  const manifest = isRecord(value) ? value : {};
  return {
    extensions: readStringArray(manifest.extensions),
    skills: readStringArray(manifest.skills),
    prompts: readStringArray(manifest.prompts),
    themes: readStringArray(manifest.themes),
    ...(safeHttpUrl(manifest.image) ? { image: safeHttpUrl(manifest.image) } : {}),
    ...(safeHttpUrl(manifest.video) ? { video: safeHttpUrl(manifest.video) } : {}),
  };
}

function catalogUrl(name: string): string {
  const path = name
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://pi.dev/packages/${path}`;
}

function parseSearchEntry(value: unknown): PackageCatalogEntry | undefined {
  if (!isRecord(value) || !isRecord(value.package)) return undefined;
  const item = value.package;
  const name = readString(item.name);
  const version = readString(item.version);
  if (!name || !version) return undefined;
  const keywords = readStringArray(item.keywords);
  const kinds = inferKinds(keywords);
  const links = isRecord(item.links) ? item.links : {};
  const publisher = isRecord(item.publisher) ? item.publisher : {};
  const downloads = isRecord(value.downloads) ? value.downloads : {};
  const homepage = safeHttpUrl(links.homepage);
  const repository = safeHttpUrl(links.repository);
  const bugs = safeHttpUrl(links.bugs);
  return {
    name,
    version,
    description: readString(item.description)?.slice(0, MAX_DESCRIPTION_LENGTH) ?? "没有提供说明。",
    publisher: readString(publisher.username) ?? "未知发布者",
    ...(readString(item.license) ? { license: readString(item.license) } : {}),
    ...(readString(item.date) ? { publishedAt: readString(item.date) } : {}),
    monthlyDownloads: readNumber(downloads.monthly),
    weeklyDownloads: readNumber(downloads.weekly),
    keywords,
    kinds,
    compatibility: inferCompatibility(kinds, keywords),
    trustedPublisher: isRecord(publisher.trustedPublisher),
    links: {
      npm: safeHttpUrl(links.npm) ?? `https://www.npmjs.com/package/${encodeURIComponent(name)}`,
      ...(homepage ? { homepage } : {}),
      ...(repository ? { repository } : {}),
      ...(bugs ? { bugs } : {}),
      piCatalog: catalogUrl(name),
    },
  };
}

function fallbackEntry(value: UnknownRecord, name: string): PackageCatalogEntry {
  const keywords = readStringArray(value.keywords);
  const manifest = parseManifest(value.pi);
  const kinds = inferKinds(keywords, manifest);
  const author = isRecord(value.author) ? value.author : {};
  const maintainers = Array.isArray(value.maintainers) ? value.maintainers : [];
  const firstMaintainer = isRecord(maintainers[0]) ? maintainers[0] : {};
  const homepage = safeHttpUrl(value.homepage);
  const repository = repositoryUrl(value.repository);
  const bugs = isRecord(value.bugs) ? safeHttpUrl(value.bugs.url) : safeHttpUrl(value.bugs);
  return {
    name,
    version: readString(value.version) ?? "unknown",
    description: readString(value.description)?.slice(0, MAX_DESCRIPTION_LENGTH) ?? "没有提供说明。",
    publisher: readString(author.name) ?? readString(firstMaintainer.name) ?? "未知发布者",
    ...(readString(value.license) ? { license: readString(value.license) } : {}),
    monthlyDownloads: 0,
    weeklyDownloads: 0,
    keywords,
    kinds,
    compatibility: inferCompatibility(kinds, keywords),
    trustedPublisher: false,
    links: {
      npm: `https://www.npmjs.com/package/${encodeURIComponent(name)}`,
      ...(homepage ? { homepage } : {}),
      ...(repository ? { repository } : {}),
      ...(bugs ? { bugs } : {}),
      piCatalog: catalogUrl(name),
    },
  };
}

function validatePackageName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length > 214 || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/iu.test(trimmed)) {
    throw new Error("Package 名称无效");
  }
  return trimmed;
}

export class PiPackageCatalogService {
  private readonly searchCache = new Map<string, { expiresAt: number; result: PackageCatalogResult }>();
  private readonly detailsCache = new Map<string, { expiresAt: number; details: PackageCatalogDetails }>();
  private readonly entryCache = new Map<string, PackageCatalogEntry>();

  constructor(private readonly fetcher: CatalogFetch = globalThis.fetch) {}

  async search(query: PackageCatalogQuery): Promise<PackageCatalogResult> {
    const normalizedQuery = query.query.trim().slice(0, 100);
    const cacheKey = `${normalizedQuery}\u0000${query.page}\u0000${query.pageSize}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.result;

    const parameters = new URLSearchParams({
      text: `keywords:pi-package${normalizedQuery ? ` ${normalizedQuery}` : ""}`,
      from: String(query.page * query.pageSize),
      size: String(query.pageSize),
    });
    const response = await this.requestJson(`${NPM_REGISTRY}/-/v1/search?${parameters}`);
    if (!isRecord(response)) throw new Error("npm Registry 返回了无效的搜索结果");
    const entries = Array.isArray(response.objects)
      ? response.objects.flatMap((item) => {
          const entry = parseSearchEntry(item);
          return entry ? [entry] : [];
        })
      : [];
    for (const entry of entries) this.entryCache.set(entry.name, entry);
    const result: PackageCatalogResult = {
      entries,
      total: readNumber(response.total),
      page: query.page,
      pageSize: query.pageSize,
      source: "npm",
      fetchedAt: Date.now(),
    };
    this.searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_TTL_MS, result });
    return result;
  }

  async getDetails(packageName: string): Promise<PackageCatalogDetails> {
    const name = validatePackageName(packageName);
    const cached = this.detailsCache.get(name);
    if (cached && cached.expiresAt > Date.now()) return cached.details;
    const response = await this.requestJson(`${NPM_REGISTRY}/${encodeURIComponent(name)}/latest`);
    if (!isRecord(response)) throw new Error("npm Registry 返回了无效的 Package 详情");
    const manifest = parseManifest(response.pi);
    const base = this.entryCache.get(name) ?? fallbackEntry(response, name);
    const keywords = readStringArray(response.keywords);
    const kinds = inferKinds(keywords.length ? keywords : base.keywords, manifest);
    const scripts = isRecord(response.scripts) ? response.scripts : {};
    const dependencies = isRecord(response.dependencies) ? response.dependencies : {};
    const peerDependencies = isRecord(response.peerDependencies) ? response.peerDependencies : {};
    const engines = isRecord(response.engines) ? response.engines : {};
    const dist = isRecord(response.dist) ? response.dist : {};
    const details: PackageCatalogDetails = {
      ...base,
      version: readString(response.version) ?? base.version,
      description: readString(response.description)?.slice(0, MAX_DESCRIPTION_LENGTH) ?? base.description,
      ...(readString(response.license) ? { license: readString(response.license) } : {}),
      keywords: keywords.length ? keywords : base.keywords,
      kinds,
      compatibility: inferCompatibility(kinds, keywords.length ? keywords : base.keywords),
      ...(readNumber(dist.unpackedSize) ? { unpackedSize: readNumber(dist.unpackedSize) } : {}),
      dependencyNames: Object.keys(dependencies).sort(),
      peerDependencyNames: Object.keys(peerDependencies).sort(),
      ...(readString(engines.node) ? { nodeRequirement: readString(engines.node) } : {}),
      hasInstallScript: ["preinstall", "install", "postinstall"].some((key) => readString(scripts[key]) !== undefined),
      manifest,
    };
    this.detailsCache.set(name, { expiresAt: Date.now() + DETAILS_TTL_MS, details });
    return details;
  }

  private async requestJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetcher(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`npm Registry 请求失败（HTTP ${response.status}）`);
      const text = await response.text();
      if (text.length > MAX_RESPONSE_LENGTH) throw new Error("npm Registry 响应过大");
      return JSON.parse(text) as unknown;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("连接 npm Registry 超时");
      if (error instanceof SyntaxError) throw new Error("npm Registry 返回了无法解析的数据");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
