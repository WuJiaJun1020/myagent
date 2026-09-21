import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InterviewVectorStore } from "./interview-vector-store";
import {
  INTERVIEW_PREPARE_QUESTIONS_PROMPT_VERSION,
  type InterviewModelProvider,
  type InterviewModelResult,
  type PreparedInterviewQuestions,
} from "./interview-model-provider";
import type { InterviewJobCollector } from "./job-collector";
import { InterviewService } from "./interview-service";

const cleanup: string[] = [];
const vectorStore: InterviewVectorStore = {
  upsert: async () => undefined,
  search: async () => [],
  deleteByDocument: async () => undefined,
  deleteByInterview: async () => undefined,
  close: () => undefined,
};
const jobCollector: InterviewJobCollector = {
  collect: async (_request, onProgress) => {
    onProgress({ source: "alibaba", phase: "searching", message: "正在采集", collected: 0 });
    return [{
      source: "alibaba",
      jobs: [{
        source: "alibaba",
        sourceJobId: "job-1",
        sourceCode: "",
        company: "阿里巴巴",
        title: "AI 应用研发工程师",
        city: "杭州",
        jobType: "internship",
        category: "技术类",
        batch: "2027 届实习生",
        department: "阿里云",
        description: "负责 Agent 开发",
        responsibilities: ["负责 Agent 开发"],
        requirements: ["熟悉 TypeScript"],
        rawText: "阿里巴巴 AI 应用研发工程师",
        sourceUrl: "https://campus-talent.alibaba.com/campus/position-detail?positionId=job-1",
        collectedAt: "2026-09-20T10:00:00.000Z",
      }],
    }];
  },
  close: () => undefined,
};

function createDraft(service: InterviewService) {
  return service.createInterview({
    candidateName: "张三",
    positionTitle: "后端开发",
    jobDescription: "负责可靠的服务端系统开发",
    resumeText: "五年 TypeScript 与数据库开发经验",
    questionCount: 2,
    competencies: ["技术基础", "项目经验"],
  });
}

