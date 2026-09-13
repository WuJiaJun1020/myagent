import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  CopyPlus,
  Download,
  FileDown,
  GitBranch,
  GitFork,
  LoaderCircle,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionOverview, SessionTreeNode } from "../../../shared/contracts/agent-session";
import { summarizePromptCache } from "../../lib/session-usage";
import { agentGateway } from "../../services/agent-gateway";
import { useAgentStore } from "../../stores/agent-store";
import { useSessionStore } from "../../stores/session-store";
import { useUiStore } from "../../stores/ui-store";

export type SessionTreeRow = {
  node: SessionTreeNode;
  /** Visual branch indentation; linear message chains stay on the same level. */
  depth: number;
  /** Actual tree level exposed to assistive technology. */
  level: number;
};

const MAX_VISIBLE_TREE_DEPTH = 6;

export function flattenSessionTree(nodes: SessionTreeNode[]): SessionTreeRow[] {
  type PendingNode = {
    node: SessionTreeNode;
    depth: number;
    level: number;
    parentBranched: boolean;
  };
  const rows: SessionTreeRow[] = [];
  const stack: PendingNode[] = [];
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    stack.push({ node: nodes[index], depth: 0, level: 1, parentBranched: nodes.length > 1 });
  }

  while (stack.length > 0) {
    const current = stack.pop()!;
    rows.push({
      node: current.node,
      depth: Math.min(current.depth, MAX_VISIBLE_TREE_DEPTH),
      level: current.level,
    });

    const branchesHere = current.node.children.length > 1;
    const childDepth = branchesHere
      ? current.depth + 1
      : current.parentBranched && current.depth > 0
        ? current.depth + 1
        : current.depth;
    for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
      stack.push({
        node: current.node.children[index],
        depth: childDepth,
        level: current.level + 1,
        parentBranched: branchesHere,
      });
    }
  }

  return rows;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatCost(value: number): string {
  return value > 0 ? `$${value.toFixed(4)}` : "—";
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function SessionOverviewDialog() {
  const open = useUiStore((state) => state.sessionOverviewOpen);
  const setOpen = useUiStore((state) => state.setSessionOverviewOpen);
  const session = useSessionStore((state) => state.session);
  const mutation = useSessionStore((state) => state.mutation);
  const storeError = useSessionStore((state) => state.error);
  const cloneSession = useSessionStore((state) => state.cloneSession);
  const forkSession = useSessionStore((state) => state.forkSession);
  const navigateSessionTree = useSessionStore((state) => state.navigateSessionTree);
  const importSession = useSessionStore((state) => state.importSession);
  const busy = useAgentStore((state) => state.busy);
  const [overview, setOverview] = useState<SessionOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedForkId, setSelectedForkId] = useState("");
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [navigationMode, setNavigationMode] = useState<"none" | "summary" | "custom">("none");
  const [summaryInstructions, setSummaryInstructions] = useState("");

  const refresh = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setLocalError(null);
    try {
      const next = await agentGateway.getSessionOverview();
      setOverview(next);
      setSelectedForkId((current) => next.forkTargets.some((target) => target.entryId === current)
        ? current
        : (next.forkTargets.at(-1)?.entryId ?? ""));
    } catch (reason) {
      setLocalError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    void refresh();
  }, [refresh, session?.id]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  const treeRows = useMemo(() => flattenSessionTree(overview?.tree ?? []), [overview?.tree]);
  const promptCache = overview ? summarizePromptCache(overview.stats.tokens) : null;
  const controlsDisabled = busy || mutation !== null;
  const visibleError = localError ?? storeError;

  async function exportSession(format: "html" | "jsonl"): Promise<void> {
    setLocalError(null);
    try {
      const path = format === "html"
        ? await agentGateway.exportCurrentSessionHtml()
        : await agentGateway.exportCurrentSessionJsonl();
      if (path) setExportPath(path);
    } catch (reason) {
      setLocalError(errorMessage(reason));
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <motion.section
            className="session-overview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-overview-title"
            initial={{ opacity: 0, scale: .98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: .98, y: 8 }}
          >
            <header>
              <div>
                <span><GitBranch size={16} /></span>
                <div><small>PI SESSION</small><h2 id="session-overview-title">会话概览</h2></div>
              </div>
              <button type="button" aria-label="关闭会话概览" onClick={() => setOpen(false)}><X size={16} /></button>
            </header>

            <div className="session-overview-content">
              <div className="session-overview-toolbar">
                <span>{session?.name || "当前会话"}</span>
                <button type="button" onClick={() => void refresh()} disabled={loading || controlsDisabled} title="刷新会话数据">
                  <RefreshCw className={loading ? "spin" : ""} size={14} />刷新
                </button>
              </div>

              {visibleError && <div className="session-overview-error" role="alert">{visibleError}</div>}
              {exportPath && <div className="session-overview-success">已导出到：{exportPath}</div>}

              {overview ? (
                <>
                  <section className="session-overview-section">
                    <div className="session-overview-section-title"><BarChart3 size={15} /><strong>运行统计</strong></div>
                    <div className="session-stat-grid">
                      <div><small>消息</small><strong>{formatNumber(overview.stats.totalMessages)}</strong><span>用户 {overview.stats.userMessages} · Pi {overview.stats.assistantMessages}</span></div>
                      <div><small>工具调用</small><strong>{formatNumber(overview.stats.toolCalls)}</strong><span>结果 {overview.stats.toolResults}</span></div>
                      <div><small>累计 Tokens</small><strong>{formatNumber(overview.stats.tokens.total)}</strong><span>输入 {formatNumber(overview.stats.tokens.input)} · 输出 {formatNumber(overview.stats.tokens.output)}</span></div>
                      <div title="缓存读取 Token ÷ 累计 Prompt Token">
                        <small>缓存命中率</small>
                        <strong>{promptCache?.reported ? `${promptCache.hitRate?.toFixed(1)}%` : "未报告"}</strong>
                        <span>{promptCache?.reported
                          ? `读取 ${formatNumber(overview.stats.tokens.cacheRead)} · 写入 ${formatNumber(overview.stats.tokens.cacheWrite)}`
                          : "模型未返回缓存用量"}</span>
                      </div>
                      <div><small>估算费用</small><strong>{formatCost(overview.stats.cost)}</strong><span>由 Pi 按模型计费信息汇总</span></div>
                    </div>
                  </section>

                  <section className="session-overview-section">
                    <div className="session-overview-section-title"><GitBranch size={15} /><strong>会话分支</strong><small>切换到较早节点时，可让 Pi 为离开的分支生成摘要。</small></div>
                    <div className="session-navigation-options">
                      <label>
                        <span>分支处理</span>
                        <select value={navigationMode} disabled={controlsDisabled} onChange={(event) => setNavigationMode(event.target.value as typeof navigationMode)}>
                          <option value="none">直接切换，不生成摘要</option>
                          <option value="summary">生成默认摘要</option>
                          <option value="custom">按自定义要求生成摘要</option>
                        </select>
                      </label>
                      {navigationMode === "custom" && (
                        <textarea
                          value={summaryInstructions}
                          disabled={controlsDisabled}
                          rows={2}
                          placeholder="例如：重点保留尚未完成的修改、测试结果和关键决策"
                          onChange={(event) => setSummaryInstructions(event.target.value)}
                        />
                      )}
                    </div>
                    <div className="session-tree-list" role="tree" aria-label="会话分支树">
                      {treeRows.length > 0 ? treeRows.map(({ node, depth, level }) => (
                        <button
                          className={`session-tree-row ${node.id === overview.leafId ? "active" : ""}`}
                          type="button"
                          role="treeitem"
                          aria-level={level}
                          aria-current={node.id === overview.leafId ? "true" : undefined}
                          disabled={controlsDisabled || node.id === overview.leafId}
                          key={node.id}
                          style={{ paddingLeft: `${12 + depth * 17}px` }}
                          onClick={() => void navigateSessionTree(node.id, {
                            summarize: navigationMode !== "none",
                            ...(navigationMode === "custom" && summaryInstructions.trim()
                              ? { customInstructions: summaryInstructions.trim() }
                              : {}),
                          })}
                          title={node.label ?? node.preview}
                        >
                          <GitFork size={13} /><span>{node.label ?? node.preview}</span>{node.id === overview.leafId && <em>当前</em>}
                        </button>
                      )) : <div className="session-tree-empty">当前会话尚无可用分支。</div>}
                    </div>
                  </section>

                  <section className="session-overview-section session-overview-actions">
                    <div className="session-overview-section-title"><CopyPlus size={15} /><strong>创建副本或分支</strong></div>
                    <div className="session-action-row">
                      <button type="button" disabled={controlsDisabled} onClick={() => void cloneSession()}><CopyPlus size={14} />克隆当前分支</button>
                      <label>
                        <span>从用户消息 Fork</span>
                        <select value={selectedForkId} disabled={controlsDisabled || overview.forkTargets.length === 0} onChange={(event) => setSelectedForkId(event.target.value)}>
                          {overview.forkTargets.length === 0 && <option value="">暂无可分叉的用户消息</option>}
                          {overview.forkTargets.map((target) => <option value={target.entryId} key={target.entryId}>{target.text}</option>)}
                        </select>
                      </label>
                      <button type="button" disabled={controlsDisabled || !selectedForkId} onClick={() => void forkSession(selectedForkId)}><GitFork size={14} />创建 Fork</button>
                    </div>
                  </section>
                </>
              ) : (
                <div className="session-overview-loading"><LoaderCircle className="spin" size={16} />正在读取 Pi 会话信息…</div>
              )}
            </div>

            <footer>
              <button type="button" disabled={controlsDisabled} onClick={() => void importSession()}><Upload size={14} />导入 JSONL</button>
              <button type="button" disabled={controlsDisabled} onClick={() => void exportSession("jsonl")}><FileDown size={14} />导出 JSONL</button>
              <button type="button" disabled={controlsDisabled} onClick={() => void exportSession("html")}><FileDown size={14} />导出 HTML</button>
              <button type="button" className="primary" onClick={() => setOpen(false)}><Download size={14} />完成</button>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
