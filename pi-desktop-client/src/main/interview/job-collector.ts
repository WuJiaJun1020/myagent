import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import type {
  CollectedJobPosting,
  JobCollectionProgress,
  JobCollectionRequest,
  JobSource,
} from "../../shared/contracts/interview";
import { EdgeCdpSession } from "./edge-cdp-session";

const ALIBABA_URL = "https://campus-talent.alibaba.com/campus/position";
const BYTEDANCE_URL = "https://jobs.bytedance.com/campus/position";
// Filter copied from the campus site's 技术/研发 + 日常实习/ByteIntern selection.
const BYTEDANCE_TECH_CATEGORIES = [
  "6704215862603155720", "6704215956018694411", "6704215862557018372", "6704215957146962184",
  "6704215886108035339", "6704215897130666254", "6704219534724696331", "6704216109274368264",
  "6704215888985327886", "6938376045242353957", "6704215958816295181", "6704215963966900491",
  "6704216296701036811", "6704217321877014787", "6704216635923761412",
];
const BYTEDANCE_INTERNSHIP_PROJECTS = ["7194661644654577981", "7194661126919358757"];
const BYTEDANCE_PAGE_SIZE = 10;

export function byteDanceInternshipPageUrl(keyword: string, page: number): string {
  const url = new URL(BYTEDANCE_URL);
  for (const [key, value] of Object.entries({
    keywords: keyword,
    category: BYTEDANCE_TECH_CATEGORIES.join(","),
    location: "",
    project: BYTEDANCE_INTERNSHIP_PROJECTS.join(","),
    type: "",
    job_hot_flag: "",
    current: String(page),
    limit: String(BYTEDANCE_PAGE_SIZE),
    functionCategory: "",
    tag: "",
  })) url.searchParams.set(key, value);
  return url.toString();
}

export function byteDanceSearchItems(value: unknown): unknown[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const items = (data as { job_post_list?: unknown }).job_post_list;
  return Array.isArray(items) ? items : null;
}

export type JobCollectorSourceOutput = {
  source: JobSource;
  jobs: CollectedJobPosting[];
  error?: string;
};

export type JobCollectorProgressListener = (progress: Omit<JobCollectionProgress, "runId">) => void;

export interface InterviewJobCollector {
  collect(
    request: JobCollectionRequest,
    onProgress: JobCollectorProgressListener,
    signal?: AbortSignal,
  ): Promise<JobCollectorSourceOutput[]>;
  close(): Promise<void> | void;
}

export type ByteDanceBrowser = Pick<EdgeCdpSession, "call" | "on" | "dispose" | "terminate">;

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("岗位采集已取消");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, milliseconds));
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    const handleAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", handleAbort);
      reject(abortError(signal));
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/\u00a0/gu, " ")
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function namedValue(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return cleanText(value);
  const record = value as Record<string, unknown>;
  const candidate = record.name ?? record.i18n_name ?? record.i18nName;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const localized = candidate as Record<string, unknown>;
    return cleanText(localized.zh_cn ?? localized.i18n ?? localized.en_us);
  }
  return cleanText(candidate);
}

function joinValues(value: unknown): string {
  if (Array.isArray(value)) return value.map(namedValue).filter(Boolean).join(" / ");
  return namedValue(value);
}

export function splitJobItems(value: unknown): string[] {
  const text = cleanText(value);
  if (!text) return [];
  const lines = text.split("\n").map((line) => line.trim().replace(/^[-•●]+\s*/u, "")).filter(Boolean);
  const joined = lines.join("\n");
  const numbered = joined.split(/(?:^|\n)\s*\d+\s*[、.．]\s*/u).map(cleanText).filter((item) => item.length >= 5);
  if (numbered.length >= 2) return numbered;
  const bullets = joined.split(/(?:^|\n)\s*[•●-]\s*/u).map(cleanText).filter((item) => item.length >= 5);
  return bullets.length >= 2 ? bullets : [joined];
}

function buildRawText(job: Omit<CollectedJobPosting, "rawText">): string {
  return [
    `公司：${job.company}`,
    `来源：${job.source}`,
    `岗位：${job.title}`,
    `岗位 ID：${job.sourceJobId}`,
    `城市：${job.city}`,
    `岗位类型：${job.jobType}`,
    `方向：${job.category}`,
    `批次：${job.batch}`,
    `部门/业务：${job.department}`,
    "",
    "岗位描述：",
    job.description,
    "",
    "岗位要求：",
    job.requirements.join("\n"),
    "",
    `链接：${job.sourceUrl}`,
  ].join("\n").trim();
}