function successfulPreparation(): InterviewModelResult<PreparedInterviewQuestions> {
  return {
    ok: true,
    value: {
      promptVersion: INTERVIEW_PREPARE_QUESTIONS_PROMPT_VERSION,
      questions: [
        {
          ordinal: 0,
          competency: "技术基础",
          kind: "technical",
          difficulty: "intermediate",
          prompt: "请解释事件循环。",
          rubric: ["准确说明任务队列"],
        },
        {
          ordinal: 1,
          competency: "项目经验",
          kind: "project",
          difficulty: "advanced",
          prompt: "请介绍一次可靠性改造。",
          rubric: ["说明背景、决策与结果"],
        },
      ],
    },
    invocation: {
      status: "succeeded",
      purpose: "prepare_questions",
      promptVersion: INTERVIEW_PREPARE_QUESTIONS_PROMPT_VERSION,
      providerId: "deepseek",
      modelId: "deepseek-flash",
      requestHash: "a".repeat(64),
      responseHash: "b".repeat(64),
      usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
      durationMs: 25,
    },
  };
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("InterviewService", () => {
  it("validates IPC input before writing business memory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const service = new InterviewService(directory, vectorStore);

    expect(() => service.createInterview({
      candidateName: "",
      positionTitle: "后端开发",
      jobDescription: "岗位描述",
      resumeText: "简历内容",
      questionCount: 5,
      competencies: ["技术基础"],
    })).toThrow("候选人姓名不能为空");
    expect(service.getSnapshot().interviews).toEqual([]);
    await service.close();
  });

  it("rejects duplicate competency dimensions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const service = new InterviewService(directory, vectorStore);

    expect(() => service.createInterview({
      candidateName: "张三",
      positionTitle: "后端开发",
      jobDescription: "岗位描述",
      resumeText: "简历内容",
      questionCount: 5,
      competencies: ["技术基础", "技术基础"],
    })).toThrow("能力维度不能重复");
    await service.close();
  });

  it("collects official jobs through an injected collector and persists them", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const service = new InterviewService(directory, vectorStore, jobCollector);
    const progress: string[] = [];

    const result = await service.collectJobs({
      sources: ["alibaba"],
      keywords: ["AI"],
      limitPerSource: 10,
    }, (event) => progress.push(event.phase));

    expect(result.run.status).toBe("completed");
    expect(result.snapshot).toMatchObject({ total: 1, bySource: { alibaba: 1, bytedance: 0 } });
    expect(progress).toEqual(["starting", "searching", "saving", "completed"]);
    await service.close();
  });

  it("validates collection input before opening a browser", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const service = new InterviewService(directory, vectorStore, jobCollector);

    await expect(service.collectJobs({ sources: [], keywords: ["AI"], limitPerSource: 10 }))
      .rejects.toThrow("请选择至少一个采集来源");
    await service.close();
  });

  it("cancels and waits for an active collection before closing storage", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    let collectionStarted!: () => void;
    const started = new Promise<void>((resolve) => { collectionStarted = resolve; });
    const collectorClose = vi.fn();
    const collector: InterviewJobCollector = {
      collect: async (_request, _onProgress, signal) => {
        collectionStarted();
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
      close: collectorClose,
    };
    const service = new InterviewService(directory, vectorStore, collector);
    const collection = service.collectJobs({
      sources: ["alibaba"],
      keywords: ["AI"],
      limitPerSource: 10,
    });
    await started;
    const collectionFailure = expect(collection).rejects.toThrow("岗位采集已取消");

    await service.close();

    await collectionFailure;
    expect(collectorClose).toHaveBeenCalledTimes(1);
    expect(() => service.getSnapshot()).toThrow("面试模块正在关闭");
  });

  it("prepares and persists a fixed question plan without creating a Pi session", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const prepareQuestions = vi.fn(async () => successfulPreparation());
    const modelProvider: InterviewModelProvider = { prepareQuestions };
    const service = new InterviewService(directory, vectorStore, undefined, modelProvider);
    const interview = createDraft(service);
    const phases: string[] = [];

    const session = await service.prepareInterview({
      interviewId: interview.id,
      operationId: "prepare-1",
      privacyConfirmed: true,
    }, (progress) => phases.push(progress.phase));

    expect(prepareQuestions).toHaveBeenCalledWith(expect.objectContaining({
      positionTitle: "后端开发",
      questionCount: 2,
      competencies: ["技术基础", "项目经验"],
    }), expect.objectContaining({ traceId: "prepare-1", signal: expect.any(AbortSignal) }));
    expect(session.interview.status).toBe("ready");
    expect(session.plan).toMatchObject({ version: 1, questionCount: 2 });
    expect(session.currentQuestion).toBeNull();
    expect(phases).toEqual(["validating", "calling_model", "saving", "completed"]);

    await service.close();

    const reopened = new InterviewService(directory, vectorStore);
    expect(reopened.getInterviewSession(interview.id)?.plan).toMatchObject({ version: 1, questionCount: 2 });
    await reopened.close();
  });

  it("deduplicates the same active preparation operation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    let resolvePreparation!: (value: InterviewModelResult<PreparedInterviewQuestions>) => void;
    const pending = new Promise<InterviewModelResult<PreparedInterviewQuestions>>((resolve) => {
      resolvePreparation = resolve;
    });
    const prepareQuestions = vi.fn(() => pending);
    const service = new InterviewService(directory, vectorStore, undefined, { prepareQuestions });
    const interview = createDraft(service);
    const request = { interviewId: interview.id, operationId: "same-operation", privacyConfirmed: true };

    const first = service.prepareInterview(request);
    const duplicate = service.prepareInterview(request);
    expect(duplicate).toBe(first);
    expect(prepareQuestions).toHaveBeenCalledTimes(1);
    resolvePreparation(successfulPreparation());
    await expect(first).resolves.toMatchObject({ interview: { status: "ready" } });
    await service.close();
  });

  it("requires privacy confirmation before sending documents to a provider", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const prepareQuestions = vi.fn(async () => successfulPreparation());
    const service = new InterviewService(directory, vectorStore, undefined, { prepareQuestions });
    const interview = createDraft(service);

    await expect(service.prepareInterview({
      interviewId: interview.id,
      operationId: "prepare-private",
      privacyConfirmed: false,
    })).rejects.toThrow("请先确认");
    expect(prepareQuestions).not.toHaveBeenCalled();
    expect(service.getInterviewSession(interview.id)?.interview.status).toBe("draft");
    await service.close();
  });

  it("restores the draft and stores a safe error when question generation fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const prepareQuestions = vi.fn(async (): Promise<InterviewModelResult<PreparedInterviewQuestions>> => ({
      ok: false,
      error: { code: "rate_limited", message: "模型服务请求过于频繁", retryable: true },
      invocation: {
        status: "failed",
        purpose: "prepare_questions",
        promptVersion: INTERVIEW_PREPARE_QUESTIONS_PROMPT_VERSION,
        errorCode: "rate_limited",
        errorMessage: "模型服务请求过于频繁",
        durationMs: 10,
      },
    }));
    const service = new InterviewService(directory, vectorStore, undefined, { prepareQuestions });
    const interview = createDraft(service);

    await expect(service.prepareInterview({
      interviewId: interview.id,
      operationId: "prepare-failure",
      privacyConfirmed: true,
    })).rejects.toThrow("模型服务请求过于频繁");
    expect(service.getInterviewSession(interview.id)).toMatchObject({
      interview: { status: "draft" },
      preparationError: { code: "rate_limited", message: "模型服务请求过于频繁" },
    });
    await service.close();
  });
});
