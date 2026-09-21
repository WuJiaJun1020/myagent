import { cp, mkdtemp, rm } from "node:fs/promises";
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

  it("loads the versioned built-in question catalog and persists user favorites", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const catalogDirectory = join(process.cwd(), "resources", "interview-question-bank");
    const service = new InterviewService(
      directory,
      vectorStore,
      undefined,
      undefined,
      catalogDirectory,
    );

    const snapshot = await service.getQuestionBankSnapshot();
    expect(snapshot.published).toBeGreaterThanOrEqual(40);
    const page = await service.listQuestionBankQuestions({
      search: "Python",
      limit: 5,
      offset: 0,
    });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.length).toBeLessThanOrEqual(5);
    const selected = page.items[0]!;
    const detail = await service.getQuestionBankQuestion(selected.id);
    expect(detail).toMatchObject({ id: selected.id, stableKey: selected.stableKey });

    const favorite = await service.setQuestionBankFavorite({ questionId: selected.id, favorite: true });
    expect(favorite).toMatchObject({ questionId: selected.id, favorite: true, favorites: 1 });
    await service.close();

    const reopened = new InterviewService(
      directory,
      vectorStore,
      undefined,
      undefined,
      catalogDirectory,
    );
    expect((await reopened.getQuestionBankSnapshot()).favorites).toBe(1);
    expect((await reopened.listQuestionBankQuestions({ favoritesOnly: true })).items)
      .toEqual([expect.objectContaining({ id: selected.id, favorite: true })]);
    await reopened.close();
  });

  it("rejects invalid question-bank filters before reading storage", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const service = new InterviewService(directory, vectorStore);

    await expect(service.listQuestionBankQuestions({ kind: "unsupported" }))
      .rejects.toThrow("题目类型无效");
    await expect(service.listQuestionBankQuestions({ limit: 1_000 }))
      .rejects.toThrow("题库每页数量");
    await expect(service.listQuestionBankQuestions({ limit: "10" }))
      .rejects.toThrow("题库每页数量");
    await expect(service.listQuestionBankQuestions({ offset: true }))
      .rejects.toThrow("题库分页位置无效");
    await expect(service.setQuestionBankFavorite({ questionId: "question-1", favorite: "yes" }))
      .rejects.toThrow("收藏状态无效");
    await service.close();
  });

  it("strictly validates every question-practice IPC input before reading storage", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const service = new InterviewService(directory, vectorStore);

    await expect(service.startQuestionPractice({
      operationId: "practice-1",
      selection: { kind: "single", questionId: "question-1" },
      unexpected: true,
    })).rejects.toThrow("未知字段");
    await expect(service.startQuestionPractice({
      operationId: "practice-1",
      selection: { kind: "single", questionId: "question-1", query: {} },
    })).rejects.toThrow("单题练习参数包含未知字段");
    await expect(service.startQuestionPractice({
      operationId: "practice-1",
      selection: { kind: "filtered", query: { limit: 10 }, count: 5, order: "latest" },
    })).rejects.toThrow("练习筛选参数包含未知字段");
    await expect(service.startQuestionPractice({
      operationId: "practice-1",
      selection: { kind: "filtered", query: {}, count: 101, order: "latest" },
    })).rejects.toThrow("练习题数必须在 1 到 100 之间");
    await expect(service.getQuestionPracticeSession("not a valid id"))
      .rejects.toThrow("练习批次 ID无效");
    await expect(service.saveQuestionPracticeDraft({
      sessionId: "session-1",
      itemId: "item-1",
      draftRevision: 0,
      answer: "draft",
      extra: true,
    })).rejects.toThrow("未知字段");
    await expect(service.saveQuestionPracticeDraft({
      sessionId: "session-1",
      itemId: "item-1",
      draftRevision: -1,
      answer: "draft",
    })).rejects.toThrow("草稿版本必须在");
    await expect(service.saveQuestionPracticeDraft({
      sessionId: "session-1",
      itemId: "item-1",
      draftRevision: 0,
      answer: "draft",
      elapsedSeconds: 604_801,
    })).rejects.toThrow("练习用时必须在");
    await expect(service.submitQuestionPracticeAnswer({
      sessionId: "session-1",
      itemId: "item-1",
      operationId: "submit-1",
      expectedStateVersion: 0,
      draftRevision: 0,
      answer: "  ",
    })).rejects.toThrow("练习回答不能为空");
    await expect(service.submitQuestionPracticeAnswer({
      sessionId: "session-1",
      itemId: "item-1",
      operationId: "submit-1",
      expectedStateVersion: 0,
      draftRevision: 0,
      answer: "answer",
      elapsedSeconds: 604_801,
    })).rejects.toThrow("练习用时必须在");
    await expect(service.completeQuestionPracticeReview({
      sessionId: "session-1",
      itemId: "item-1",
      operationId: "review-1",
      expectedStateVersion: 1,
      selfRating: "excellent",
      coveredRubricIds: [],
    })).rejects.toThrow("练习自评等级无效");
    await expect(service.completeQuestionPracticeReview({
      sessionId: "session-1",
      itemId: "item-1",
      operationId: "review-1",
      expectedStateVersion: 1,
      selfRating: "developing",
      coveredRubricIds: ["criterion-1", "criterion-1"],
    })).rejects.toThrow("评分点不能重复");
    await expect(service.skipQuestionPracticeItem({
      sessionId: "session-1",
      itemId: "item-1",
      operationId: "skip-1",
      expectedStateVersion: "1",
    })).rejects.toThrow("练习状态版本必须在");
    await expect(service.abandonQuestionPracticeSession({
      sessionId: "session-1",
      operationId: "abandon-1",
      expectedStateVersion: 1,
      reason: "unsupported",
    })).rejects.toThrow("未知字段");
    await expect(service.listQuestionPracticeHistory({ limit: 0, offset: 0 }))
      .rejects.toThrow("练习历史每页数量必须在 1 到 100 之间");
    await expect(service.listQuestionPracticeHistory({ limit: 20, extra: true }))
      .rejects.toThrow("未知字段");

    await service.close();
  });

  it("runs the persisted question-practice lifecycle through validated service methods", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const service = new InterviewService(
      directory,
      vectorStore,
      undefined,
      undefined,
      join(process.cwd(), "resources", "interview-question-bank"),
    );
    const selected = (await service.listQuestionBankQuestions({ limit: 1 })).items[0]!;

    const started = await service.startQuestionPractice({
      operationId: "practice-service-start-1",
      selection: { kind: "single", questionId: selected.id, expectedVersion: selected.version },
    });
    expect(started).toMatchObject({ status: "active", questionCount: 1, stateVersion: 0 });
    expect(started.currentItem).not.toHaveProperty("review");
    expect(await service.getQuestionPracticeSession(started.id)).toMatchObject({ id: started.id });

    const answer = "  保留回答原始空白  \n";
    const saved = await service.saveQuestionPracticeDraft({
      sessionId: started.id,
      itemId: started.currentItem!.id,
      draftRevision: 1,
      answer,
    });
    expect(saved).toMatchObject({ draftRevision: 1 });
    const submitted = await service.submitQuestionPracticeAnswer({
      sessionId: started.id,
      itemId: started.currentItem!.id,
      operationId: "practice-service-submit-1",
      expectedStateVersion: started.stateVersion,
      draftRevision: 1,
      answer,
      elapsedSeconds: 12,
    });
    expect(submitted.currentItem).toMatchObject({ status: "reviewing", answerText: answer, elapsedSeconds: 12 });
    expect(submitted.currentItem?.review?.rubric.length).toBeGreaterThan(0);

    const completed = await service.completeQuestionPracticeReview({
      sessionId: submitted.id,
      itemId: submitted.currentItem!.id,
      operationId: "practice-service-review-1",
      expectedStateVersion: submitted.stateVersion,
      selfRating: "developing",
      coveredRubricIds: [submitted.currentItem!.review!.rubric[0]!.id],
      note: "需要复习",
    });
    expect(completed).toMatchObject({ status: "completed", summary: { answered: 1, reviewed: 1 } });
    expect(await service.getQuestionPracticeOverview()).toMatchObject({
      completedSessions: 1,
      practicedQuestions: 1,
    });
    expect((await service.listQuestionPracticeHistory({ limit: 10, offset: 0 })).items[0])
      .toMatchObject({ id: completed.id, status: "completed", reviewed: 1 });

    const skipped = await service.startQuestionPractice({
      operationId: "practice-service-start-2",
      selection: { kind: "single", questionId: selected.id },
    });
    const afterSkip = await service.skipQuestionPracticeItem({
      sessionId: skipped.id,
      itemId: skipped.currentItem!.id,
      operationId: "practice-service-skip-1",
      expectedStateVersion: skipped.stateVersion,
    });
    expect(afterSkip.status).toBe("completed");

    const abandoned = await service.startQuestionPractice({
      operationId: "practice-service-start-3",
      selection: { kind: "single", questionId: selected.id },
    });
    expect(await service.abandonQuestionPracticeSession({
      sessionId: abandoned.id,
      operationId: "practice-service-abandon-1",
      expectedStateVersion: abandoned.stateVersion,
    })).toMatchObject({ status: "abandoned" });

    await service.close();
  });

  it("recovers an existing practice without reloading the packaged question catalog", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const service = new InterviewService(
      directory,
      vectorStore,
      undefined,
      undefined,
      join(process.cwd(), "resources", "interview-question-bank"),
    );
    const selected = (await service.listQuestionBankQuestions({ limit: 1 })).items[0]!;
    const started = await service.startQuestionPractice({
      operationId: "practice-service-recovery-start-1",
      selection: { kind: "single", questionId: selected.id, expectedVersion: selected.version },
    });
    await service.saveQuestionPracticeDraft({
      sessionId: started.id,
      itemId: started.currentItem!.id,
      draftRevision: 1,
      answer: "客户端关闭前保存的回答",
      elapsedSeconds: 37,
    });
    await service.close();

    const reopened = new InterviewService(
      directory,
      vectorStore,
      undefined,
      undefined,
      join(directory, "missing-question-bank"),
    );
    await expect(reopened.getQuestionPracticeOverview()).resolves.toMatchObject({
      activeSession: { id: started.id },
    });
    await expect(reopened.getQuestionPracticeSession(started.id)).resolves.toMatchObject({
      id: started.id,
      currentItem: {
        id: started.currentItem!.id,
        draftAnswer: "客户端关闭前保存的回答",
        draftRevision: 1,
        elapsedSeconds: 37,
      },
    });
    await expect(reopened.listQuestionPracticeHistory({ limit: 10, offset: 0 })).resolves.toMatchObject({
      items: [{ id: started.id, status: "active" }],
    });
    await expect(reopened.getQuestionBankSnapshot()).rejects.toThrow();
    await reopened.close();
  });

  it("allows a failed catalog load to be retried after the resource becomes available", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const catalogDirectory = join(directory, "late-question-bank");
    const service = new InterviewService(directory, vectorStore, undefined, undefined, catalogDirectory);

    await expect(service.getQuestionBankSnapshot()).rejects.toThrow();
    await cp(join(process.cwd(), "resources", "interview-question-bank"), catalogDirectory, { recursive: true });
    await expect(service.getQuestionBankSnapshot()).resolves.toMatchObject({ published: 40 });
    await service.close();
  });

  it("does not start question-bank work after the interview module begins closing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const service = new InterviewService(
      directory,
      vectorStore,
      undefined,
      undefined,
      join(process.cwd(), "resources", "interview-question-bank"),
    );

    await service.close();

    await expect(service.getQuestionBankSnapshot()).rejects.toThrow("面试模块正在关闭");
    await expect(service.listQuestionBankQuestions({ limit: 10 })).rejects.toThrow("面试模块正在关闭");
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
