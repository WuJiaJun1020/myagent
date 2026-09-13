import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "framer-motion";
import { Bot, Braces, FileDiff, Lightbulb, MessageCircle, ShieldCheck, TerminalSquare } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { AgentMessage } from "../../../shared/contracts/agent-events";
import type { SnapshotTimelineEntry } from "../../../shared/contracts/agent-session";
import type { ToolCallState } from "../../lib/event-reducer";
import { useAgentStore } from "../../stores/agent-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useSessionStore } from "../../stores/session-store";
import { useUiStore, type SessionChatScroll } from "../../stores/ui-store";
import { TaskActivityGroup, type TaskActivityItem } from "../agent/TaskActivityGroup";
import { ToolCallCard } from "../tools/ToolCallCard";
import { MessageItem } from "./MessageItem";

export type TaskTimelineRow =
  | { type: "message"; id: string; hideThinking?: boolean }
  | {
      type: "task-activity";
      id: string;
      items: TaskActivityItem[];
      startedAt: number;
      endedAt?: number;
      settled: boolean;
    }
  | { type: "tool"; id: string };

type BuildTaskRowsOptions = {
  timeline: SnapshotTimelineEntry[];
  messagesById: Record<string, AgentMessage>;
  toolCallsById: Record<string, ToolCallState>;
  busy: boolean;
  runTiming: { startedAt: number; settledAt?: number } | null;
};

const TIMELINE_TOP_OFFSET = 30;

type VirtualRowPosition = {
  index: number;
  start: number;
  size: number;
};

type TrackedSessionChatScroll = SessionChatScroll & { sessionId: string | null };

function storedChatScroll(scroll: TrackedSessionChatScroll): SessionChatScroll {
  return {
    scrollTop: scroll.scrollTop,
    pinned: scroll.pinned,
    ...(scroll.anchorId ? { anchorId: scroll.anchorId, anchorOffset: scroll.anchorOffset } : {}),
  };
}

export function captureChatScroll(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  rows: TaskTimelineRow[],
  virtualRows: VirtualRowPosition[],
): SessionChatScroll {
  const pinned = scrollHeight - scrollTop - clientHeight < 120;
  const anchor = virtualRows.find((item) => item.start + TIMELINE_TOP_OFFSET + item.size > scrollTop)
    ?? virtualRows[0];
  const anchorId = anchor ? rows[anchor.index]?.id : undefined;
  return {
    scrollTop,
    pinned,
    ...(anchorId ? {
      anchorId,
      anchorOffset: scrollTop - anchor.start - TIMELINE_TOP_OFFSET,
    } : {}),
  };
}

function hasText(message: AgentMessage): boolean {
  return message.content.some((block) => block.type === "text" && block.text.trim().length > 0);
}

function inferredEntryEnd(
  entry: SnapshotTimelineEntry,
  messagesById: Record<string, AgentMessage>,
  toolCallsById: Record<string, ToolCallState>,
): number {
  if (entry.type === "message") return messagesById[entry.id]?.timestamp ?? 0;
  const tool = toolCallsById[entry.id];
  return tool?.completedAt ?? tool?.startedAt ?? 0;
}

