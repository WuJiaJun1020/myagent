import { Check, Copy, FileCode2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { WorkspaceTextFile } from "../../../shared/contracts/workspace";

const MAX_RENDERED_LINES = 2_000;

function languageForPath(path: string): string {
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  return ({
    ts: "TypeScript", tsx: "TypeScript React", js: "JavaScript", jsx: "JavaScript React",
    json: "JSON", css: "CSS", html: "HTML", md: "Markdown", py: "Python", rs: "Rust",
    go: "Go", java: "Java", yaml: "YAML", yml: "YAML", toml: "TOML", ps1: "PowerShell",
  } as Record<string, string>)[extension] ?? (extension ? extension.toUpperCase() : "Text");
}

export function CodeViewer({ file }: { file: WorkspaceTextFile }) {
  const [copied, setCopied] = useState(false);
  const allLines = useMemo(() => file.content.replaceAll("\r\n", "\n").split("\n"), [file.content]);
  const visibleLines = allLines.slice(0, MAX_RENDERED_LINES);
  const renderTruncated = allLines.length > visibleLines.length;

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(file.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <section className="code-viewer">
      <header>
        <span><FileCode2 size={14} />{file.name}</span>
        <div><small>{languageForPath(file.path)}</small><button type="button" onClick={() => void copy()}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? "已复制" : "复制"}</button></div>
      </header>
      <div className="code-viewer-path">{file.path}</div>
      {(file.truncated || renderTruncated) && (
        <div className="viewer-notice">文件较大，当前只展示安全范围内的内容。</div>
      )}
      <div className="code-viewer-lines">
        {visibleLines.map((line, index) => (
          <div className="code-line" key={index}>
            <span>{index + 1}</span><code>{line || " "}</code>
          </div>
        ))}
      </div>
    </section>
  );
}
