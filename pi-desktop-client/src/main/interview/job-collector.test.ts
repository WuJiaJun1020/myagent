import { describe, expect, it } from "vitest";
import { normalizeAlibabaJob, normalizeByteDanceJob, splitJobItems } from "./job-collector";

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
});