export function buildTaskRows({
  timeline,
  messagesById,
  toolCallsById,
  busy,
  runTiming,
}: BuildTaskRowsOptions): TaskTimelineRow[] {
  const rows: TaskTimelineRow[] = [];

  for (let index = 0; index < timeline.length;) {
    const entry = timeline[index];
    const message = entry.type === "message" ? messagesById[entry.id] : undefined;
    if (!message || message.role !== "user") {
      rows.push(entry);
      index += 1;
      continue;
    }

    rows.push({ type: "message", id: entry.id });
    const segmentStart = index + 1;
    let segmentEnd = segmentStart;
    while (segmentEnd < timeline.length) {
      const candidate = timeline[segmentEnd];
      const candidateMessage = candidate.type === "message" ? messagesById[candidate.id] : undefined;
      if (candidateMessage?.role === "user") break;
      segmentEnd += 1;
    }

    const segment = timeline.slice(segmentStart, segmentEnd);
    let finalAssistantId: string | undefined;
    for (let cursor = segment.length - 1; cursor >= 0; cursor -= 1) {
      const candidate = segment[cursor];
      if (candidate.type !== "message") continue;
      const candidateMessage = messagesById[candidate.id];
      if (candidateMessage?.role === "assistant" && (hasText(candidateMessage) || candidateMessage.errorMessage)) {
        finalAssistantId = candidate.id;
        break;
      }
    }

    const activityItems: TaskActivityItem[] = [];
    for (const candidate of segment) {
      if (candidate.type === "tool") {
        activityItems.push({ type: "tool", toolId: candidate.id });
        continue;
      }
      const candidateMessage = messagesById[candidate.id];
      if (!candidateMessage || candidateMessage.role !== "assistant") continue;
      if (candidate.id === finalAssistantId) {
        if (candidateMessage.content.some((block) => block.type === "thinking")) {
          activityItems.push({ type: "final-thinking", messageId: candidate.id });
        }
      } else if (candidateMessage.content.length > 0 || candidateMessage.streaming) {
        activityItems.push({ type: "assistant", messageId: candidate.id });
      }
    }

    const isLatestTask = segmentEnd === timeline.length;
    const settled = !(isLatestTask && busy);
    const useRuntimeTiming = isLatestTask
      && runTiming !== null
      && runTiming.startedAt >= message.timestamp - 5_000;
    const startedAt = useRuntimeTiming ? runTiming?.startedAt ?? message.timestamp : message.timestamp;
    const inferredEnd = segment.reduce(
      (latest, candidate) => Math.max(latest, inferredEntryEnd(candidate, messagesById, toolCallsById)),
      message.timestamp,
    );
    const runtimeSettledAt = useRuntimeTiming ? runTiming?.settledAt : undefined;
    const endedAt = settled ? runtimeSettledAt ?? inferredEnd : undefined;

    rows.push({
      type: "task-activity",
      id: "activity:" + entry.id,
      items: activityItems,
      startedAt,
      endedAt,
      settled,
    });
    if (finalAssistantId) rows.push({ type: "message", id: finalAssistantId, hideThinking: true });
    index = segmentEnd;
  }

  return rows;
}

export function shouldShowEmptyChatState(
  rowCount: number,
  sessionMutation: string | null,
  sessionMessageCount: number,
): boolean {
  return rowCount === 0 && sessionMutation === null && sessionMessageCount === 0;
}

