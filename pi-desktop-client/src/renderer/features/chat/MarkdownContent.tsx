import { HoverHint } from "../../components/ui/tooltip";
import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import { useBrowserStore } from "../../stores/browser-store";
import { useUiStore } from "../../stores/ui-store";
import { browserLinkTarget } from "../browser/browser-link";
import remarkGfm from "remark-gfm";
import { Button } from "../../components/ui/button";

type MarkdownContentProps = {
  content: string;
};

type MarkdownCodeProps = {
  className?: string;
  children?: ReactNode;
};

function MarkdownCode({ className, children }: MarkdownCodeProps) {
  const [copied, setCopied] = useState(false);
  const code = String(children ?? "").replace(/\n$/, "");
  const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
  const block = Boolean(language) || code.includes("\n");

  if (!block) return <code className="markdown-inline-code">{children}</code>;

  async function copyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{language ?? "text"}</span>
        <Button className="code-copy-button" size="sm" variant="ghost" onClick={() => void copyCode()}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "已复制" : "复制"}
        </Button>
      </div>
      <pre><code className={className}>{code}</code></pre>
    </div>
  );
}

const markdownComponents: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => <MarkdownCode className={className}>{children}</MarkdownCode>,
  a: ({ href, children }) => <HoverHint content={href}>{href && (/^(https?:|file:)/i.test(href) || /\.html?$/i.test(href))
    ? <a className="markdown-link" href={href} onClick={event => { event.preventDefault(); useUiStore.getState().setActiveModule("agent"); useBrowserStore.getState().show(browserLinkTarget(href)); }}>{children}</a>
    : <span className="markdown-link">{children}</span>}</HoverHint>,
};

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
        urlTransform={(url, key) => key === "href" && (/^file:/i.test(url) || /^\/?[a-z]:[\\/]/i.test(url)) ? url : defaultUrlTransform(url)}
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
