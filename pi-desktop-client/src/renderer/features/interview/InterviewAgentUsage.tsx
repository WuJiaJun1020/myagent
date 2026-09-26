import { CircleGauge } from "lucide-react";
import type { InterviewChatModelInfo, InterviewSession } from "../../../shared/contracts/interview";
import { readInterviewCacheUsage, readInterviewContextUsage } from "./interview-context-usage";

type AgentActor = "interviewer" | "candidate" | "director" | "score";

export function InterviewAgentUsage({ session, actor, models }: {
  session: InterviewSession;
  actor: AgentActor;
  models: InterviewChatModelInfo["availableModels"];
}) {
  const input = readInterviewContextUsage(session, models, actor);
  const cache = readInterviewCacheUsage(session, actor);
  const contextPercent = input.latestContextPercent === null
    ? 0 : Math.min(100, Math.max(0, input.latestContextPercent));
  const cachePercent = cache.cacheHitRate === null ? null : cache.cacheHitRate * 100;
  const inputDescription = input.totalInputTokens === null
    ? "本场尚无模型返回的输入 token 计数；不会估算。"
    : `本场 ${input.measuredInputAttempts} 次调用已记录输入 ${input.totalInputTokens.toLocaleString()} tokens；${input.partialInputAttempts} 次调用只返回部分输入分量，${input.unmeasuredInputAttempts} 次没有输入计数。含格式修复和未采用的草稿，跨模型也计入。`;
  const latestDescription = input.latestInputTokens === null
    ? "尚无最近一次成功调用的实际输入 token 记录。"
    : `最近一次成功调用的完整输入 ${input.latestInputTokens.toLocaleString()} tokens，包含该 Agent 的系统提示词、资料、此前对话与本轮控制。${input.latestContextWindowTokens
      ? `对应模型窗口 ${input.latestContextWindowTokens.toLocaleString()} tokens。` : "对应模型窗口未知。"}`;
  const cacheDescription = cache.cacheHitRate === null
    ? "本场尚无可计算的缓存用量；缺少输入或缓存读取计数的调用不会当作 0%。"
    : `本场累计：缓存读取 ${cache.cachedInputTokens!.toLocaleString()} / 已统计输入 ${cache.cacheTotalInputTokens!.toLocaleString()} tokens；覆盖 ${cache.measuredAttempts} 次调用，另有 ${cache.unmeasuredAttempts} 次缺少完整计数。含格式修复和未采用的草稿。`;
  return <div className="interview-agent-usage" aria-label="本场累计输入、最新一轮完整上下文与缓存命中率">
    <div className="interview-agent-usage-row" title={inputDescription}>
      <span>本场累计输入</span><strong>{input.totalInputTokens === null ? "待获取" : input.totalInputTokens.toLocaleString()}
        <em> tokens</em></strong>
    </div>
    <div className="interview-agent-usage-row" title={latestDescription}>
      <span><CircleGauge size={13} />最新一轮完整上下文</span>
      <strong>{input.latestInputTokens === null ? "待获取" : input.latestInputTokens.toLocaleString()}
        <em> / {input.latestContextWindowTokens ? input.latestContextWindowTokens.toLocaleString() : "窗口未知"}</em></strong>
    </div>
    <div className="interview-agent-usage-bar" role="progressbar" aria-label="最新一轮上下文占用比例" aria-valuemin={0}
      aria-valuemax={100} aria-valuenow={input.latestContextPercent === null ? undefined : contextPercent}>
      <span style={{ width: `${contextPercent}%` }} /></div>
    <div className="interview-agent-usage-row" title={cacheDescription}>
      <span>本场缓存命中率</span><strong>{cachePercent === null ? "未提供" : `${cachePercent.toFixed(1)}%`}</strong>
    </div>
    {(input.partialInputAttempts > 0 || input.unmeasuredInputAttempts > 0 || cache.unmeasuredAttempts > 0)
      && <small>{[input.unmeasuredInputAttempts > 0 && `${input.unmeasuredInputAttempts} 次缺少输入计数`,
        input.partialInputAttempts > 0 && `${input.partialInputAttempts} 次输入计数不完整`,
        cache.unmeasuredAttempts > 0 && `${cache.unmeasuredAttempts} 次缺少缓存计数`].filter(Boolean).join(" · ")}</small>}
  </div>;
}

export function InterviewUsageSummary({ session, models }: {
  session: InterviewSession; models: InterviewChatModelInfo["availableModels"];
}) {
  const input = readInterviewContextUsage(session, models);
  const cache = readInterviewCacheUsage(session);
  const description = cache.cacheHitRate === null ? "本场尚无可计算的缓存用量。"
    : `全部 Agent 共 ${cache.measuredAttempts} 次有完整计数的模型调用：缓存读取 ${cache.cachedInputTokens!.toLocaleString()} / 输入总计 ${cache.cacheTotalInputTokens!.toLocaleString()} tokens。${cache.unmeasuredAttempts} 次调用缺少完整计数，未纳入缓存比例。`;
  return <div className="interview-agent-usage" aria-label="整场面试模型用量" title={description}>
    <div className="interview-agent-usage-row"><span>整场累计输入</span>
      <strong>{input.totalInputTokens === null ? "待获取" : input.totalInputTokens.toLocaleString()}<em> tokens</em></strong></div>
    <div className="interview-agent-usage-row"><span>整场缓存命中率</span>
      <strong>{cache.cacheHitRate === null ? "未提供" : `${(cache.cacheHitRate * 100).toFixed(1)}%`}</strong></div>
    <small>输入已统计 {input.measuredInputAttempts} 次调用
      {input.unmeasuredInputAttempts > 0 && ` · ${input.unmeasuredInputAttempts} 次缺少输入计数`}
      {input.partialInputAttempts > 0 && ` · ${input.partialInputAttempts} 次输入计数不完整`}
      {cache.unmeasuredAttempts > 0 && ` · ${cache.unmeasuredAttempts} 次缺少缓存计数`}</small>
  </div>;
}
