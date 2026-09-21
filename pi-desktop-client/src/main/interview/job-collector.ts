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
  private activeEdgeSession: EdgeCdpSession | null = null;

  async collect(
    request: JobCollectionRequest,
    onProgress: JobCollectorProgressListener,
    signal?: AbortSignal,
  ): Promise<JobCollectorSourceOutput[]> {
    const outputs: JobCollectorSourceOutput[] = [];
    for (const source of request.sources) {
      throwIfAborted(signal);
      try {
        const jobs = source === "alibaba"
          ? await this.collectAlibaba(request, onProgress, signal)
          : await this.collectByteDance(request, onProgress, signal);
        outputs.push({ source, jobs });
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
      for (const keyword of request.keywords) {
        let pageIndex = 1;
        while (jobs.length < request.limitPerSource) {
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
  ): Promise<CollectedJobPosting[]> {
    throwIfAborted(signal);
    onProgress({ source: "bytedance", phase: "opening", message: "正在访问字节跳动校园招聘官网…", collected: 0 });
    const edge = await EdgeCdpSession.launch();
    if (signal?.aborted) {
      await edge.dispose();
      throw abortError(signal);
    }
    this.activeEdgeSession = edge;
    const jobs: CollectedJobPosting[] = [];
    const matchingRequests = new Set<string>();
    const pending = new Set<Promise<void>>();
    const stopResponseListener = edge.on("Network.responseReceived", (params) => {
      const response = params.response as { url?: string } | undefined;
      if (response?.url?.includes("/api/v1/search/job/posts")) matchingRequests.add(String(params.requestId));
    });
    const stopFinishedListener = edge.on("Network.loadingFinished", (params) => {
      const requestId = String(params.requestId);
      if (!matchingRequests.delete(requestId)) return;
      const task = edge.call<{ body?: string; base64Encoded?: boolean }>("Network.getResponseBody", { requestId })
        .then((response) => {
          if (!response.body) return;
          const text = response.base64Encoded ? Buffer.from(response.body, "base64").toString("utf8") : response.body;
          const data = JSON.parse(text) as { data?: { job_post_list?: unknown[] } };
          for (const item of data?.data?.job_post_list ?? []) {
            const job = normalizeByteDanceJob(item);
            if (job) jobs.push(job);
          }
        })
        .catch(() => undefined)
        .finally(() => pending.delete(task));
      pending.add(task);
    });

    try {
      const loaded = edge.waitFor("Page.loadEventFired", 60_000);
      const navigation = await edge.call<{ errorText?: string }>("Page.navigate", { url: BYTEDANCE_URL });
      if (navigation.errorText) throw new Error(`字节招聘页加载失败：${navigation.errorText}`);
      await loaded;
      onProgress({ source: "bytedance", phase: "opening", message: "字节招聘页面已加载，正在等待岗位数据…", collected: 0 });
      await delay(3_500, signal);

      for (const keyword of request.keywords) {
        throwIfAborted(signal);
        if (deduplicate(jobs, request.limitPerSource).length >= request.limitPerSource) break;
        onProgress({ source: "bytedance", phase: "searching", message: `字节跳动：正在采集“${keyword}”`, collected: deduplicate(jobs, request.limitPerSource).length });
        const foundInput = await edge.evaluate<boolean>(`(() => {
          const selectors = ['input[placeholder*="输入城市或职位"]', 'input[placeholder*="职位"]', 'input[placeholder*="搜索"]', 'input'];
          const input = selectors.map((selector) => document.querySelector(selector)).find(Boolean);
          if (!(input instanceof HTMLInputElement)) return false;
          input.focus();
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter?.call(input, ${JSON.stringify(keyword)});
          input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(keyword)} }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
          return true;
        })()`);
        if (!foundInput) throw new Error("未找到字节跳动官网的岗位搜索框，页面结构可能已改版。");
        await edge.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        await edge.call("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        await delay(3_500, signal);

        for (let page = 0; page < 3 && deduplicate(jobs, request.limitPerSource).length < request.limitPerSource; page += 1) {
          const clicked = await edge.evaluate<boolean>(`(() => {
            const buttons = [...document.querySelectorAll('button')];
            const button = buttons.find((item) => {
              const text = (item.textContent || '').trim();
              const label = item.getAttribute('aria-label') || '';
              return !item.disabled && (text.includes('下一页') || text === '>' || label.toLowerCase() === 'next');
            }) || document.querySelector('[class*="pagination"] button:last-child');
            if (!(button instanceof HTMLElement) || button.matches(':disabled')) return false;
            button.click();
            return true;
          })()`);
          if (!clicked) break;
          await delay(2_500, signal);
        }
      }
      if (pending.size > 0) await Promise.allSettled([...pending]);
    } finally {
      stopResponseListener();
      stopFinishedListener();
      await edge.dispose();
      if (this.activeEdgeSession === edge) this.activeEdgeSession = null;
    }

    const result = deduplicate(jobs, request.limitPerSource);
    if (result.length === 0) throw new Error("未捕获到字节跳动岗位数据，官网可能已改版或触发了验证。");
    onProgress({ source: "bytedance", phase: "completed", message: `字节跳动采集完成，获取 ${result.length} 个岗位`, collected: result.length });
    return result;
  }

  private destroyActiveWindow(): void {
    if (this.activeWindow && !this.activeWindow.isDestroyed()) this.activeWindow.destroy();
    this.activeWindow = null;
  }
}