export function ChatPanel() {
  const timelineOrder = useAgentStore((state) => state.timelineOrder);
  const messagesById = useAgentStore((state) => state.messagesById);
  const toolCallsById = useAgentStore((state) => state.toolCallsById);
  const activityRevision = useAgentStore((state) => state.activityRevision);
  const activeSessionId = useAgentStore((state) => state.activeSessionId);
  const busy = useAgentStore((state) => state.busy);
  const runTiming = useAgentStore((state) => state.runTiming);
  const animationEnabled = useSettingsStore((state) => state.animationEnabled);
  const chatMode = useSessionStore((state) => state.session?.mode === "chat");
  const sessionMessageCount = useSessionStore((state) => state.session?.messageCount ?? 0);
  const sessionMutation = useSessionStore((state) => state.mutation);
  const pendingSessionId = useSessionStore((state) => state.pendingSessionId);
  const chatFollowRequest = useUiStore((state) => state.chatFollowRequest);
  const setSessionChatScroll = useUiStore((state) => state.setSessionChatScroll);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stayPinnedRef = useRef(true);
  const presentedSessionRef = useRef<string | null>(null);
  const restoringSessionRef = useRef<string | null>(null);
  const scrollSaveFrameRef = useRef(0);
  const currentScrollRef = useRef<TrackedSessionChatScroll>({
    sessionId: null,
    scrollTop: 0,
    pinned: true,
  });
  const livePresentation = useMemo(() => ({
    sessionId: activeSessionId,
    timeline: timelineOrder,
    messagesById,
    toolCallsById,
    busy,
    runTiming,
  }), [activeSessionId, timelineOrder, messagesById, toolCallsById, busy, runTiming]);
  const settledPresentationRef = useRef(livePresentation);
  const switchingSession = pendingSessionId !== null;
  // Cached session metadata and partial runtime events can both arrive before
  // switchSession's authoritative snapshot. Keep the previous frame for the
  // entire RPC instead of treating an early session id change as readiness.
  if (!switchingSession) settledPresentationRef.current = livePresentation;
  const presentation = switchingSession ? settledPresentationRef.current : livePresentation;
  const rows = useMemo(
    () => buildTaskRows({
      timeline: presentation.timeline,
      messagesById: presentation.messagesById,
      toolCallsById: presentation.toolCallsById,
      busy: presentation.busy,
      runTiming: presentation.runTiming,
    }),
    [presentation.timeline, presentation.messagesById, presentation.toolCallsById, presentation.busy, presentation.runTiming],
  );
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rows.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: (index) => rows[index]?.type === "message" ? 170 : rows[index]?.type === "task-activity" ? 54 : 76,
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 6,
  });
  const showEmptyState = shouldShowEmptyChatState(rows.length, sessionMutation, sessionMessageCount);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const sessionId = presentation.sessionId;
    if (!viewport || !sessionId) return;

    presentedSessionRef.current = sessionId;
    const saved = useUiStore.getState().sessionChatScroll[sessionId];
    const pinned = saved?.pinned ?? true;
    stayPinnedRef.current = pinned;
    restoringSessionRef.current = sessionId;
    currentScrollRef.current = {
      sessionId,
      scrollTop: saved?.scrollTop ?? 0,
      pinned,
      anchorId: saved?.anchorId,
      anchorOffset: saved?.anchorOffset,
    };

    const anchorIndex = saved?.anchorId
      ? rows.findIndex((row) => row.id === saved.anchorId)
      : -1;
    if (!pinned && anchorIndex >= 0) rowVirtualizer.scrollToIndex(anchorIndex, { align: "start" });

    let frame = 0;
    let attempts = 0;
    let stableFrames = 0;
    let previousTarget = Number.NaN;
    const restore = () => {
      if (presentedSessionRef.current !== sessionId) return;
      const maximumScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      let target = saved?.scrollTop ?? 0;
      if (pinned) {
        target = maximumScrollTop;
      } else if (anchorIndex >= 0) {
        const offset = rowVirtualizer.getOffsetForIndex(anchorIndex, "start")?.[0];
        if (offset !== undefined) target = offset + TIMELINE_TOP_OFFSET + (saved?.anchorOffset ?? 0);
      }
      target = Math.max(0, Math.min(target, maximumScrollTop));
      viewport.scrollTo({ top: target, behavior: "auto" });
      currentScrollRef.current = {
        sessionId,
        scrollTop: target,
        pinned,
        anchorId: saved?.anchorId,
        anchorOffset: saved?.anchorOffset,
      };

      stableFrames = Number.isFinite(previousTarget) && Math.abs(previousTarget - target) < 0.5
        ? stableFrames + 1
        : 0;
      previousTarget = target;
      attempts += 1;
      if (attempts < 8 && stableFrames < 2) {
        frame = window.requestAnimationFrame(restore);
      } else if (restoringSessionRef.current === sessionId) {
        restoringSessionRef.current = null;
      }
    };
    frame = window.requestAnimationFrame(restore);
    return () => {
      window.cancelAnimationFrame(frame);
      if (restoringSessionRef.current === sessionId) restoringSessionRef.current = null;
    };
  }, [presentation.sessionId]);

  useEffect(() => () => {
    window.cancelAnimationFrame(scrollSaveFrameRef.current);
    const current = currentScrollRef.current;
    if (current.sessionId) setSessionChatScroll(current.sessionId, storedChatScroll(current));
  }, [setSessionChatScroll]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !stayPinnedRef.current) return;
    let scrollFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      scrollFrame = window.requestAnimationFrame(() => {
        if (stayPinnedRef.current) viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(scrollFrame);
    };
  }, [activityRevision]);

  useEffect(() => {
    if (chatFollowRequest === 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    stayPinnedRef.current = true;
    let scrollFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      scrollFrame = window.requestAnimationFrame(() => {
        if (stayPinnedRef.current) viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(scrollFrame);
    };
  }, [chatFollowRequest]);

  return (
    <section
      className="activity-stream"
      ref={viewportRef}
      onScroll={(event) => {
        const viewport = event.currentTarget;
        const sessionId = presentation.sessionId;
        if (!sessionId || restoringSessionRef.current === sessionId) return;
        const scroll = captureChatScroll(
          viewport.scrollTop,
          viewport.scrollHeight,
          viewport.clientHeight,
          rows,
          rowVirtualizer.getVirtualItems(),
        );
        stayPinnedRef.current = scroll.pinned;
        currentScrollRef.current = { sessionId, ...scroll };
        if (scrollSaveFrameRef.current !== 0) return;
        scrollSaveFrameRef.current = window.requestAnimationFrame(() => {
          scrollSaveFrameRef.current = 0;
          const current = currentScrollRef.current;
          if (current.sessionId !== sessionId) return;
          setSessionChatScroll(sessionId, storedChatScroll(current));
        });
      }}
    >
      {rows.length === 0 ? showEmptyState ? (
        <motion.div
          className="empty-state"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: animationEnabled ? 0.24 : 0 }}
        >
          <div className="empty-orbit"><span /><div><Bot size={30} /></div></div>
          <p className="eyebrow">{chatMode ? "PLAIN AI CHAT" : "LOCAL AGENT WORKSPACE"}</p>
          <h1>{chatMode ? "开始一段对话" : "从一个清晰的任务开始"}</h1>
          <p className="empty-description">{chatMode ? "当前会话不会访问项目文件或调用工具，适合讨论、问答和思路整理。" : "Pi 可以理解当前工作区、调用工具，并把执行过程持续呈现在这里。"}</p>
          <div className="capability-list" aria-label="当前能力">
            {chatMode ? (
              <>
                <span><MessageCircle size={14} />自然对话</span>
                <span><Lightbulb size={14} />分析与构思</span>
                <span><ShieldCheck size={14} />无本地工具</span>
              </>
            ) : (
              <>
                <span><Braces size={14} />代码任务</span>
                <span><TerminalSquare size={14} />工具调用</span>
                <span><FileDiff size={14} />代码 Diff</span>
              </>
            )}
          </div>
        </motion.div>
      ) : null : (
        <div className="timeline-content virtualized" style={{ height: rowVirtualizer.getTotalSize() + 74 }}>
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const row = rows[virtualItem.index];
            if (!row) return null;
            let content = null;
            if (row.type === "message") {
              const message = presentation.messagesById[row.id];
              content = message ? <MessageItem message={message} hideThinking={row.hideThinking} /> : null;
            } else if (row.type === "task-activity") {
              content = (
                <TaskActivityGroup
                  items={row.items}
                  messagesById={presentation.messagesById}
                  toolCallsById={presentation.toolCallsById}
                  startedAt={row.startedAt}
                  endedAt={row.endedAt}
                  settled={row.settled}
                />
              );
            } else {
              const tool = presentation.toolCallsById[row.id];
              content = tool ? <ToolCallCard tool={tool} /> : null;
            }
            return (
              <div
                className="timeline-virtual-row"
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={rowVirtualizer.measureElement}
                style={{ transform: "translateY(" + (virtualItem.start + 30) + "px)" }}
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
