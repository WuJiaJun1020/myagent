import {
  AlertTriangle,
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  FileQuestion,
  FilterX,
  Heart,
  History,
  Lightbulb,
  Link2,
  LoaderCircle,
  MessageSquareMore,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  QuestionBankQuestionDetail,
  QuestionBankQuestionSummary,
  QuestionBankSnapshot,
  QuestionBankListQuery,
  QuestionBankSourceType,
} from "../../../shared/contracts/interview-question-bank";
import type {
  InterviewQuestionDifficulty,
  InterviewQuestionKind,
} from "../../../shared/contracts/interview";
import { useQuestionBankStore } from "../../stores/question-bank-store";
import { useQuestionPracticeStore } from "../../stores/question-practice-store";
import {
  QuestionPracticeExperience,
  QuestionPracticeStartDialog,
  type QuestionPracticeStartContext,
} from "./QuestionPractice";

const KIND_LABELS: Record<InterviewQuestionKind, string> = {
  technical: "技术原理",
  project: "项目深挖",
  scenario: "场景分析",
  behavioral: "行为沟通",
};

const DIFFICULTY_LABELS: Record<InterviewQuestionDifficulty, string> = {
  introductory: "入门",
  intermediate: "中级",
  advanced: "高级",
};

const SOURCE_LABELS: Record<QuestionBankSourceType, string> = {
  builtin: "内置题库",
  file: "文档导入",
  web: "网页导入",
  manual: "手动创建",
  generated: "AI 草稿",
};

const TAXONOMY_LABELS: Record<string, string> = {
  "agent-engineer": "Agent 工程师",
  "ai-application": "AI 应用工程师",
  backend: "后端开发",
  "data-engineering": "数据工程",
  desktop: "桌面客户端",
  frontend: "前端开发",
  "general-engineering": "通用软件工程",
  "llm-engineer": "大模型工程师",
  "llm-platform": "大模型平台",
  "python-backend": "Python 后端",
  "rag-engineer": "RAG 工程师",
  "search-engineer": "搜索工程师",
  sre: "SRE",
  collaboration: "团队协作",
  communication: "沟通表达",
  "cost-awareness": "成本意识",
  "data-governance": "数据治理",
  "engineering-practice": "工程实践",
  evaluation: "评测能力",
  "incident-response": "故障应急",
  learning: "学习复盘",
  observability: "可观测性",
  ownership: "责任意识",
  performance: "性能优化",
  "problem-analysis": "问题分析",
  "product-thinking": "产品思维",
  "project-experience": "项目经验",
  quality: "质量保障",
  reliability: "可靠性",
  "resource-awareness": "资源意识",
  security: "安全意识",
  "system-design": "系统设计",
  "technical-foundation": "技术基础",
  "tradeoff-analysis": "权衡分析",
  junior: "初级",
  mid: "中级",
  senior: "高级",
  rag: "RAG",
  llm: "LLM",
  api: "API",
  sql: "SQL",
  sse: "SSE",
  bm25: "BM25",
  cpython: "CPython",
};

function taxonomyLabel(value: string): string {
  return TAXONOMY_LABELS[value] ?? value.replaceAll("-", " ");
}

