import { cp, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aiFailure, aiSuccess } from "../../platform/shared/ai/contracts";
import { RecordingModelGateway } from "../../platform/shared/ai/testing";
import type { InterviewVectorStore } from "./interview-vector-store";
import type { InterviewJobCollector } from "./job-collector";
import { InterviewService } from "./interview-service";
import { InterviewChatAgent } from "./interview-chat-agent";
import { InterviewDirectorAgent } from "./interview-director-agent";
import { InterviewScoreAgent } from "./interview-score-agent";
import type { InterviewAlgorithmExecutor } from "./interview-algorithm-exam";
import type { InterviewAlgorithmProblem, InterviewSession } from "../../shared/contracts/interview";
import { buildInterviewChatMessages, DEFAULT_INTERVIEW_CHAT_PROMPTS, INTERVIEWER_JSON_OUTPUT_RULES } from "../../shared/interview-chat-prompt";
import { DEFAULT_INTERVIEW_DIRECTOR_PROMPT } from "../../shared/interview-director-prompt";

const interviewerJson = (message: string, questionType: "resume" | "role" | "foundation" | "other" = "resume") =>
  JSON.stringify({ message, questionType });
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

function createDraft(service: InterviewService, directorEnabled = false) {
  return service.createInterview({
    candidateName: "张三",
    positionTitle: "后端开发",
    jobDescription: "负责可靠的服务端系统开发",
    resumeText: "五年 TypeScript 与数据库开发经验",
    questionCount: 2,
    competencies: ["技术基础", "项目经验"],
    directorEnabled,
  });
}

function directorJson(action: "pass" | "correct" | "redirect" | "close", guidance: string,
  options: { anchor?: string; bridge?: "present" | "missing" | "not_needed"; reason?: string;
    move?: "continue" | "switch" | "revisit" | "close";
    answeredSource?: "resume" | "role" | "foundation" | "other";
    draftSource?: "resume" | "role" | "foundation" | "other";
    answerCoverage?: Array<{ kind: "role" | "foundation"; label: string }>;
    roleGaps?: Array<{ label: string }> } = {}): string {
  const move = options.move ?? (action === "close" ? "close" : action === "redirect" ? "switch" : "continue");
  return JSON.stringify({ action, reason: options.reason ?? "已检查本轮回答与话题节奏", guidance,
    flow: { answeredTopic: { source: options.answeredSource ?? "resume", anchor: "项目经验", objective: "厘清个人贡献" },
      answerEvidence: "new", answerCoverage: options.answerCoverage ?? [],
      roleGaps: options.roleGaps ?? [], foundationNeed: "unknown",
      draft: { move, source: options.draftSource ?? (move === "close" ? "other" : "resume"),
        anchor: options.anchor ?? (move === "switch" ? "另一项目" : "项目经验"),
        objective: "考察下一项能力", targetBlockId: "", bridge: options.bridge ?? (move === "switch" ? "present" : "not_needed"),
        switchReason: move === "switch" ? "sufficient" : "none" } } });
}

const algorithmProblem: InterviewAlgorithmProblem = {
  slug: "two_sum", title: "两数之和", difficulty: "easy", description: "找出两个数的下标。",
  constraints: ["数组至少有两个元素"],
  examples: [{ leetcodeInput: "nums=[2,7], target=9", output: "[0,1]", acmStdin: "2 7 9",
    acmStdout: "0 1", explanation: "2+7=9" }],
  leetcode: { className: "Solution", methodName: "twoSum", parameters: [], returnType: "list[int]" },
  acm: { inputFields: [], outputType: "string", description: "读取标准输入" },
  templates: { leetcode: "class Solution:\n    pass", acm: "import sys" },
};

