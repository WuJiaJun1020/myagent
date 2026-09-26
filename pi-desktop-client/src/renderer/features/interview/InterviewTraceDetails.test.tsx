import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InterviewCallTrace } from "../../../shared/contracts/interview";
import { InterviewTraceDetails } from "./InterviewTraceDetails";

function trace(attempt: Partial<InterviewCallTrace["attempts"][number]>): InterviewCallTrace {
  return { actor: "candidate", operationId: "op", status: "failed", startedAt: "2026-09-25T00:00:00Z",
    finishedAt: "2026-09-25T00:00:01Z", requestedModel: { providerId: "test", modelId: "test" },
    reasoning: "default", timeoutMs: 1000, messages: [], attempts: [{ providerId: "test", modelId: "test",
      startedAt: "2026-09-25T00:00:00Z", finishedAt: "2026-09-25T00:00:01Z", ...attempt }] };
}

describe("InterviewTraceDetails diagnostics", () => {
  it("groups interviewer history and the current answer without altering raw message bodies", () => {
    const value = trace({});
    value.actor = "interviewer";
    value.messages = [
      { kind: "system_prompt", role: "system", content: "SYSTEM_MARKER" },
      { kind: "history", role: "assistant", content: '{"message":"QUESTION_1"}' },
      { kind: "history", role: "user", content: "ANSWER_1" },
      { kind: "history", role: "assistant", content: '{"message":"QUESTION_2"}' },
      { kind: "candidate_message", role: "user", content: "CURRENT_ANSWER" },
      { kind: "topic_control", role: "user", content: "TOPIC_MARKER" },
    ];
    const html = renderToStaticMarkup(<InterviewTraceDetails trace={value} />);
    expect(html).toContain('<details class="interview-call-trace-history"><summary>');
    expect(html.match(/<strong>历史对话<\/strong>/g)).toHaveLength(1);
    const historyMarkup = html.match(/<details class="interview-call-trace-history">[\s\S]*?<\/details>/)?.[0];
    expect(historyMarkup).toContain("CURRENT_ANSWER");
    expect(historyMarkup).not.toContain("TOPIC_MARKER");
    expect(historyMarkup?.match(/<pre>/g)).toHaveLength(4);
    expect(historyMarkup).toContain("界面标识 · 请求第 2 条　|　请求角色（消息元数据）：assistant");
    expect(historyMarkup).toContain("界面标识 · 请求第 5 条　|　请求角色（消息元数据）：user");
    expect(historyMarkup).not.toContain("第 1 轮");
    expect(html).toContain("界面分组 · 4 条原始消息");
    for (const marker of ["QUESTION_1", "ANSWER_1", "QUESTION_2", "CURRENT_ANSWER", "TOPIC_MARKER"]) {
      expect(html).toContain(marker);
    }
    expect(html.indexOf("QUESTION_1")).toBeLessThan(html.indexOf("ANSWER_1"));
    expect(html.indexOf("ANSWER_1")).toBeLessThan(html.indexOf("QUESTION_2"));
    expect(html.indexOf("QUESTION_2")).toBeLessThan(html.indexOf("CURRENT_ANSWER"));
    expect(html.indexOf("CURRENT_ANSWER")).toBeLessThan(html.indexOf("TOPIC_MARKER"));
    expect(html).not.toContain("<strong>候选人本轮回答</strong>");
    expect(html).toContain("<strong>面试进度、考察记录与当前任务（程序消息）</strong>");
  });

  it("uses the same collapsed history layout for candidate and director calls", () => {
    const candidate = trace({});
    candidate.messages = [
      { kind: "system_prompt", role: "system", content: "SYSTEM" },
      { kind: "history", role: "user", content: "QUESTION" },
      { kind: "history", role: "assistant", content: '{"answer":"CANDIDATE_JSON"}' },
      { kind: "history", role: "user", content: "NEXT_QUESTION" },
      { kind: "candidate_control", role: "user", content: "MODE_CONTROL" },
    ];
    const candidateHtml = renderToStaticMarkup(<InterviewTraceDetails trace={candidate} />);
    const candidateHistory = candidateHtml.match(/<details class="interview-call-trace-history">[\s\S]*?<\/details>/)?.[0];
    expect(candidateHistory?.match(/<pre>/g)).toHaveLength(3);
    expect(candidateHistory).toContain("CANDIDATE_JSON");
    expect(candidateHistory).toContain("NEXT_QUESTION");
    expect(candidateHistory).not.toContain("MODE_CONTROL");
    expect(candidateHtml).toContain("界面分组 · 3 条原始消息");

    const director: InterviewCallTrace = { ...candidate, actor: "director", messages: [
      { kind: "system_prompt", role: "system", content: "SYSTEM" },
      { kind: "history", role: "user", content: "第 1 轮\n面试官：RAW_QUESTION\n候选人：RAW_ANSWER" },
      { kind: "instruction", role: "user", content: "DRAFT_CONTROL" },
    ] };
    const directorHtml = renderToStaticMarkup(<InterviewTraceDetails trace={director} />);
    const directorHistory = directorHtml.match(/<details class="interview-call-trace-history">[\s\S]*?<\/details>/)?.[0];
    expect(directorHistory?.match(/<pre>/g)).toHaveLength(1);
    expect(directorHistory).toContain("RAW_QUESTION");
    expect(directorHistory).toContain("RAW_ANSWER");
    expect(directorHistory).not.toContain("DRAFT_CONTROL");
    expect(directorHtml).toContain("界面分组 · 1 条原始消息");
  });

  it("collapses stable material and history while keeping later controls visible", () => {
    const value = trace({});
    value.messages = [
      { kind: "system_prompt", role: "system", content: "SYSTEM_MARKER" },
      { kind: "job_description", role: "user", content: "JOB_MARKER" },
      { kind: "resume", role: "user", content: "RESUME_MARKER" },
      { kind: "history", role: "user", content: "HISTORY_MARKER" },
      { kind: "instruction", role: "user", content: "INSTRUCTION_MARKER" },
    ];
    const html = renderToStaticMarkup(<InterviewTraceDetails trace={value} />);
    expect(html.match(/class="interview-call-trace-static-message"/g)).toHaveLength(3);
    for (const marker of ["SYSTEM_MARKER", "JOB_MARKER", "RESUME_MARKER"]) {
      expect(html).toMatch(new RegExp(`<details class="interview-call-trace-static-message"><summary>[^<]*(?:<[^>]+>[^<]*)*<\\/summary><pre>${marker}<\\/pre><\\/details>`));
    }
    expect(html).toContain('<details class="interview-call-trace-history"><summary>');
    expect(html).toContain("<pre>HISTORY_MARKER</pre>");
    expect(html).toMatch(/<header>.*?<\/header><pre>INSTRUCTION_MARKER<\/pre>/);
  });

  it("puts actionable timeout evidence before prompts and distinguishes configured retries from actual retries", () => {
    const value = trace({ error: { code: "timeout", message: "Timed out", diagnosticCode: "LOCAL_DEADLINE", retryable: true },
      requestId: "early-id", diagnostics: { requestId: "early-id", phase: "runtime_call", elapsedMs: 180000,
        timeline: [{ phase: "settings", elapsedMs: 0 }, { phase: "runtime_call", elapsedMs: 20 }],
        outcome: "failed", timeoutSource: "local_deadline", runtimeResponseReceived: false,
        totalTimeoutMs: 180000, runtimeTimeoutMs: 60000, providerMaxRetries: 2 } });
    value.messages.push({ kind: "system_prompt", role: "system", content: "LONG_PROMPT_MARKER" });
    const html = renderToStaticMarkup(<InterviewTraceDetails trace={value} />);
    for (const text of ["本地总时限到期", "本地调用 ID：early-id", "180 秒", "60 秒", "实际次数未提供",
      "179.980 秒", "不代表底层未收到任何数据", "不表示已自动重试", "不会触发 JSON 格式修复重试"]) expect(html).toContain(text);
    expect(html.indexOf("失败定位")).toBeLessThan(html.indexOf("LONG_PROMPT_MARKER"));
  });

  it("does not infer a timeout source from elapsed time on legacy traces", () => {
    const html = renderToStaticMarkup(<InterviewTraceDetails trace={trace({ error: { code: "timeout", message: "Timed out" } })} />);
    expect(html).toContain("未保存超时来源");
    expect(html).toContain("未采集详细时间线");
    expect(html).not.toContain("本地总时限到期");
  });

  it("explains upstream timeout and transport evidence separately", () => {
    const upstream = renderToStaticMarkup(<InterviewTraceDetails trace={trace({ error: { code: "timeout",
      message: "Timed out", diagnosticCode: "UPSTREAM_TIMEOUT" } })} />);
    expect(upstream).toContain("不是本地总时限触发");
    const dns = renderToStaticMarkup(<InterviewTraceDetails trace={trace({ error: { code: "provider_unavailable",
      message: "Failed", diagnosticCode: "DNS_FAILURE" } })} />);
    expect(dns).toContain("域名解析失败");
    expect(dns).toContain("检查 DNS");
  });

  it("shows validation, metadata and escaped raw text even when the attempt failed in the gateway", () => {
    const html = renderToStaticMarkup(<InterviewTraceDetails trace={trace({
      error: { code: "invalid_provider_response", message: "Invalid response", stage: "json_schema",
        validationIssues: ["$.answer: 缺少必填字段"] }, requestId: "local-123", finishReason: "stop",
      providerStopReason: "stop", usage: { inputTokens: 20, outputTokens: 10, durationMs: 1000 },
      outputText: '<script>alert("model")</script>',
    })} />);
    for (const text of ["JSON 字段结构校验", "$.answer: 缺少必填字段", "local-123", "网关耗时", "输入 20 / 输出 10", "失败调用的模型原文"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('<script>alert');
  });

  it("distinguishes empty returned text from missing diagnostics on legacy failures", () => {
    const error = { code: "invalid_provider_response", message: "Invalid response" };
    const empty = renderToStaticMarkup(<InterviewTraceDetails trace={trace({ error, outputText: "" })} />);
    expect(empty).toContain("模型返回了空文本");
    const legacy = renderToStaticMarkup(<InterviewTraceDetails trace={trace({ error })} />);
    expect(legacy).toContain("旧记录未保存");
    expect(legacy).toContain("未记录模型原文");
    expect(legacy).not.toContain("模型返回了空文本");
  });

  it("shows transport status and retry timing", () => {
    const html = renderToStaticMarkup(<InterviewTraceDetails trace={trace({ error: {
      code: "rate_limited", message: "Rate limited", stage: "provider", statusCode: 429,
      diagnosticCode: "CONNECTION_RESET", retryable: true, retryAfterMs: 2000,
    } })} />);
    expect(html).toContain("模型服务或网络请求");
    expect(html).toContain("HTTP 429");
    expect(html).toContain("CONNECTION_RESET");
    expect(html).toContain("建议等待 2000 毫秒");
  });
});
