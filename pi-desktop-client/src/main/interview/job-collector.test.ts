import { describe, expect, it } from "vitest";
import { byteDanceInternshipPageUrl, byteDanceSearchItems, normalizeAlibabaJob,
  normalizeByteDanceJob, splitJobItems, ElectronJobCollector, type ByteDanceBrowser } from "./job-collector";

function fakeByteDanceBrowser(pageCount: number, failAtPage?: number): { browser: ByteDanceBrowser; urls: string[] } {
  const urls: string[] = [];
  const bodies = new Map<string, string>();
  const listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>();
  const emit = (event: string, params: Record<string, unknown>) => {
    for (const listener of listeners.get(event) ?? []) listener(params);
  };
  const browser: ByteDanceBrowser = {
    on(event, listener) {
      const group = listeners.get(event) ?? new Set<(params: Record<string, unknown>) => void>();
      group.add(listener);
      listeners.set(event, group);
      return () => group.delete(listener);
    },
    async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
      if (method === "Network.getResponseBody") return { body: bodies.get(String(params.requestId)) } as T;
      if (method !== "Page.navigate") throw new Error(`Unexpected CDP method: ${method}`);
      const url = String(params.url);
      urls.push(url);
      const page = Number(new URL(url).searchParams.get("current"));
      if (page === failAtPage) return { errorText: "test network failure" } as T;
      const requestId = `jobs-${urls.length}`;
      bodies.set(requestId, JSON.stringify({ data: { job_post_list: page > pageCount ? []
        : Array.from({ length: 10 }, (_, index) => ({ id: `job-${page}-${index}`, title: `技术实习 ${page}-${index}` })) } }));
      queueMicrotask(() => {
        emit("Network.responseReceived", { requestId, response: { url: "https://jobs.bytedance.com/api/v1/search/job/posts" } });
        emit("Network.loadingFinished", { requestId });
      });
      return {} as T;
    },
    async dispose() {},
    terminate() {},
  };
  return { browser, urls };
}

describe("job collector normalization", () => {
  it("normalizes Alibaba career-site fields", () => {
    const job = normalizeAlibabaJob({
      id: 199903220038,
      name: "AI应用研发工程师",
      workLocations: ["北京", "杭州"],
      categoryType: "internship",
      categoryName: "技术类",
      batchName: "2027届实习生",
      batchId: 100000540002,
      circleNames: ["阿里云"],
      description: "1. 设计 Agent\n2. 实现 RAG",
      requirement: "1. 熟悉 TypeScript\n2. 熟悉数据库",
    });

    expect(job).toMatchObject({
      source: "alibaba",
      sourceJobId: "199903220038",
      city: "北京 / 杭州",
      department: "阿里云",
      responsibilities: ["设计 Agent", "实现 RAG"],
    });
    expect(job?.sourceUrl).toContain("batchId=100000540002");
  });

  it("normalizes ByteDance nested category and location fields", () => {
    const job = normalizeByteDanceJob({
      id: "7639323748735387957",
      code: "A05580",
      title: "大模型算法实习生",
      description: "研究生成式推荐。",
      requirement: "熟悉 Python",
      city_list: [{ name: "北京" }, { name: "上海" }],
      job_category: { name: "算法", parent: { name: "研发" } },
      recruit_type: { name: "实习" },
      job_subject: { name: { zh_cn: "前沿技术实习招聘" } },
    });

    expect(job).toMatchObject({
      source: "bytedance",
      sourceJobId: "7639323748735387957",
      sourceCode: "A05580",
      city: "北京 / 上海",
      category: "研发-算法",
      batch: "前沿技术实习招聘",
    });
  });

  it("keeps plain unnumbered text as one item", () => {
    expect(splitJobItems("具备良好的沟通与协作能力")).toEqual(["具备良好的沟通与协作能力"]);
  });

  it("keeps the selected ByteDance internship and technical filters while paging", () => {
    const first = new URL(byteDanceInternshipPageUrl("", 1));
    const next = new URL(byteDanceInternshipPageUrl("AI Agent", 12));
    expect(first.origin + first.pathname).toBe("https://jobs.bytedance.com/campus/position");
    expect(first.searchParams.get("project")?.split(",")).toEqual([
      "7194661644654577981", "7194661126919358757",
    ]);
    expect(first.searchParams.get("category")?.split(",")).toHaveLength(15);
    expect(first.searchParams.get("current")).toBe("1");
    expect(next.searchParams.get("current")).toBe("12");
    expect(next.searchParams.get("keywords")).toBe("AI Agent");
    expect(next.searchParams.get("project")).toBe(first.searchParams.get("project"));
    expect(next.searchParams.get("category")).toBe(first.searchParams.get("category"));
  });

  it("recognizes an empty final ByteDance page instead of treating it as a failed response", () => {
    expect(byteDanceSearchItems({ data: { job_post_list: [] } })).toEqual([]);
    expect(byteDanceSearchItems({ data: { job_post_list: [{ id: "1" }] } })).toEqual([{ id: "1" }]);
    expect(byteDanceSearchItems({ data: { message: "error" } })).toBeNull();
  });

  it("collects beyond the former three-page ByteDance limit", async () => {
    const fake = fakeByteDanceBrowser(5);
    const collector = new ElectronJobCollector(async () => fake.browser);
    const [output] = await collector.collect({ sources: ["bytedance"], keywords: [], limitPerSource: 45 }, () => undefined);
    expect(output).toMatchObject({ source: "bytedance" });
    expect(output.jobs).toHaveLength(45);
    expect(fake.urls.map((url) => new URL(url).searchParams.get("current"))).toEqual(["1", "2", "3", "4", "5"]);
    expect(fake.urls.every((url) => new URL(url).searchParams.get("project")?.includes("7194661644654577981"))).toBe(true);
  }, 10_000);

  it("keeps already captured ByteDance jobs if a later page fails", async () => {
    const fake = fakeByteDanceBrowser(5, 2);
    const collector = new ElectronJobCollector(async () => fake.browser);
    const [output] = await collector.collect({ sources: ["bytedance"], keywords: [], limitPerSource: 45 }, () => undefined);
    expect(output.jobs).toHaveLength(10);
    expect(output.error).toContain("test network failure");
  });
});
