import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
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
  a: ({ href, children }) => <span className="markdown-link" title={href}>{children}</span>,
};

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