export function normalizeAlibabaJob(value: unknown): CollectedJobPosting | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const sourceJobId = cleanText(item.id ?? item.code);
  const title = cleanText(item.name ?? item.title);
  if (!sourceJobId || !title) return null;
  const batchId = cleanText(item.batchId);
  const description = cleanText(item.description);
  const requirement = cleanText(item.requirement);
  const sourceUrl = cleanText(item.positionUrl)
    || `https://campus-talent.alibaba.com/campus/position-detail?positionId=${encodeURIComponent(sourceJobId)}${batchId ? `&batchId=${encodeURIComponent(batchId)}` : ""}`;
  const base = {
    source: "alibaba" as const,
    sourceJobId,
    sourceCode: cleanText(item.code),
    company: "阿里巴巴",
    title,
    city: joinValues(item.workLocations),
    jobType: cleanText(item.categoryType),
    category: cleanText(item.categoryName),
    batch: cleanText(item.batchName),
    department: joinValues(item.circleNames ?? item.department),
    description,
    responsibilities: splitJobItems(description),
    requirements: splitJobItems(requirement),
    sourceUrl,
    collectedAt: new Date().toISOString(),
  };
  return { ...base, rawText: buildRawText(base) };
}

export function normalizeByteDanceJob(value: unknown): CollectedJobPosting | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const sourceJobId = cleanText(item.id ?? item.job_id ?? item.code);
  const title = cleanText(item.title ?? item.name);
  if (!sourceJobId || !title) return null;
  const categoryValue = item.job_category;
  let category = joinValues(categoryValue);
  if (categoryValue && typeof categoryValue === "object" && !Array.isArray(categoryValue)) {
    const categoryRecord = categoryValue as Record<string, unknown>;
    category = [namedValue(categoryRecord.parent), namedValue(categoryRecord)].filter(Boolean).join("-");
  }
  const description = cleanText(item.description);
  const requirement = cleanText(item.requirement);
  const base = {
    source: "bytedance" as const,
    sourceJobId,
    sourceCode: cleanText(item.code),
    company: "字节跳动",
    title,
    city: joinValues(item.city_list ?? item.city_info_list_for_delivery ?? item.city_info),
    jobType: namedValue(item.recruit_type),
    category,
    batch: namedValue(item.job_subject),
    department: cleanText(item.department ?? item.department_name),
    description,
    responsibilities: splitJobItems(description),
    requirements: splitJobItems(requirement),
    sourceUrl: `https://jobs.bytedance.com/campus/position/${encodeURIComponent(sourceJobId)}/detail`,
    collectedAt: new Date().toISOString(),
  };
  return { ...base, rawText: buildRawText(base) };
}

function deduplicate(jobs: CollectedJobPosting[], limit: number): CollectedJobPosting[] {
  const unique = new Map<string, CollectedJobPosting>();
  for (const job of jobs) {
    const key = `${job.source}:${job.sourceJobId}`;
    if (!unique.has(key)) unique.set(key, job);
    if (unique.size >= limit) break;
  }
  return [...unique.values()];
}

