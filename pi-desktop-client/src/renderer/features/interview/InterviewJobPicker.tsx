import { useId, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { JobPosting } from "../../../shared/contracts/interview";

export function InterviewJobPicker({ jobs, value, loading, onChange }: {
  jobs: JobPosting[]; value?: string; loading: boolean; onChange: (job: JobPosting) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = jobs.find(job => job.id === value);
  const label = (job: JobPosting) => [job.company, job.title, job.city].filter(Boolean).join(" · ");
  const options = jobs.filter(job => [job.title, job.company, job.city, job.category]
    .some(text => text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))).slice(0, 100);
  function choose(job: JobPosting) { onChange(job); setOpen(false); setQuery(""); }
  return <div className="interview-job-combobox" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setQuery(""); }
  }}>
    <div className="interview-job-input">
      <input ref={input} role="combobox" aria-label="目标岗位" aria-expanded={open} aria-controls={id}
        aria-autocomplete="list" aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
        autoComplete="off" value={open ? query : selected ? label(selected) : ""}
        placeholder={loading ? "正在读取岗位…" : "搜索并选择岗位"}
        onFocus={() => { setOpen(true); setActive(0); }}
        onClick={() => { setOpen(true); setActive(0); }}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }}
        onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); setOpen(false); setQuery(""); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            setActive(index => open ? Math.max(0, Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))) : 0);
          }
          if (event.key === "Enter" && open) { event.preventDefault(); if (options[active]) choose(options[active]); }
        }} />
      <ChevronDown size={15} aria-hidden="true" />
    </div>
    {open && <div className="interview-job-options" id={id} role="listbox" aria-label="目标岗位选项">
      {options.length ? options.map((job, index) => <button key={job.id} id={`${id}-${index}`} type="button"
        role="option" aria-selected={job.id === value} className={index === active ? "active" : ""} tabIndex={-1}
        ref={node => { if (index === active) node?.scrollIntoView({ block: "nearest" }); }}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(job)}>
        <span>{label(job)}</span>{job.id === value && <Check size={14} />}
      </button>) : <p>{loading ? "正在读取岗位…" : "没有匹配的岗位"}</p>}
    </div>}
  </div>;
}
