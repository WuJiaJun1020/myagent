import {
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  Check,
  Database,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { JobPosting, JobSource } from "../../../shared/contracts/interview";
import { interviewGateway } from "../../services/interview-gateway";
import { useJobLibraryStore } from "../../stores/job-library-store";

const SOURCE_LABELS: Record<JobSource, string> = { alibaba: "阿里巴巴", bytedance: "字节跳动" };

function formatTime(value?: string): string {
  if (!value) return "尚未采集";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function JobLibrary({ onUseJob }: { onUseJob: (job: JobPosting) => void }) {
  const jobs = useJobLibraryStore((state) => state.jobs);
  const total = useJobLibraryStore((state) => state.total);
  const bySource = useJobLibraryStore((state) => state.bySource);
  const lastRun = useJobLibraryStore((state) => state.lastRun);
  const initialized = useJobLibraryStore((state) => state.initialized);
  const loading = useJobLibraryStore((state) => state.loading);
  const collecting = useJobLibraryStore((state) => state.collecting);
  const error = useJobLibraryStore((state) => state.error);
  const progress = useJobLibraryStore((state) => state.progress);
  const initialize = useJobLibraryStore((state) => state.initialize);
  const collect = useJobLibraryStore((state) => state.collect);
  const setProgress = useJobLibraryStore((state) => state.setProgress);
  const [sources, setSources] = useState<JobSource[]>(["alibaba", "bytedance"]);
  const [keywords, setKeywords] = useState("后端，算法，AI");
  const [limitPerSource, setLimitPerSource] = useState(30);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | JobSource>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void initialize();
    return interviewGateway.onJobCollectionProgress(setProgress);
  }, [initialize, setProgress]);

  useEffect(() => {
    if (!jobs.some((job) => job.id === selectedId)) setSelectedId(jobs[0]?.id ?? null);
  }, [jobs, selectedId]);

  const visibleJobs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return jobs.filter((job) => {
      if (sourceFilter !== "all" && job.source !== sourceFilter) return false;
      if (!normalized) return true;
      return [job.title, job.company, job.city, job.category, job.department, job.description, ...job.requirements]
        .join("\n")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [jobs, query, sourceFilter]);
  const selected = jobs.find((job) => job.id === selectedId) ?? null;

  function toggleSource(source: JobSource): void {
    setSources((current) => current.includes(source)
      ? current.filter((item) => item !== source)
      : [...current, source]);
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsedKeywords = [...new Set(keywords.split(/[,，\n]/u).map((item) => item.trim()).filter(Boolean))];
    if (sources.length === 0 || parsedKeywords.length === 0) return;
    void collect({ sources, keywords: parsedKeywords, limitPerSource });
  }

  return (
    <section className="job-library">
      <div className="job-library-summary">
        <article><Database size={18} /><span><small>岗位总数</small><strong>{total}</strong></span></article>
        <article><Building2 size={18} /><span><small>阿里巴巴</small><strong>{bySource.alibaba}</strong></span></article>
        <article><BriefcaseBusiness size={18} /><span><small>字节跳动</small><strong>{bySource.bytedance}</strong></span></article>
      </div>

      <form className="job-collector-card" onSubmit={submit}>
        <header>
          <div><span className="eyebrow">OFFICIAL CAREER SITES</span><h2>自动采集岗位</h2><p>在隔离的后台浏览器中访问官方招聘网站，并合并到本地岗位库。</p></div>
          <span className="job-last-run">上次采集 {formatTime(lastRun?.finishedAt ?? lastRun?.startedAt)}</span>
        </header>
        <div className="job-collector-controls">
          <fieldset><legend>数据来源</legend><div>{(["alibaba", "bytedance"] as const).map((source) => <button className={sources.includes(source) ? "active" : ""} type="button" key={source} aria-pressed={sources.includes(source)} onClick={() => toggleSource(source)}>{sources.includes(source) && <Check size={13} />}{SOURCE_LABELS[source]}</button>)}</div></fieldset>
          <label><span>搜索关键词</span><input value={keywords} maxLength={300} onChange={(event) => setKeywords(event.target.value)} placeholder="后端，算法，AI Agent" /></label>
          <label className="job-limit-control"><span>每个来源上限</span><select value={limitPerSource} onChange={(event) => setLimitPerSource(Number(event.target.value))}><option value={10}>10 条</option><option value={30}>30 条</option><option value={50}>50 条</option><option value={100}>100 条</option></select></label>
          <button className="interview-primary-button" type="submit" disabled={collecting || sources.length === 0 || !keywords.trim()}>{collecting ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}{collecting ? "正在采集" : "开始采集"}</button>
        </div>
        {(collecting || progress) && <div className={`job-collector-progress ${progress?.phase === "failed" ? "error" : ""}`}><span>{collecting && <LoaderCircle className="spin" size={13} />}{progress?.message ?? "正在启动采集器…"}</span>{progress?.collected ? <small>已获取 {progress.collected} 条</small> : null}</div>}
        {error && <p className="interview-form-error" role="alert">{error}</p>}
        {!collecting && lastRun && lastRun.status !== "completed" && <div className="job-run-warning" role="status"><strong>{lastRun.status === "partial" ? "上次采集部分完成" : "上次采集未完成"}</strong>{lastRun.results.filter((result) => result.error).map((result) => <span key={result.source}>{SOURCE_LABELS[result.source]}：{result.error}</span>)}</div>}
        <footer><ShieldCheck size={14} /><span>仅读取公开岗位，不登录、不处理验证码，同一岗位会自动更新而不是重复创建。</span></footer>
      </form>

      <section className="job-browser">
        <header>
          <div><span className="eyebrow">LOCAL JOB LIBRARY</span><h2>岗位库</h2></div>
          <div className="job-browser-tools">
            <div className="job-source-filter" role="group" aria-label="岗位来源筛选">
              <button className={sourceFilter === "all" ? "active" : ""} type="button" onClick={() => setSourceFilter("all")}>全部</button>
              <button className={sourceFilter === "alibaba" ? "active" : ""} type="button" onClick={() => setSourceFilter("alibaba")}>阿里</button>
              <button className={sourceFilter === "bytedance" ? "active" : ""} type="button" onClick={() => setSourceFilter("bytedance")}>字节</button>
            </div>
            <label className="job-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索岗位、城市或技能…" /></label>
          </div>
        </header>

        {loading && !initialized ? <div className="interview-loading"><LoaderCircle className="spin" size={17} />正在读取岗位库…</div> : visibleJobs.length === 0 ? (
          <div className="interview-empty"><div><BriefcaseBusiness size={22} /></div><strong>{jobs.length === 0 ? "还没有采集岗位" : "没有匹配的岗位"}</strong><p>{jobs.length === 0 ? "选择来源和关键词后启动采集，结果会持久保存在面试业务数据库中。" : "试试更换关键词或数据来源。"}</p></div>
        ) : (
          <div className="job-browser-body">
            <div className="job-list" aria-label="岗位列表" tabIndex={0}>
              {visibleJobs.map((job) => <button className={job.id === selected?.id ? "active" : ""} type="button" key={job.id} onClick={() => setSelectedId(job.id)}><span className="job-source-badge" data-source={job.source}>{job.source === "alibaba" ? "ALI" : "BD"}</span><span><strong>{job.title}</strong><small><MapPin size={11} />{job.city || "地点未标注"} · {job.category || job.jobType || "类别未标注"}</small></span></button>)}
            </div>
            <article className="job-detail" aria-label="岗位详情" tabIndex={0}>
              {selected ? <>
                <header><div><span>{selected.company}</span><h3>{selected.title}</h3><p>{[selected.city, selected.category, selected.jobType, selected.batch].filter(Boolean).join(" · ")}</p></div><span className="job-source-badge" data-source={selected.source}>{SOURCE_LABELS[selected.source]}</span></header>
                <div className="job-detail-actions"><button type="button" onClick={() => onUseJob(selected)}><Sparkles size={14} />用此岗位创建面试</button><button type="button" onClick={() => void window.piDesktop.openExternal(selected.sourceUrl)}><ArrowUpRight size={14} />打开官网</button></div>
                <section><h4>岗位描述</h4><p>{selected.description || "暂无岗位描述。"}</p></section>
                <section><h4>岗位要求</h4>{selected.requirements.length > 0 ? <ul>{selected.requirements.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul> : <p>暂无岗位要求。</p>}</section>
              </> : <div className="job-detail-placeholder"><BriefcaseBusiness size={22} /><strong>选择一个岗位</strong><p>查看完整 JD，或直接用它填充面试草稿。</p></div>}
            </article>
          </div>
        )}
      </section>
    </section>
  );
}