function questionKindLabel(question: Pick<QuestionBankQuestionSummary, "kind" | "subtype">): string {
  return question.subtype === "system-design" ? "系统设计" : KIND_LABELS[question.kind];
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.round(seconds / 60)} 分钟`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function QuestionListItem({
  question,
  active,
  favoritePending,
  onSelect,
  onToggleFavorite,
}: {
  question: QuestionBankQuestionSummary;
  active: boolean;
  favoritePending: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <article className={`question-bank-list-item${active ? " active" : ""}`}>
      <button className="question-bank-list-select" type="button" onClick={onSelect}>
        <span className="question-bank-list-heading">
          <span className="question-kind-badge" data-kind={question.kind}>{questionKindLabel(question)}</span>
          <span className="question-difficulty" data-difficulty={question.difficulty}>{DIFFICULTY_LABELS[question.difficulty]}</span>
        </span>
        <strong>{question.title}</strong>
        <span className="question-bank-prompt-preview">{question.prompt}</span>
        <span className="question-bank-list-meta">
          <span><Clock3 size={11} />{formatDuration(question.estimatedSeconds)}</span>
          <span>{question.skills.slice(0, 2).map(taxonomyLabel).join(" · ") || "通用能力"}</span>
        </span>
      </button>
      <button
        className={`question-favorite-button${question.favorite ? " active" : ""}`}
        type="button"
        aria-label={question.favorite ? `取消收藏 ${question.title}` : `收藏 ${question.title}`}
        aria-pressed={question.favorite}
        disabled={favoritePending}
        onClick={onToggleFavorite}
      >
        {favoritePending ? <LoaderCircle className="spin" size={14} /> : <Star size={14} fill={question.favorite ? "currentColor" : "none"} />}
      </button>
      {active && <ChevronRight className="question-bank-active-arrow" size={14} aria-hidden="true" />}
    </article>
  );
}

function QuestionDetail({
  question,
  favoritePending,
  practiceActive,
  onToggleFavorite,
  onPractice,
}: {
  question: QuestionBankQuestionDetail;
  favoritePending: boolean;
  practiceActive: boolean;
  onToggleFavorite: () => void;
  onPractice: () => void;
}) {
  const sourceCanOpen = question.source.uri && /^https?:\/\//iu.test(question.source.uri);
  return (
    <div className="question-bank-detail-content">
      <header className="question-bank-detail-header">
        <div>
          <span className="question-bank-detail-kicker">
            <span className="question-kind-badge" data-kind={question.kind}>{questionKindLabel(question)}</span>
            <span className="question-difficulty" data-difficulty={question.difficulty}>{DIFFICULTY_LABELS[question.difficulty]}</span>
            <span>v{question.version}</span>
          </span>
          <h3>{question.title}</h3>
          <p>{question.prompt}</p>
        </div>
        <div className="question-bank-detail-actions">
          <button className="question-bank-practice-question" type="button" onClick={onPractice}><Play size={14} />{practiceActive ? "继续当前练习" : "练习本题"}</button>
          <button
            className={`question-bank-detail-favorite${question.favorite ? " active" : ""}`}
            type="button"
            aria-pressed={question.favorite}
            disabled={favoritePending}
            onClick={onToggleFavorite}
          >
            {favoritePending ? <LoaderCircle className="spin" size={14} /> : <Star size={14} fill={question.favorite ? "currentColor" : "none"} />}
            {question.favorite ? "已收藏" : "收藏"}
          </button>
        </div>
      </header>

      <div className="question-bank-detail-facts" aria-label="题目信息">
        <span><Clock3 size={13} /><small>建议作答</small><strong>{formatDuration(question.estimatedSeconds)}</strong></span>
        <span><Target size={13} /><small>适用岗位</small><strong>{question.roles.map(taxonomyLabel).join("、") || "通用"}</strong></span>
        <span><Sparkles size={13} /><small>能力维度</small><strong>{question.competencies.map(taxonomyLabel).join("、") || "未标注"}</strong></span>
      </div>

      {question.intent && (
        <section className="question-bank-intent">
          <div><Lightbulb size={15} /><h4>考察意图</h4></div>
          <p>{question.intent}</p>
        </section>
      )}

      <section>
        <div className="question-bank-section-title"><BookOpenCheck size={15} /><h4>{question.referenceAnswer ? "参考答案" : "答案提纲"}</h4></div>
        {question.referenceAnswer ? <p className="question-bank-reference-answer">{question.referenceAnswer}</p> : question.answerOutline.length > 0 ? (
          <ol className="question-bank-outline">
            {question.answerOutline.map((item, index) => <li key={`${index}:${item}`}><span>{index + 1}</span><p>{item}</p></li>)}
          </ol>
        ) : <p className="question-bank-missing-copy">暂未整理答案提纲。</p>}
      </section>

      <section>
        <div className="question-bank-section-title"><CheckCircle2 size={15} /><h4>评分要点</h4></div>
        {question.rubric.length > 0 ? (
          <div className="question-bank-rubric-list">
            {question.rubric.map((item) => (
              <article key={item.id} data-critical={item.critical || undefined}>
                <span>{item.critical ? "关键" : `${item.weight} 分`}</span>
                <div><strong>{item.label}</strong><p>{item.description}</p></div>
              </article>
            ))}
          </div>
        ) : <p className="question-bank-missing-copy">暂未配置评分要点。</p>}
      </section>

      {question.followUps.length > 0 && (
        <section>
          <div className="question-bank-section-title"><MessageSquareMore size={15} /><h4>建议追问</h4></div>
          <div className="question-bank-followups">
            {question.followUps.map((followUp, index) => (
              <article key={`${index}:${followUp.prompt}`}>
                <strong>{followUp.prompt}</strong>
                {followUp.trigger && <p>触发条件：{followUp.trigger}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      {question.commonMistakes.length > 0 && (
        <section className="question-bank-mistakes">
          <div className="question-bank-section-title"><AlertTriangle size={15} /><h4>常见误区</h4></div>
          <ul>{question.commonMistakes.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul>
        </section>
      )}

      {Boolean(question.evidence?.length) && (
        <section className="question-bank-evidence">
          <div className="question-bank-section-title"><ShieldCheck size={15} /><h4>原文证据</h4></div>
          {question.evidence!.map((item, index) => <blockquote key={`${item.segmentId}:${index}`}>
            <small>{item.sourceTitle} · {item.segmentId}</small><p>{item.quote}</p>
          </blockquote>)}
        </section>
      )}

      <section className="question-bank-source">
        <div className="question-bank-section-title"><ShieldCheck size={15} /><h4>来源与版本</h4></div>
        <div>
          <span><small>来源</small><strong>{question.source.title || SOURCE_LABELS[question.source.type]}</strong></span>
          <span><small>类型</small><strong>{question.source.parserId === "knowledge-studio" ? "知识工坊资料" : SOURCE_LABELS[question.source.type]}</strong></span>
          <span><small>更新时间</small><strong>{formatDate(question.updatedAt)}</strong></span>
          {sourceCanOpen && <button type="button" onClick={() => void window.piDesktop.openExternal(question.source.uri!)}><Link2 size={13} />查看原始网页</button>}
        </div>
        {(question.source.attribution || question.source.license) && <p>{[question.source.attribution, question.source.license].filter(Boolean).join(" · ")}</p>}
      </section>
    </div>
  );
}

function QuestionBankOverview({
  snapshot,
  practiceActive,
  practiceAvailable,
  practiceBusy,
  onBack,
  onStartPractice,
  onOpenHistory,
}: {
  snapshot: QuestionBankSnapshot | null;
  practiceActive: boolean;
  practiceAvailable: number;
  practiceBusy: boolean;
  onBack: () => void;
  onStartPractice: () => void;
  onOpenHistory: () => void;
}) {
  return (
    <header className="question-bank-overview">
      <button className="question-bank-back-button" type="button" onClick={onBack} title="返回智能面试">
        <ArrowLeft size={14} />返回智能面试
      </button>
      <div className="question-bank-overview-title">
        <FileQuestion size={16} />
        <span>
          <strong id="question-bank-title">面试问答题库</strong>
          <small>可追溯、可版本化的本地面试题</small>
        </span>
      </div>
      <div className="question-bank-overview-counts" aria-label="题库概览">
        <span><small>全部</small><strong>{snapshot?.total ?? 0}</strong></span>
        <span><small>已发布</small><strong>{snapshot?.published ?? 0}</strong></span>
        <span><Heart size={12} /><small>收藏</small><strong>{snapshot?.favorites ?? 0}</strong></span>
      </div>
      <div className="question-bank-practice-actions">
        <button type="button" className="history" onClick={onOpenHistory}><History size={13} />练习历史</button>
        <button type="button" className="start" disabled={practiceBusy || (!practiceActive && practiceAvailable === 0)} onClick={onStartPractice}>{practiceBusy ? <LoaderCircle className="spin" size={13} /> : <Play size={13} />}{practiceActive ? "继续练习" : "开始练习"}</button>
      </div>
      <span className="question-bank-local-badge"><Database size={13} />本机题库</span>
    </header>
  );
}

export function InterviewQuestionBank({ onBack }: { onBack: () => void }) {
  const snapshot = useQuestionBankStore((state) => state.snapshot);
  const items = useQuestionBankStore((state) => state.items);
  const total = useQuestionBankStore((state) => state.total);
  const hasMore = useQuestionBankStore((state) => state.hasMore);
  const initialized = useQuestionBankStore((state) => state.initialized);
  const snapshotError = useQuestionBankStore((state) => state.snapshotError);
  const loading = useQuestionBankStore((state) => state.loading);
  const loadingMore = useQuestionBankStore((state) => state.loadingMore);
  const error = useQuestionBankStore((state) => state.error);
  const filters = useQuestionBankStore((state) => state.filters);
  const selectedId = useQuestionBankStore((state) => state.selectedId);
  const detail = useQuestionBankStore((state) => state.detail);
  const detailLoading = useQuestionBankStore((state) => state.detailLoading);
  const detailError = useQuestionBankStore((state) => state.detailError);
  const favoritePendingIds = useQuestionBankStore((state) => state.favoritePendingIds);
  const favoriteError = useQuestionBankStore((state) => state.favoriteError);
  const initialize = useQuestionBankStore((state) => state.initialize);
  const setFilters = useQuestionBankStore((state) => state.setFilters);
  const loadMore = useQuestionBankStore((state) => state.loadMore);
  const selectQuestion = useQuestionBankStore((state) => state.selectQuestion);
  const toggleFavorite = useQuestionBankStore((state) => state.toggleFavorite);
  const clearFavoriteError = useQuestionBankStore((state) => state.clearFavoriteError);
  const practiceScreen = useQuestionPracticeStore((state) => state.screen);
  const practiceOverview = useQuestionPracticeStore((state) => state.overview);
  const practiceOverviewLoading = useQuestionPracticeStore((state) => state.overviewLoading);
  const practiceOverviewError = useQuestionPracticeStore((state) => state.overviewError);
  const practiceSessionLoading = useQuestionPracticeStore((state) => state.sessionLoading);
  const practiceSessionError = useQuestionPracticeStore((state) => state.sessionError);
  const initializePracticeOverview = useQuestionPracticeStore((state) => state.initializeOverview);
  const resumePracticeSession = useQuestionPracticeStore((state) => state.resumeSession);
  const openPracticeHistory = useQuestionPracticeStore((state) => state.openHistory);
  const [search, setSearch] = useState(filters.search);
  const [practiceSetup, setPracticeSetup] = useState<QuestionPracticeStartContext | null>(null);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    void initializePracticeOverview();
  }, [initializePracticeOverview]);

  useEffect(() => {
    if (search === filters.search) return;
    const timer = window.setTimeout(() => void setFilters({ search }), 260);
    return () => window.clearTimeout(timer);
  }, [filters.search, search, setFilters]);

  const activeFilterCount = useMemo(() => [
    filters.kind,
    filters.difficulty,
    filters.role,
    filters.skill,
    filters.favoritesOnly || undefined,
  ].filter(Boolean).length, [filters]);

  const practiceQuery = useMemo((): Omit<QuestionBankListQuery, "limit" | "offset"> => {
    const normalizedSearch = filters.search.trim();
    return {
      ...(normalizedSearch ? { search: normalizedSearch } : {}),
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.skill ? { skill: filters.skill } : {}),
      ...(filters.favoritesOnly ? { favoritesOnly: true } : {}),
    };
  }, [filters]);

  function beginFilteredPractice(): void {
    const active = practiceOverview?.activeSession;
    if (active) {
      void resumePracticeSession(active.id);
      return;
    }
    if (total > 0) setPracticeSetup({ kind: "filtered", query: practiceQuery, availableCount: total });
  }

  const overviewProps = {
    snapshot,
    practiceActive: Boolean(practiceOverview?.activeSession),
    practiceAvailable: total,
    practiceBusy: practiceOverviewLoading || practiceSessionLoading || loading || search !== filters.search,
    onBack,
    onStartPractice: beginFilteredPractice,
    onOpenHistory: () => void openPracticeHistory(),
  };

  function clearFilters(): void {
    setSearch("");
    void setFilters({
      search: "",
      kind: undefined,
      difficulty: undefined,
      role: undefined,
      skill: undefined,
      favoritesOnly: false,
    });
  }

  if (practiceScreen !== "library" || practiceSessionLoading) {
    return <QuestionPracticeExperience />;
  }

  if (!initialized && loading) {
    return <section className="question-bank-page" aria-labelledby="question-bank-title"><QuestionBankOverview {...overviewProps} /><div className="question-bank-page-state"><LoaderCircle className="spin" size={19} /><strong>正在读取面试题库…</strong><span>题目列表加载完成后，再按需读取所选题目的答案与评分标准。</span></div></section>;
  }

  if (!initialized && (error || snapshotError)) {
    return <section className="question-bank-page" aria-labelledby="question-bank-title"><QuestionBankOverview {...overviewProps} /><div className="question-bank-page-state error" role="alert"><AlertTriangle size={20} /><strong>题库加载失败</strong><span>{snapshotError ?? error}</span><button type="button" onClick={() => void initialize(true)}><RefreshCw size={14} />重试</button></div></section>;
  }

  return (
    <section className="question-bank-page" aria-labelledby="question-bank-title">
      <QuestionBankOverview {...overviewProps} />

      <section className="question-bank-browser">
        {practiceOverview?.activeSession && (
          <div className="question-practice-resume-banner">
            <Play size={14} />
            <span><strong>有一轮练习尚未完成</strong><small>已进行到第 {practiceOverview.activeSession.currentOrdinal + 1} / {practiceOverview.activeSession.questionCount} 题，草稿已保存在本机。</small></span>
            <button type="button" disabled={practiceSessionLoading} onClick={() => void resumePracticeSession(practiceOverview.activeSession!.id)}>{practiceSessionLoading ? <LoaderCircle className="spin" size={13} /> : <ChevronRight size={13} />}继续练习</button>
          </div>
        )}
        <header className="question-bank-toolbar">
          <label className="question-bank-search">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索题目、题干或技能…" aria-label="搜索面试题" />
            {search && <button type="button" aria-label="清空搜索" onClick={() => setSearch("")}><X size={13} /></button>}
          </label>
          <div className="question-bank-filters">
            <select aria-label="按题型筛选" value={filters.kind ?? ""} onChange={(event) => void setFilters({ kind: (event.target.value || undefined) as InterviewQuestionKind | undefined })}>
              <option value="">全部题型</option>
              {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select aria-label="按难度筛选" value={filters.difficulty ?? ""} onChange={(event) => void setFilters({ difficulty: (event.target.value || undefined) as InterviewQuestionDifficulty | undefined })}>
              <option value="">全部难度</option>
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select aria-label="按岗位筛选" value={filters.role ?? ""} onChange={(event) => void setFilters({ role: event.target.value || undefined })}>
              <option value="">全部岗位</option>
              {snapshot?.roles.map((option) => <option key={option.value} value={option.value}>{taxonomyLabel(option.label)}（{option.count}）</option>)}
            </select>
            <select aria-label="按技能筛选" value={filters.skill ?? ""} onChange={(event) => void setFilters({ skill: event.target.value || undefined })}>
              <option value="">全部技能</option>
              {snapshot?.skills.map((option) => <option key={option.value} value={option.value}>{taxonomyLabel(option.label)}（{option.count}）</option>)}
            </select>
            <button className={filters.favoritesOnly ? "active" : ""} type="button" aria-pressed={filters.favoritesOnly} onClick={() => void setFilters({ favoritesOnly: !filters.favoritesOnly })}><Star size={13} fill={filters.favoritesOnly ? "currentColor" : "none"} />只看收藏</button>
            {activeFilterCount > 0 && <button className="question-bank-clear-filters" type="button" onClick={clearFilters}><FilterX size={13} />重置</button>}
          </div>
        </header>

        {(snapshotError || error || favoriteError || practiceOverviewError || practiceSessionError) && (
          <div className="question-bank-inline-error" role="alert">
            <AlertTriangle size={14} />
            <span>{favoriteError ?? practiceSessionError ?? practiceOverviewError ?? snapshotError ?? error}</span>
            {favoriteError
              ? <button type="button" aria-label="关闭错误" onClick={clearFavoriteError}><X size={13} /></button>
              : practiceSessionError && practiceOverview?.activeSession
                ? <button type="button" onClick={() => void resumePracticeSession(practiceOverview.activeSession!.id)}><RefreshCw size={13} />重试</button>
                : practiceOverviewError
                  ? <button type="button" onClick={() => void initializePracticeOverview(true)}><RefreshCw size={13} />重试</button>
                  : <button type="button" onClick={() => void (snapshotError ? initialize(true) : setFilters({}))}><RefreshCw size={13} />重试</button>}
          </div>
        )}

        <div className="question-bank-browser-body" aria-busy={loading}>
          <aside className="question-bank-list" aria-label="面试题列表" tabIndex={0}>
            <header><span>{loading ? "正在筛选…" : `找到 ${total} 道题`}</span>{items.length > 0 && <small>已加载 {items.length}</small>}</header>
            {loading && items.length === 0 ? (
              <div className="question-bank-list-state"><LoaderCircle className="spin" size={17} />正在加载题目…</div>
            ) : items.length === 0 ? (
              <div className="question-bank-list-state empty"><Search size={19} /><strong>{snapshot?.total ? "没有匹配的题目" : "题库中还没有题目"}</strong><span>{snapshot?.total ? "试试减少筛选条件或换一个关键词。" : "内置种子题或后续导入的文档、网页题目会显示在这里。"}</span>{activeFilterCount > 0 && <button type="button" onClick={clearFilters}>清除筛选</button>}</div>
            ) : <>
              <div className={`question-bank-list-items${loading ? " loading" : ""}`}>
                {items.map((question) => (
                  <QuestionListItem
                    key={question.id}
                    question={question}
                    active={selectedId === question.id}
                    favoritePending={favoritePendingIds.has(question.id)}
                    onSelect={() => void selectQuestion(question.id)}
                    onToggleFavorite={() => void toggleFavorite(question.id)}
                  />
                ))}
              </div>
              {hasMore && <button className="question-bank-load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <LoaderCircle className="spin" size={14} /> : null}{loadingMore ? "正在加载" : "加载更多题目"}</button>}
            </>}
          </aside>

          <article className="question-bank-detail" aria-label="面试题详情" tabIndex={0}>
            {detailLoading ? (
              <div className="question-bank-detail-state"><LoaderCircle className="spin" size={18} /><strong>正在读取答案与评分标准…</strong><span>详情内容仅在选择题目后加载。</span></div>
            ) : detailError ? (
              <div className="question-bank-detail-state error" role="alert"><AlertTriangle size={19} /><strong>题目详情加载失败</strong><span>{detailError}</span>{selectedId && <button type="button" onClick={() => void selectQuestion(selectedId, true)}><RefreshCw size={13} />重试</button>}</div>
            ) : detail ? (
              <QuestionDetail
                question={detail}
                favoritePending={favoritePendingIds.has(detail.id)}
                practiceActive={Boolean(practiceOverview?.activeSession)}
                onToggleFavorite={() => void toggleFavorite(detail.id)}
                onPractice={() => {
                  const active = practiceOverview?.activeSession;
                  if (active) void resumePracticeSession(active.id);
                  else setPracticeSetup({ kind: "single", questionId: detail.id, expectedVersion: detail.version, title: detail.title });
                }}
              />
            ) : (
              <div className="question-bank-detail-state"><FileQuestion size={20} /><strong>选择一道面试题</strong><span>查看答案提纲、评分要点、追问建议和可追溯来源。</span></div>
            )}
          </article>
        </div>
        <footer className="question-bank-browser-footer"><ShieldCheck size={13} /><span>题目正文与来源保存在 SQLite；列表只读取摘要，答案详情按需加载。</span><span>{items.length}/{total} 题</span></footer>
      </section>
      {practiceSetup && <QuestionPracticeStartDialog context={practiceSetup} onClose={() => setPracticeSetup(null)} />}
    </section>
  );
}