function createCollectorWindow(url: string): BrowserWindow {
  const allowedOrigin = new URL(url).origin;
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      partition: `job-collector-${randomUUID()}`,
    },
  });
  // Keep a conventional stable Chrome user agent. Some recruitment portals reject
  // Electron's product token or very new embedded Chromium versions before rendering.
  window.webContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, target) => {
    try {
      if (new URL(target).origin !== allowedOrigin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  return window;
}

export class ElectronJobCollector implements InterviewJobCollector {
  private activeWindow: BrowserWindow | null = null;
  private activeEdgeSession: ByteDanceBrowser | null = null;

  constructor(private readonly launchByteDanceBrowser: () => Promise<ByteDanceBrowser> = () => EdgeCdpSession.launch()) {}

  async collect(
    request: JobCollectionRequest,
    onProgress: JobCollectorProgressListener,
    signal?: AbortSignal,
  ): Promise<JobCollectorSourceOutput[]> {
    const outputs: JobCollectorSourceOutput[] = [];
    for (const source of request.sources) {
      throwIfAborted(signal);
      try {
        const output = source === "alibaba"
          ? { source, jobs: await this.collectAlibaba(request, onProgress, signal) }
          : await this.collectByteDance(request, onProgress, signal);
        outputs.push(output);
      } catch (error) {
        if (signal?.aborted) throw abortError(signal);
        const message = error instanceof Error ? error.message : String(error);
        onProgress({ source, phase: "failed", message, collected: 0 });
        outputs.push({ source, jobs: [], error: message });
      } finally {
        this.destroyActiveWindow();
      }
    }
    return outputs;
  }

  close(): void {
    this.destroyActiveWindow();
    this.activeEdgeSession?.terminate();
    this.activeEdgeSession = null;
  }

  private async collectAlibaba(
    request: JobCollectionRequest,
    onProgress: JobCollectorProgressListener,
    signal?: AbortSignal,
  ): Promise<CollectedJobPosting[]> {
    throwIfAborted(signal);
    onProgress({ source: "alibaba", phase: "opening", message: "正在访问阿里巴巴校园招聘官网…", collected: 0 });
    const window = createCollectorWindow(ALIBABA_URL);
    this.activeWindow = window;
    await window.loadURL(ALIBABA_URL);
    await delay(2_500, signal);
    const token = await window.webContents.executeJavaScript(`window.__sysconfig && window.__sysconfig.__token__`, true) as unknown;
    if (typeof token !== "string" || !token) throw new Error("阿里招聘页面未提供访问令牌，可能是官网已改版或触发了验证。");

    const batchData = await window.webContents.executeJavaScript(`(async () => {
      const response = await fetch('/searchCondition/listBatch?_csrf=' + encodeURIComponent(${JSON.stringify(token)}), {
        method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'
      });
      return response.json();
    })()`, true) as { content?: Record<string, unknown[]> };
    const batchIds: string[] = [];
    for (const group of ["internship", "topTalentPlan", "graduate"]) {
      for (const item of batchData?.content?.[group] ?? []) {
        if (!item || typeof item !== "object") continue;
        const id = cleanText((item as Record<string, unknown>).id);
        if (id && !batchIds.includes(id)) batchIds.push(id);
      }
    }
    if (batchIds.length === 0) batchIds.push("100000540002");

    const jobs: CollectedJobPosting[] = [];
    for (const batchId of batchIds) {
      for (const keyword of request.keywords.length > 0 ? request.keywords : [""]) {
        let pageIndex = 1;
        while (deduplicate(jobs, request.limitPerSource).length < request.limitPerSource) {
          throwIfAborted(signal);
          onProgress({ source: "alibaba", phase: "searching", message: `阿里巴巴：正在采集“${keyword}”第 ${pageIndex} 页`, collected: deduplicate(jobs, request.limitPerSource).length });
          const payload = {
            batchId: Number(batchId),
            searchKey: keyword,
            pageIndex,
            pageSize: Math.min(20, Math.max(10, request.limitPerSource)),
            channel: "campus_group_official_site",
            language: "zh",
          };
          const data = await window.webContents.executeJavaScript(`(async () => {
            const response = await fetch('/position/search?_csrf=' + encodeURIComponent(${JSON.stringify(token)}), {
              method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(${JSON.stringify(payload)})
            });
            return response.json();
          })()`, true) as { content?: { datas?: unknown[]; totalCount?: number; pageSize?: number } };
          const items = Array.isArray(data?.content?.datas) ? data.content.datas : [];
          if (items.length === 0) break;
          for (const item of items) {
            const job = normalizeAlibabaJob(item);
            if (job) jobs.push(job);
          }
          const uniqueCount = deduplicate(jobs, request.limitPerSource).length;
          if (uniqueCount >= request.limitPerSource) break;
          const pageSize = Number(data.content?.pageSize) || items.length;
          const totalCount = Number(data.content?.totalCount) || items.length;
          if (pageIndex * pageSize >= totalCount) break;
          pageIndex += 1;
          await delay(1_200, signal);
        }
        if (deduplicate(jobs, request.limitPerSource).length >= request.limitPerSource) break;
      }
      if (deduplicate(jobs, request.limitPerSource).length >= request.limitPerSource) break;
    }
    const result = deduplicate(jobs, request.limitPerSource);
    onProgress({ source: "alibaba", phase: "completed", message: `阿里巴巴采集完成，获取 ${result.length} 个岗位`, collected: result.length });
    return result;
  }

  private async collectByteDance(
    request: JobCollectionRequest,
    onProgress: JobCollectorProgressListener,
    signal?: AbortSignal,
  ): Promise<JobCollectorSourceOutput> {
    throwIfAborted(signal);
    onProgress({ source: "bytedance", phase: "opening", message: "正在访问字节跳动日常实习 / ByteIntern 技术类岗位…", collected: 0 });
    const edge = await this.launchByteDanceBrowser();
    if (signal?.aborted) {
      await edge.dispose();
      throw abortError(signal);
    }
    this.activeEdgeSession = edge;
    const jobs: CollectedJobPosting[] = [];
    let partialError: string | undefined;
    try {
      for (const keyword of request.keywords.length > 0 ? request.keywords : [""]) {
        throwIfAborted(signal);
        if (deduplicate(jobs, request.limitPerSource).length >= request.limitPerSource) break;
        let stalePages = 0;
        for (let page = 1; deduplicate(jobs, request.limitPerSource).length < request.limitPerSource; page += 1) {
          throwIfAborted(signal);
          const previousCount = deduplicate(jobs, request.limitPerSource).length;
          onProgress({ source: "bytedance", phase: "searching",
            message: `字节跳动：${keyword ? `“${keyword}”` : "全部技术实习"}第 ${page} 页（${previousCount}/${request.limitPerSource}）`,
            collected: previousCount });
          const items = await this.readByteDancePage(edge, keyword, page, signal);
          if (items.length === 0) break;
          for (const item of items) {
            const job = normalizeByteDanceJob(item);
            if (job) jobs.push(job);
          }
          stalePages = deduplicate(jobs, request.limitPerSource).length === previousCount ? stalePages + 1 : 0;
          if (items.length < BYTEDANCE_PAGE_SIZE || stalePages >= 2) break;
          await delay(700, signal);
        }
      }
    } catch (error) {
      if (signal?.aborted || jobs.length === 0) throw error;
      partialError = error instanceof Error ? error.message : String(error);
    } finally {
      await edge.dispose();
      if (this.activeEdgeSession === edge) this.activeEdgeSession = null;
    }

    const result = deduplicate(jobs, request.limitPerSource);
    if (result.length === 0) throw new Error("未捕获到字节跳动岗位数据，官网可能已改版或触发了验证。");
    onProgress({ source: "bytedance", phase: "completed",
      message: partialError ? `字节跳动后续页面中断，保留已获取的 ${result.length} 个岗位` : `字节跳动采集完成，获取 ${result.length} 个岗位`,
      collected: result.length });
    return { source: "bytedance", jobs: result, ...(partialError ? { error: partialError } : {}) };
  }

  private async readByteDancePage(
    edge: ByteDanceBrowser,
    keyword: string,
    page: number,
    signal?: AbortSignal,
  ): Promise<unknown[]> {
    const matchingRequests = new Set<string>();
    let items: unknown[] | null = null;
    const stopResponseListener = edge.on("Network.responseReceived", (params) => {
      const response = params.response as { url?: string } | undefined;
      if (response?.url?.includes("/api/v1/search/job/posts")) matchingRequests.add(String(params.requestId));
    });
    const stopFinishedListener = edge.on("Network.loadingFinished", (params) => {
      const requestId = String(params.requestId);
      if (!matchingRequests.delete(requestId)) return;
      void edge.call<{ body?: string; base64Encoded?: boolean }>("Network.getResponseBody", { requestId })
        .then((response) => {
          if (!response.body || items !== null) return;
          const text = response.base64Encoded ? Buffer.from(response.body, "base64").toString("utf8") : response.body;
          items = byteDanceSearchItems(JSON.parse(text));
        })
        .catch(() => undefined);
    });
    try {
      const navigation = await edge.call<{ errorText?: string }>("Page.navigate", {
        url: byteDanceInternshipPageUrl(keyword, page),
      });
      if (navigation.errorText) throw new Error(`字节招聘页加载失败：${navigation.errorText}`);
      const deadline = Date.now() + 25_000;
      while (items === null && Date.now() < deadline) await delay(250, signal);
      if (items === null) throw new Error(`字节招聘第 ${page} 页未返回岗位数据，官网可能已改版或触发了验证。`);
      return items;
    } finally {
      stopResponseListener();
      stopFinishedListener();
    }
  }

  private destroyActiveWindow(): void {
    if (this.activeWindow && !this.activeWindow.isDestroyed()) this.activeWindow.destroy();
    this.activeWindow = null;
  }
}