function fakeAlgorithmExecutor(): InterviewAlgorithmExecutor {
  return {
    pickProblem: vi.fn(() => algorithmProblem),
    getRuntimeInfo: vi.fn(async () => ({ available: true, source: "embedded" as const, displayName: "测试 Python" })),
    run: vi.fn(async (_slug, mode) => ({ verdict: mode === "acm" ? "accepted" as const : "wrong_answer" as const,
      passed: mode === "acm" ? 2 : 1, total: 2, durationMs: 12 })),
    close: vi.fn(async () => undefined),
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

  it("creates an interview from a verified local job and snapshots its full posting", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const service = new InterviewService(directory, vectorStore, jobCollector);
    const collected = await service.collectJobs({ sources: ["alibaba"], keywords: ["AI"], limitPerSource: 10 });
    const job = collected.snapshot.jobs[0]!;

    const created = service.createInterview({ candidateName: "张三", positionTitle: "客户端传来的标题",
      jobDescription: "客户端传来的描述", jobPostingId: job.id, resumeText: "做过 Agent 项目",
      questionCount: 1, competencies: ["项目经验"] });

    expect(created.positionTitle).toBe(job.title);
    expect(created.documents.find((document) => document.kind === "job_description")?.content).toBe(job.rawText);
    const session = service.getInterviewSession(created.id)!;
    const opening = buildInterviewChatMessages(session);
    expect(opening.map((message) => message.role)).toEqual(["system", "user", "user"]);
    expect(opening[1].content).toContain(job.rawText);
    expect(opening[2].content).toContain("做过 Agent 项目");
    expect(buildInterviewChatMessages(session, "候选人回答")[1].content).toContain(job.rawText);
    expect(() => service.createInterview({ candidateName: "张三", positionTitle: "无效岗位",
      jobDescription: "", jobPostingId: "missing-job", resumeText: "做过 Agent 项目",
      questionCount: 1, competencies: ["项目经验"] })).toThrow("选择的岗位已不在岗位库中");
    await service.close();
  });

  it("persists jobs collected before a later source page fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const collector: InterviewJobCollector = {
      ...jobCollector,
      collect: async (request, onProgress) => {
        const outputs = await jobCollector.collect(request, onProgress);
        return outputs.map((output) => ({ ...output, error: "字节跳动第 2 页加载失败" }));
      },
    };
    const service = new InterviewService(directory, vectorStore, collector);

    const result = await service.collectJobs({ sources: ["alibaba"], keywords: [], limitPerSource: 500 });

    expect(result.run.status).toBe("partial");
    expect(result.run.results[0]).toMatchObject({ status: "partial", collected: 1,
      error: "字节跳动第 2 页加载失败" });
    expect(result.snapshot.total).toBe(1);
    await service.close();
  });

  it("validates collection input before opening a browser", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const service = new InterviewService(directory, vectorStore, jobCollector);

    await expect(service.collectJobs({ sources: [], keywords: ["AI"], limitPerSource: 10 }))
      .rejects.toThrow("请选择至少一个采集来源");
    const broadCollection = await service.collectJobs({ sources: ["alibaba"], keywords: [], limitPerSource: 500 });
    expect(broadCollection.run).toMatchObject({ status: "completed", keywords: [], limitPerSource: 500 });
    await expect(service.collectJobs({ sources: ["alibaba"], keywords: [], limitPerSource: 501 }))
      .rejects.toThrow("1 到 500");
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
    const service = new InterviewService(directory, vectorStore, undefined, catalogDirectory);

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

  it("runs a model conversation without a separate confirmation checkbox and restores its transcript", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway((request) => aiSuccess({ requestId: "chat-request",
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
      text: request.messages[0]?.content.includes("【本轮控制：开场】") ? interviewerJson("请介绍一个项目。") : interviewerJson("这个项目最大的技术取舍是什么？"),
      finishReason: "stop", usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 } }));
    const service = new InterviewService(directory, vectorStore, undefined, undefined, new InterviewChatAgent(gateway));
    const interview = createDraft(service);
    await expect(service.sendChat({ interviewId: interview.id, operationId: "chat-invalid", kind: "start",
      settings: { reasoning: "extreme" } })).rejects.toThrow("思考程度无效");
    await expect(service.sendChat({ interviewId: interview.id, operationId: "chat-no-search", kind: "start",
      webSearchEnabled: true })).rejects.toThrow("未知字段");
    await expect(service.sendChat({ interviewId: interview.id, operationId: "chat-empty-prompt", kind: "start",
      prompts: { systemPrompt: " ", startInstruction: "开场", replyInstruction: "续谈" } })).rejects.toThrow("系统提示词");
    expect(gateway.generateRequests).toHaveLength(0);
    const started = await service.sendChat({ interviewId: interview.id, operationId: "chat-start", kind: "start" });
    expect(started.turns.map((turn) => turn.content)).toEqual(["请介绍一个项目。"]);
    expect(started.turns[0].trace).toMatchObject({ status: "succeeded", attempts: [{ requestId: "chat-request" }] });
    expect(started.plan).toBeNull();
    const answered = await service.sendChat({ interviewId: interview.id, operationId: "chat-reply", kind: "reply",
      content: "我做过订单系统。",
      settings: { model: { providerId: "openai-codex", modelId: "gpt-6-luna" }, reasoning: "high" },
      prompts: { systemPrompt: "按自定义规则进行面试。", startInstruction: "自定义开场。", replyInstruction: "自定义续谈。" } });
    expect(answered.turns.map((turn) => turn.role)).toEqual(["interviewer", "candidate", "interviewer"]);
    expect(answered.answeredCount).toBe(1);
    expect(gateway.generateRequests[0].reasoning).toBe("medium");
    expect(gateway.generateRequests[1].reasoning).toBe("high");
    expect(gateway.generateRequests[1].messages[0].content).toBe(`按自定义规则进行面试。\n\n自定义续谈。\n\n${INTERVIEWER_JSON_OUTPUT_RULES}`);
    await service.close();
    const reopened = new InterviewService(directory, vectorStore);
    expect(reopened.getInterviewSession(interview.id)?.turns).toHaveLength(3);
    expect(reopened.getInterviewSession(interview.id)?.turns[2].trace?.reasoning).toBe("high");
    await reopened.close();
  });

  it("persists a simulated candidate answer and both model traces independently", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-candidate-"));
    cleanup.push(directory);
    const answers = [interviewerJson("请介绍你的项目。"), JSON.stringify({ answer: "我负责权限受控的工具调用。",
      mistakeMade: false, mistakeKind: "none", mistakeQuote: "" }), interviewerJson("为什么需要人工确认？")];
    const gateway = new RecordingModelGateway(() => aiSuccess({ requestId: "candidate-test",
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" }, text: answers.shift()!, finishReason: "stop",
      usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 } }));
    const service = new InterviewService(directory, vectorStore, undefined, undefined, new InterviewChatAgent(gateway));
    const interview = createDraft(service);
    await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    let candidateReady: InterviewSession | undefined;
    const result = await service.simulateCandidateTurn({ interviewId: interview.id, operationId: "simulation",
      candidateSettings: { reasoning: "low" }, candidatePrompt: "仅按简历回答。",
      interviewerSettings: { reasoning: "medium" }, interviewerPrompts: DEFAULT_INTERVIEW_CHAT_PROMPTS }, (progress) => {
      candidateReady = progress.session;
      expect(progress.operationId).toBe("simulation");
      expect(progress.session.turns.map((turn) => turn.role)).toEqual(["interviewer", "candidate"]);
      expect(gateway.generateRequests).toHaveLength(2);
    });
    expect(result.status).toBe("completed");
    expect(candidateReady?.turns[1]).toMatchObject({ source: "agent", content: "我负责权限受控的工具调用。" });
    expect(result.session.turns.map((turn) => turn.role)).toEqual(["interviewer", "candidate", "interviewer"]);
    expect(result.session.turns[1]).toMatchObject({ source: "agent", content: "我负责权限受控的工具调用。" });
    expect(result.session.debugEvents?.[0].trace).toMatchObject({ actor: "candidate_gate", status: "succeeded" });
    expect(result.session.debugEvents?.[1].trace).toMatchObject({ actor: "candidate", status: "succeeded" });
    expect(result.session.debugEvents?.[1].trace.messages[0]).toMatchObject({ kind: "system_prompt" });
    expect(result.session.debugEvents?.[1].trace.messages[0].content).toContain("仅按简历回答。");
    expect(gateway.generateRequests[2].messages[0].content).not.toContain("本轮模拟控制");
    expect(gateway.generateRequests.map((request) => request.reasoning)).toEqual(["medium", "low", "medium"]);
    await service.close();
  });

  it("returns the generated answer for manual retry if the interviewer call fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-candidate-error-"));
    cleanup.push(directory);
    let call = 0;
    const gateway = new RecordingModelGateway(() => {
      call += 1;
      if (call === 3) return aiFailure({ code: "timeout", message: "面试官超时", retryable: true });
      return aiSuccess({ requestId: `request-${call}`, model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
        text: call === 1 ? interviewerJson("请介绍项目。") : JSON.stringify({ answer: "我负责工具调用。",
          mistakeMade: false, mistakeKind: "none", mistakeQuote: "" }), finishReason: "stop",
        usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 } });
    });
    const service = new InterviewService(directory, vectorStore, undefined, undefined, new InterviewChatAgent(gateway));
    const interview = createDraft(service);
    await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    const result = await service.simulateCandidateTurn({ interviewId: interview.id, operationId: "simulation",
      candidateSettings: { reasoning: "low" }, candidatePrompt: "仅按简历回答。",
      interviewerSettings: { model: { providerId: "openai-codex", modelId: "gpt-6-luna" }, reasoning: "medium" },
      interviewerPrompts: DEFAULT_INTERVIEW_CHAT_PROMPTS });
    expect(result).toMatchObject({ status: "interviewer_failed", candidateText: "我负责工具调用。" });
    expect(result.session.turns.map((turn) => turn.role)).toEqual(["interviewer", "candidate"]);
    expect(result.session.debugEvents?.map((event) => [event.trace.actor, event.trace.status]))
      .toEqual([["candidate_gate", "succeeded"], ["candidate", "succeeded"], ["interviewer", "failed"]]);
    await service.close();
  });

  it("does not save half an exchange when interviewer JSON fails all four attempts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-json-failed-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway((request) => aiSuccess({ requestId: "json-failed",
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
      text: request.metadata.traceId === "opening" ? interviewerJson("请介绍项目。") : "未包装成 JSON 的追问",
      finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } }));
    const service = new InterviewService(directory, vectorStore, undefined, undefined, new InterviewChatAgent(gateway));
    try {
      const interview = createDraft(service);
      await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
      await expect(service.sendChat({ interviewId: interview.id, operationId: "invalid-reply", kind: "reply",
        content: "我负责状态管理。" })).rejects.toThrow("连续 4 次未通过验收");
      const saved = service.getInterviewSession(interview.id)!;
      expect(saved.turns).toHaveLength(1);
      expect(saved.answeredCount).toBe(0);
      expect(saved.debugEvents?.at(-1)?.trace.attempts).toHaveLength(4);
      expect(saved.debugEvents?.at(-1)?.trace.status).toBe("failed");
    } finally { await service.close(); }
  });

  it("keeps the same program draw when a simulated answer is retried for the same question", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-candidate-gate-retry-"));
    cleanup.push(directory);
    let candidateCalls = 0;
    const gateway = new RecordingModelGateway((request) => {
      if (request.metadata.purpose === "candidate_simulation" && ++candidateCalls === 1) {
        return aiFailure({ code: "timeout", message: "候选人暂时超时", retryable: true });
      }
      return aiSuccess({ requestId: "gate-retry", model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
        text: request.metadata.purpose === "candidate_simulation" ? JSON.stringify({
          answer: "我认为这里可以直接忽略幂等性。", mistakeMade: true,
          mistakeKind: (JSON.parse(request.messages.at(-1)!.content.split("\n").at(-1)!) as { mistakeKind: string }).mistakeKind,
          mistakeQuote: "可以直接忽略幂等性" })
          : request.metadata.traceId === "opening" ? interviewerJson("如何处理重复请求？") : interviewerJson("这里不能忽略幂等性。你会怎样处理？"),
        finishReason: "stop", usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 } });
    });
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway));
    const interview = createDraft(service);
    await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    await expect(service.simulateCandidateTurn({ interviewId: interview.id, operationId: "first-try",
      candidateSettings: { reasoning: "low" }, candidatePrompt: "测试候选人", candidateErrorRate: 100,
      interviewerSettings: { reasoning: "medium" }, interviewerPrompts: DEFAULT_INTERVIEW_CHAT_PROMPTS }))
      .rejects.toThrow("候选人暂时超时");
    const afterFailure = service.getInterviewSession(interview.id)!;
    expect(afterFailure.debugEvents?.filter((event) => event.trace.actor === "candidate_gate")).toHaveLength(1);
    const retry = await service.simulateCandidateTurn({ interviewId: interview.id, operationId: "second-try",
      candidateSettings: { reasoning: "low" }, candidatePrompt: "测试候选人", candidateErrorRate: 0,
      interviewerSettings: { reasoning: "medium" }, interviewerPrompts: DEFAULT_INTERVIEW_CHAT_PROMPTS });
    expect(retry.session.debugEvents?.filter((event) => event.trace.actor === "candidate_gate")).toHaveLength(1);
    expect(gateway.generateRequests.filter((request) => request.metadata.purpose === "candidate_simulation")
      .every((request) => request.messages.at(-1)?.content.includes('"mode":"mistake"'))).toBe(true);
    expect(gateway.generateRequests.filter((request) => request.metadata.purpose === "candidate_simulation")
      .every((request) => !request.messages[0].content.includes("【本轮程序控制"))).toBe(true);
    expect(retry.session.turns[1].source).toBe("agent");
    expect(retry.session.turns[1].candidateOutcome).toMatchObject({ requestedMode: "mistake", mistakeMade: true });
    await service.close();
  });

  it("does not run the candidate gate for a manual answer", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-candidate-manual-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway(() => aiSuccess({ requestId: "manual", model: {
      providerId: "openai-codex", modelId: "gpt-6-luna" }, text: interviewerJson("请继续说明。"), finishReason: "stop",
      usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 } }));
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway));
    const interview = createDraft(service);
    await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    const next = await service.sendChat({ interviewId: interview.id, operationId: "manual-reply", kind: "reply",
      content: "我手动回答。" });
    expect(next.debugEvents?.some((event) => event.trace.actor === "candidate_gate")).toBe(false);
    expect(next.turns[1].source).toBe("manual");
    await service.close();
  });

  it("keeps the algorithm exam isolated, accepts either coding mode and starts chat only afterwards", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-algorithm-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway(() => aiSuccess({ requestId: "interview-start",
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" }, text: interviewerJson("请介绍你的项目。"),
      finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } }));
    const executor = fakeAlgorithmExecutor();
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway), executor);
    const interview = service.createInterview({ candidateName: "张三", positionTitle: "开发",
      jobDescription: "", resumeText: "做过后端项目", questionCount: 1, competencies: ["项目经验"], algorithmEnabled: true });
    expect(service.getInterviewSession(interview.id)?.algorithm?.status).toBe("pending");
    expect(service.getInterviewSession(interview.id)?.algorithm?.problem).not.toHaveProperty("answers");
    await expect(service.sendChat({ interviewId: interview.id, operationId: "too-early", kind: "start" }))
      .rejects.toThrow("先完成算法考核");
    const started = await service.startAlgorithmExam(interview.id);
    expect(started.algorithm?.status).toBe("active");
    expect(started.algorithm?.deadlineAt).toBeTruthy();
    service.saveAlgorithmDraft({ interviewId: interview.id, mode: "leetcode", code: "first draft" });
    const wrong = await service.submitAlgorithmCode({ interviewId: interview.id,
      operationId: "wrong-1", mode: "leetcode", code: "wrong code" });
    expect(wrong.algorithm).toMatchObject({ status: "active", drafts: { leetcode: "wrong code", acm: "import sys" },
      attempts: [{ verdict: "wrong_answer", code: "wrong code", passed: 1, total: 2 }] });
    const passed = await service.submitAlgorithmCode({ interviewId: interview.id,
      operationId: "passed-2", mode: "acm", code: "print('0 1')" });
    expect(passed.algorithm).toMatchObject({ status: "passed", passedMode: "acm",
      attempts: [{ verdict: "wrong_answer" }, { verdict: "accepted" }] });
    expect(executor.run).toHaveBeenCalledTimes(2);
    expect(gateway.generateRequests).toHaveLength(0);
    await service.sendChat({ interviewId: interview.id, operationId: "start-after-algorithm", kind: "start" });
    expect(gateway.generateRequests).toHaveLength(1);
    await service.close();
    const reopened = new InterviewService(directory, vectorStore);
    expect(reopened.getInterviewSession(interview.id)?.algorithm).toMatchObject({ status: "passed", passedMode: "acm",
      attempts: [{ code: "wrong code" }, { code: "print('0 1')" }] });
    await reopened.close();
  });

  it("expires the durable ten-minute exam deadline and then allows the resume interview", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-algorithm-timeout-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway(() => aiSuccess({ requestId: "start-after-timeout",
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" }, text: interviewerJson("我们来聊聊项目。"),
      finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } }));
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway), fakeAlgorithmExecutor());
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-24T09:00:00.000Z"));
      const interview = service.createInterview({ candidateName: "张三", positionTitle: "开发",
        jobDescription: "", resumeText: "做过后端项目", questionCount: 1, competencies: ["项目经验"], algorithmEnabled: true });
      const active = await service.startAlgorithmExam(interview.id);
      expect(active.algorithm?.deadlineAt).toBe("2026-09-24T09:10:00.000Z");
      await service.close();
      const reopened = new InterviewService(directory, vectorStore, undefined, undefined,
        new InterviewChatAgent(gateway), fakeAlgorithmExecutor());
      expect(reopened.getInterviewSession(interview.id)?.algorithm?.status).toBe("active");
      vi.setSystemTime(new Date("2026-09-24T09:10:01.000Z"));
      expect(reopened.getInterviewSession(interview.id)?.algorithm?.status).toBe("timed_out");
      await expect(reopened.submitAlgorithmCode({ interviewId: interview.id, operationId: "late",
        mode: "leetcode", code: "late" })).rejects.toThrow("已结束");
      const opened = await reopened.sendChat({ interviewId: interview.id, operationId: "after-timeout", kind: "start" });
      expect(opened.turns[0].content).toBe("我们来聊聊项目。");
      await reopened.close();
    } finally {
      vi.useRealTimers();
      await service.close();
    }
  });

  it("moves on to the resume interview if Python becomes unavailable during the exam", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-algorithm-runtime-"));
    cleanup.push(directory);
    const executor = fakeAlgorithmExecutor();
    vi.mocked(executor.run).mockResolvedValue({ verdict: "runtime_unavailable", passed: 0, total: 0, durationMs: 0 });
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      undefined, executor);
    const interview = service.createInterview({ candidateName: "张三", positionTitle: "开发",
      jobDescription: "", resumeText: "做过后端项目", questionCount: 1, competencies: ["项目经验"], algorithmEnabled: true });
    await service.startAlgorithmExam(interview.id);
    const session = await service.submitAlgorithmCode({ interviewId: interview.id,
      operationId: "runtime-failed", mode: "leetcode", code: "print(1)" });
    expect(session.algorithm).toMatchObject({ status: "unavailable",
      attempts: [{ verdict: "runtime_unavailable" }] });
    await service.close();
  });

  it("saves the twentieth candidate answer and closes without requesting a twenty-first question", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-chat-limit-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway(() => aiSuccess({ requestId: "question",
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" }, text: interviewerJson("请继续介绍。"),
      finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } }));
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway));
    const interview = createDraft(service);
    await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    for (let index = 1; index <= 19; index++) {
      await service.sendChat({ interviewId: interview.id, operationId: `reply-${index}`, kind: "reply",
        content: `第 ${index} 次回答` });
    }
    expect(gateway.generateRequests).toHaveLength(20);
    const closed = await service.sendChat({ interviewId: interview.id, operationId: "reply-20", kind: "reply",
      content: "第 20 次回答" });
    expect(closed.interview.status).toBe("completed");
    expect(closed.answeredCount).toBe(20);
    expect(closed.turns.at(-2)?.content).toBe("第 20 次回答");
    expect(closed.turns.at(-1)?.content).toBe("感谢你今天的分享，本次面试先到这里。");
    expect(closed.turns.at(-1)?.questionType).toBe("other");
    expect(closed.turns.at(-1)?.trace?.deliveryNote).toContain("固定告别语");
    expect(gateway.generateRequests).toHaveLength(21);
    expect(gateway.generateRequests.at(-1)?.messages.at(-1)?.content).toContain("程序硬上限");
    expect(gateway.generateRequests.at(-1)?.messages[0]?.content).not.toContain("程序硬上限");
    await expect(service.sendChat({ interviewId: interview.id, operationId: "reply-21", kind: "reply",
      content: "继续" })).rejects.toThrow("不能进行对话");
    await service.close();
  });

  it.each([
    ["pass", "原草稿问题？", "interviewing", 2],
    ["correct", "纠正后追问？", "interviewing", 4],
    ["redirect", "改问另一项目？", "interviewing", 4],
    ["close", "感谢参加面试。", "completed", 3],
  ] as const)("uses the director's %s decision before publishing the interviewer draft", async (
    action, expectedText, expectedStatus, expectedCalls,
  ) => {
    const directory = await mkdtemp(join(tmpdir(), `pi-interview-director-${action}-`));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway((request) => {
      const text = request.metadata.purpose === "interview_director"
        ? directorJson(request.metadata.traceId?.includes(":director-verify-") ? "pass" : action,
          action === "pass" || request.metadata.traceId?.includes(":director-verify-") ? "" : "转向另一项经历",
          { anchor: action === "redirect" ? "另一项目" : "项目经验",
            ...(action === "redirect" && request.metadata.traceId?.includes(":director-verify-")
              ? { move: "switch" as const } : {}) })
        : request.messages.at(-1)?.content.includes("面试导演控制：")
          ? action === "close" ? interviewerJson("感谢参加面试。", "other") : action === "correct" ? interviewerJson("纠正后追问？") : interviewerJson("改问另一项目？")
          : request.messages[0]?.content.includes("本轮控制：开场") ? interviewerJson("请介绍项目。") : interviewerJson("原草稿问题？");
      return aiSuccess({ requestId: action, model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
        text, finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } });
    });
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway), undefined, new InterviewDirectorAgent(gateway));
    const interview = createDraft(service, true);
    await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    const before = gateway.generateRequests.length;
    const next = await service.sendChat({ interviewId: interview.id, operationId: "reply", kind: "reply",
      content: "我负责状态管理。", director: { enabled: true, settings: { reasoning: "low" },
        prompt: DEFAULT_INTERVIEW_DIRECTOR_PROMPT } });
    expect(gateway.generateRequests.length - before).toBe(expectedCalls);
    expect(next.interview.status).toBe(expectedStatus);
    expect(next.turns.at(-1)?.content).toBe(expectedText);
    expect(next.turns.at(-1)?.questionType).toBe(action === "close" ? "other" : "resume");
    expect(next.debugEvents?.some((event) => event.trace.actor === "director")).toBe(true);
    expect(next.debugEvents?.some((event) => event.trace.operationId.endsWith(":draft"))).toBe(action !== "pass");
    expect(next.debugEvents?.filter((event) => event.trace.actor === "director")).toHaveLength(
      action === "redirect" || action === "correct" ? 2 : 1);
    if (action === "correct") {
      const revision = gateway.generateRequests.find((request) => request.metadata.traceId === "reply:revision");
      expect(revision?.messages.at(-1)?.content).toContain("面试导演控制：修正纠错");
      expect(revision?.messages[0].content).not.toContain("面试导演控制：修正纠错");
      expect(revision?.messages.at(-2)?.content).toContain("【当前话题】");
    }
    expect(next.turns.at(-2)?.content).toBe("我负责状态管理。");
    if (action === "pass") {
      expect(next.topicFlow?.blocks).toMatchObject([{ anchor: "项目经验", questionRounds: [1, 2], status: "active" }]);
      await service.sendChat({ interviewId: interview.id, operationId: "reply-2", kind: "reply",
        content: "我负责状态管理。", director: { enabled: true, settings: { reasoning: "low" },
          prompt: DEFAULT_INTERVIEW_DIRECTOR_PROMPT } });
      expect(gateway.generateRequests.find((request) => request.metadata.traceId === "reply-2")
        ?.messages.at(-1)?.content).toContain("话题：项目经验\n段落编号：block-1");
    }
    await service.close();
  });

  it("stores the director's classification of accepted questions, including a correction to the opening", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-question-types-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway((request) => aiSuccess({ requestId: "classified",
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
      text: request.metadata.purpose === "interview_director"
        ? directorJson("pass", "", { answeredSource: "resume", draftSource: "role" })
        : request.metadata.traceId === "opening"
          ? interviewerJson("请介绍你做过的项目。", "foundation")
          : interviewerJson("如果岗位要求可靠重试，你会怎么设计？", "foundation"),
      finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
    }));
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway), undefined, new InterviewDirectorAgent(gateway));
    const interview = createDraft(service, true);
    const opening = await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    expect(opening.turns[0].questionType).toBe("foundation");
    const next = await service.sendChat({ interviewId: interview.id, operationId: "reply", kind: "reply",
      content: "我负责状态管理。" });
    expect(next.turns.map((turn) => turn.questionType)).toEqual(["resume", undefined, "role"]);
    expect(next.topicFlow?.questionSources).toMatchObject([{ source: "resume" }, { source: "role" }]);
    const later = await service.sendChat({ interviewId: interview.id, operationId: "reply-2", kind: "reply",
      content: "我负责状态管理。" });
    expect(later.turns[2].questionType).toBe("role");
    expect(later.topicFlow?.questionSources?.[1].source).toBe("role");
    await service.close();
    const reopened = new InterviewService(directory, vectorStore);
    expect(reopened.getInterviewSession(interview.id)?.turns.map((turn) => turn.questionType))
      .toEqual(["resume", undefined, "role", undefined, "role"]);
    await reopened.close();
  });

  it("stores a director-approved non-question response as other without changing topic progression", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-other-message-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway((request) => aiSuccess({ requestId: "other-message",
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
      text: request.metadata.purpose === "interview_director"
        ? directorJson("pass", "", { draftSource: "other" })
        : request.metadata.traceId === "opening" ? interviewerJson("请介绍项目。")
          : interviewerJson("明白了，感谢你补充这个背景。", "other"),
      finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
    }));
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway), undefined, new InterviewDirectorAgent(gateway));
    const interview = createDraft(service, true);
    await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    const next = await service.sendChat({ interviewId: interview.id, operationId: "reply", kind: "reply",
      content: "我负责状态管理。" });
    expect(next.turns.at(-1)).toMatchObject({ content: "明白了，感谢你补充这个背景。", questionType: "other" });
    expect(next.topicFlow?.questionSources?.at(-1)?.source).toBe("other");
    expect(next.topicFlow?.blocks[0].questionRounds).toEqual([1, 2]);
    await service.close();
  });

  it("retries one rejected rewrite and publishes only a director-approved final question", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-director-verify-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway((request) => {
      const operation = request.metadata.traceId ?? "";
      const text = request.metadata.purpose === "interview_director"
        ? directorJson(operation.endsWith(":director-verify-2") ? "pass" : "redirect",
          operation.endsWith(":director-verify-2") ? "" : operation.endsWith(":director-verify-1")
            ? "离开原项目，考察数据库服务" : "转向另一项经历",
          { anchor: operation.endsWith(":director-verify-2") ? "数据库服务" : "原项目",
            ...(operation.endsWith(":director-verify-2") ? { move: "switch" as const } : {}) })
        : operation.endsWith(":revision-2") ? interviewerJson("请讲讲数据库服务的设计。")
          : operation.endsWith(":revision") ? interviewerJson("仍然追问原项目？")
            : operation.endsWith(":opening") ? interviewerJson("请介绍项目。") : interviewerJson("原草稿问题？");
      return aiSuccess({ requestId: operation, model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
        text, finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } });
    });
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway), undefined, new InterviewDirectorAgent(gateway));
    const interview = createDraft(service, true);
    await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    const next = await service.sendChat({ interviewId: interview.id, operationId: "reply", kind: "reply",
      content: "我负责状态管理。", director: { enabled: true, settings: { reasoning: "low" },
        prompt: DEFAULT_INTERVIEW_DIRECTOR_PROMPT } });
    expect(next.turns.at(-1)?.content).toBe("请讲讲数据库服务的设计。");
    expect(next.debugEvents?.filter((event) => event.trace.actor === "director")).toHaveLength(3);
    expect(next.debugEvents?.some((event) => event.trace.outputText === interviewerJson("仍然追问原项目？"))).toBe(true);
    await service.close();
  });

  it("overrides a director pass when a new topic has no bridge, then saves only the revised block", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-topic-bridge-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway((request) => {
      const operation = request.metadata.traceId ?? "";
      const text = request.metadata.purpose === "interview_director"
        ? directorJson("pass", "", { move: "switch", anchor: "数据库事务",
          bridge: operation.includes(":director-verify-") ? "present" : "missing" })
        : operation === "opening" ? interviewerJson("请介绍你做过的项目。")
          : operation.endsWith(":revision") ? interviewerJson("刚才聊了项目实现，接下来想核实一个相关基础概念：事务隔离性是什么？")
            : interviewerJson("事务隔离性是什么？");
      return aiSuccess({ requestId: operation, model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
        text, finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } });
    });
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway), undefined, new InterviewDirectorAgent(gateway));
    const interview = createDraft(service, true);
    await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    const next = await service.sendChat({ interviewId: interview.id, operationId: "reply", kind: "reply",
      content: "我负责状态管理。", director: { enabled: true, settings: { reasoning: "medium" },
        prompt: DEFAULT_INTERVIEW_DIRECTOR_PROMPT } });
    expect(next.turns.at(-1)?.content).toContain("接下来想核实");
    expect(next.topicFlow?.blocks).toMatchObject([{ status: "completed", questionRounds: [1] },
      { anchor: "数据库事务", status: "active", questionRounds: [2] }]);
    expect(next.debugEvents?.find((event) => event.trace.actor === "director")?.trace.deliveryNote)
      .toContain("缺少自然过渡");
    await service.close();
  });

  it("stops after two rejected rewrites instead of publishing a question the director rejected", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-director-rejected-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway((request) => aiSuccess({ requestId: "rejected",
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
      text: request.metadata.purpose === "interview_director"
        ? directorJson("redirect", "转向另一项经历", { anchor: "另一项目", reason: "仍在原追问链" })
        : interviewerJson("仍然追问原项目？"), finishReason: "stop",
      usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } }));
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway), undefined, new InterviewDirectorAgent(gateway));
    const interview = createDraft(service, true);
    await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    await expect(service.sendChat({ interviewId: interview.id, operationId: "reply", kind: "reply",
      content: "我负责状态管理。", director: { enabled: true, settings: { reasoning: "low" },
        prompt: DEFAULT_INTERVIEW_DIRECTOR_PROMPT } })).rejects.toThrow("两次改写后仍未通过导演复核");
    const saved = service.getInterviewSession(interview.id)!;
    expect(saved.turns).toHaveLength(1);
    expect(saved.debugEvents?.filter((event) => event.trace.actor === "director")).toHaveLength(3);
    await service.close();
  });

  it("does not publish an unchecked interviewer draft if the director fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-director-fail-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway((request) => request.metadata.purpose === "interview_director"
      ? aiFailure({ code: "provider_unavailable", message: "暂时不可用", retryable: true })
      : aiSuccess({ requestId: "interviewer", model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
        text: interviewerJson("继续说明项目。"), finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } }));
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway), undefined, new InterviewDirectorAgent(gateway));
    const interview = createDraft(service, true);
    await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    await expect(service.sendChat({ interviewId: interview.id, operationId: "reply", kind: "reply",
      content: "我负责状态管理。", director: { enabled: true, settings: { reasoning: "low" },
        prompt: DEFAULT_INTERVIEW_DIRECTOR_PROMPT } })).rejects.toThrow("导演调用失败");
    const saved = service.getInterviewSession(interview.id)!;
    expect(saved.turns).toHaveLength(1);
    expect(saved.debugEvents?.at(-1)?.trace).toMatchObject({ actor: "director", status: "failed" });
    await service.close();
  });

  it("repairs malformed director JSON before publishing the question", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-director-json-repair-"));
    cleanup.push(directory);
    let directorCalls = 0;
    const gateway = new RecordingModelGateway((request) => aiSuccess({
      requestId: `call-${directorCalls}`,
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
      text: request.metadata.purpose === "interview_director"
        ? ++directorCalls === 1 ? `${directorJson("pass", "")} {}` : directorJson("pass", "")
        : request.metadata.traceId === "opening" ? interviewerJson("请介绍项目。") : interviewerJson("这个项目如何处理失败？"),
      finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
    }));
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway), undefined, new InterviewDirectorAgent(gateway));
    const interview = createDraft(service, true);
    await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    const saved = await service.sendChat({ interviewId: interview.id, operationId: "reply", kind: "reply",
      content: "我负责状态管理。", director: { enabled: true, settings: { reasoning: "low" },
        prompt: DEFAULT_INTERVIEW_DIRECTOR_PROMPT } });
    expect(saved.turns).toHaveLength(3);
    expect(directorCalls).toBe(2);
    expect(saved.debugEvents?.find((event) => event.trace.actor === "director")?.trace.attempts[0])
      .toMatchObject({ error: { code: "invalid_json_output" } });
    await service.close();
  });

  it("accepts director coverage labels without generating answer or job quotes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-director-coverage-labels-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway((request) => aiSuccess({
      requestId: request.metadata.traceId ?? "test",
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
      text: request.metadata.purpose === "interview_director"
        ? directorJson("pass", "", { answerCoverage: [{ kind: "role", label: "状态管理" }],
          roleGaps: [{ label: "服务可靠性" }] })
        : request.metadata.traceId === "opening" ? interviewerJson("请介绍项目。")
          : interviewerJson("这个项目如何处理失败？"),
      finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
    }));
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway), undefined, new InterviewDirectorAgent(gateway));
    const interview = createDraft(service, true);
    await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    const saved = await service.sendChat({ interviewId: interview.id, operationId: "reply", kind: "reply",
      content: "我负责**状态管理**。", director: { enabled: true, settings: { reasoning: "medium" },
        prompt: DEFAULT_INTERVIEW_DIRECTOR_PROMPT } });
    expect(saved.turns).toHaveLength(3);
    expect(saved.topicFlow?.coverage).toMatchObject([{ kind: "role", label: "状态管理", answerRound: 1 }]);
    expect(saved.topicFlow?.pendingRoleAbilities).toEqual([{ label: "服务可靠性" }]);
    expect(gateway.generateRequests.filter((request) => request.metadata.purpose === "interview_director")).toHaveLength(1);
    await service.close();
  });

  it("returns a simulated answer for retry when the director fails, then resumes the same interview", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-director-candidate-retry-"));
    cleanup.push(directory);
    let directorCalls = 0;
    const gateway = new RecordingModelGateway((request) => {
      if (request.metadata.purpose === "interview_director" && ++directorCalls === 1) {
        return aiFailure({ code: "timeout", message: "导演超时", retryable: true });
      }
      const text = request.metadata.purpose === "interview_director" ? directorJson("pass", "")
        : request.metadata.purpose === "candidate_simulation" ? JSON.stringify({ answer: "我负责状态管理。",
          mistakeMade: false, mistakeKind: "none", mistakeQuote: "" })
          : request.metadata.traceId === "opening" ? interviewerJson("请介绍项目。") : interviewerJson("这个项目如何处理失败？");
      return aiSuccess({ requestId: request.metadata.traceId ?? "test", model: { providerId: "openai-codex",
        modelId: "gpt-6-luna" }, text, finishReason: "stop",
      usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } });
    });
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway), undefined, new InterviewDirectorAgent(gateway));
    const interview = createDraft(service, true);
    await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    const attempt = await service.simulateCandidateTurn({ interviewId: interview.id, operationId: "simulation",
      candidateSettings: { reasoning: "medium" }, candidatePrompt: "仅按简历回答。",
      interviewerSettings: { reasoning: "medium" }, interviewerPrompts: DEFAULT_INTERVIEW_CHAT_PROMPTS,
      director: { enabled: true, settings: { reasoning: "medium" }, prompt: DEFAULT_INTERVIEW_DIRECTOR_PROMPT } });
    expect(attempt).toMatchObject({ status: "interviewer_failed", candidateText: "我负责状态管理。" });
    expect(attempt.session.turns.map((turn) => turn.role)).toEqual(["interviewer", "candidate"]);
    const resumed = await service.sendChat({ interviewId: interview.id, operationId: "manual-retry", kind: "reply",
      content: attempt.candidateText, director: { enabled: true, settings: { reasoning: "medium" },
        prompt: DEFAULT_INTERVIEW_DIRECTOR_PROMPT } });
    expect(resumed.turns.map((turn) => turn.role)).toEqual(["interviewer", "candidate", "interviewer"]);
    expect(resumed.topicFlow?.blocks[0].questionRounds).toEqual([1, 2]);
    await service.close();
  });

  it("does not let a director-disabled interview turn it on through a chat request", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-director-fixed-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway(() => aiSuccess({ requestId: "interviewer",
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" }, text: interviewerJson("请介绍项目。"),
      finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } }));
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway), undefined, new InterviewDirectorAgent(gateway));
    const interview = createDraft(service);
    await service.sendChat({ interviewId: interview.id, operationId: "opening", kind: "start" });
    await expect(service.sendChat({ interviewId: interview.id, operationId: "reply", kind: "reply",
      content: "我负责后端。", director: { enabled: true, settings: { reasoning: "low" },
        prompt: DEFAULT_INTERVIEW_DIRECTOR_PROMPT } })).rejects.toThrow("创建时未启用");
    expect(gateway.generateRequests).toHaveLength(1);
    await service.close();
  });

  it("deletes a persisted interview and its vector cache through the service", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const vectors = { ...vectorStore, deleteByInterview: vi.fn(async () => undefined) };
    const service = new InterviewService(directory, vectors);
    const interview = createDraft(service);
    expect((await service.deleteInterview(interview.id)).interviews).toEqual([]);
    expect(vectors.deleteByInterview).toHaveBeenCalledWith(interview.id);
    expect(service.getInterviewSession(interview.id)).toBeNull();
    await expect(service.deleteInterview(interview.id)).rejects.toThrow("面试不存在或已删除");
    await service.close();
  });

  it("manually finishes a chat and refuses further model calls", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway(() => aiSuccess({ requestId: "chat-finish",
      model: { providerId: "openai-codex", modelId: "gpt-6-luna" }, text: interviewerJson("请介绍项目。"),
      finishReason: "stop", usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 } }));
    const service = new InterviewService(directory, vectorStore, undefined, undefined, new InterviewChatAgent(gateway));
    const interview = createDraft(service);
    await service.sendChat({ interviewId: interview.id, operationId: "start", kind: "start" });
    const ended = service.finishInterview(interview.id);
    expect(ended.interview.status).toBe("completed");
    await expect(service.sendChat({ interviewId: interview.id, operationId: "reply", kind: "reply",
      content: "继续回答" })).rejects.toThrow("不能进行对话");
    expect(gateway.generateRequests).toHaveLength(1);
    await service.close();
  });

  it("scores a completed interview separately, preserves failures, and versions a successful retry", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-score-"));
    cleanup.push(directory);
    let scoringAttempts = 0;
    const gateway = new RecordingModelGateway((request) => {
      if (request.metadata.purpose !== "score_interview") return aiSuccess({ requestId: "chat-for-score",
        model: { providerId: "openai-codex", modelId: "gpt-6-luna" }, text: interviewerJson("请说明一次性能问题的处理。"),
        finishReason: "stop", usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 } });
      scoringAttempts += 1;
      if (scoringAttempts === 1) return aiFailure({ code: "timeout", message: "评分超时", retryable: true });
      const message = request.messages[1]!.content;
      const turns = (JSON.parse(message) as { turns: Array<{ id: string; role: string }> }).turns;
      const answerId = turns.find((turn) => turn.role === "candidate")!.id;
      const evidence = [{ turnId: answerId, quote: "我先定位慢查询" }];
      return aiSuccess({ requestId: "score-retry", model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
        text: JSON.stringify({ dimensions: [
          { key: "technical", score: 30, reason: "解释了定位方法", evidence },
          { key: "practice", score: 35, reason: "有实际处理步骤", evidence },
          { key: "communication", score: 12, reason: "回答清楚", evidence },
        ] }), finishReason: "stop", usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } });
    });
    const service = new InterviewService(directory, vectorStore, undefined, undefined,
      new InterviewChatAgent(gateway), undefined, undefined, new InterviewScoreAgent(gateway));
    const interview = createDraft(service);
    await service.sendChat({ interviewId: interview.id, operationId: "score-chat-start", kind: "start" });
    await service.sendChat({ interviewId: interview.id, operationId: "score-chat-answer", kind: "reply",
      content: "我先定位慢查询，再增加索引。" });
    service.finishInterview(interview.id);
    const request = { interviewId: interview.id, settings: { reasoning: "medium" as const }, prompt: "本场评分规则" };
    const failed = await service.scoreInterview({ ...request, operationId: "score-failed" });
    expect(failed.interview.status).toBe("completed");
    expect(failed.scoreReports?.[0]).toMatchObject({ version: 1, status: "failed", error: expect.stringContaining("评分超时") });
    expect(failed.debugEvents?.at(-1)?.trace).toMatchObject({ actor: "score", status: "failed",
      messages: [{ kind: "system_prompt", content: "本场评分规则" }, { kind: "score_material" }],
      attempts: [{ error: { code: "timeout" } }] });
    const successful = await service.scoreInterview({ ...request, operationId: "score-retry" });
    expect(successful.scoreReports?.map((report) => report.version)).toEqual([2, 1]);
    expect(successful.scoreReports?.[0]).toMatchObject({ status: "succeeded", total: 77,
      coveredWeight: 100, prompt: "本场评分规则" });
    expect(successful.debugEvents?.at(-1)?.trace).toMatchObject({ actor: "score", status: "succeeded",
      outputText: expect.stringContaining('"dimensions"'),
      attempts: [{ usage: { inputTokens: 100, outputTokens: 50 } }] });
    await service.close();
    const reopened = new InterviewService(directory, vectorStore);
    expect(reopened.getInterviewSession(interview.id)?.scoreReports?.map((report) => report.version)).toEqual([2, 1]);
    expect(reopened.getInterviewSession(interview.id)?.debugEvents?.filter((event) => event.trace.actor === "score"))
      .toHaveLength(2);
    await reopened.close();
  });

  it("does not end an interview while a model response is still in flight", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const gateway = new RecordingModelGateway(async () => {
      await pending;
      return aiSuccess({ requestId: "chat-pending", model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
        text: interviewerJson("请介绍项目。"), finishReason: "stop", usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 } });
    });
    const service = new InterviewService(directory, vectorStore, undefined, undefined, new InterviewChatAgent(gateway));
    const interview = createDraft(service);
    const active = service.sendChat({ interviewId: interview.id, operationId: "start", kind: "start" });
    expect(() => service.finishInterview(interview.id)).toThrow("模型调用在进行");
    release();
    expect((await active).interview.status).toBe("interviewing");
    expect(service.finishInterview(interview.id).interview.status).toBe("completed");
    await service.close();
  });

  it("saves a failed model call for later inspection without creating a dialogue turn", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-service-"));
    cleanup.push(directory);
    const gateway = new RecordingModelGateway(() => aiFailure({ code: "timeout", message: "调用超时", retryable: true }));
    const service = new InterviewService(directory, vectorStore, undefined, undefined, new InterviewChatAgent(gateway));
    const interview = createDraft(service);
    await expect(service.sendChat({ interviewId: interview.id, operationId: "chat-timeout", kind: "start",
      settings: { model: { providerId: "openai-codex", modelId: "gpt-6-luna" },
        reasoning: "medium" } })).rejects.toThrow("调用超时");
    const failed = service.getInterviewSession(interview.id);
    expect(failed?.turns).toHaveLength(0);
    expect(failed?.debugEvents).toMatchObject([{ trace: { status: "failed", operationId: "chat-timeout",
      messages: [{ kind: "system_prompt" }, { kind: "job_description" }, { kind: "resume" }],
      attempts: [{ error: { code: "timeout" } }] } }]);
    await service.close();
    const reopened = new InterviewService(directory, vectorStore);
    expect(reopened.getInterviewSession(interview.id)?.debugEvents).toHaveLength(1);
    await reopened.close();
  });
});
