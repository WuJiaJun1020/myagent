import { Braces, FilePenLine, FileText, Search, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import type { ToolCallState } from "../../lib/event-reducer";
import { DiffViewer } from "../files/DiffViewer";
import { TerminalOutput } from "../terminal/TerminalOutput";

export type ToolPresentation = {
  category: "terminal" | "read" | "edit" | "search" | "generic";
  label: string;
  summary: string;
};

type ToolRendererDefinition = {
  supports: (tool: ToolCallState) => boolean;
  present: (tool: ToolCallState) => ToolPresentation;
  renderDetail: (tool: ToolCallState) => ReactNode;
};

function toolName(tool: ToolCallState): string {
  return tool.name.toLowerCase();
}

function stringArgument(tool: ToolCallState, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = tool.args[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function outputText(tool: ToolCallState): string {
  return tool.output.map((block) => block.type === "text" ? block.text : `[${block.mediaType}] ${block.label}`).join("\n");
}

function JsonDetail({ tool, heading = "调用参数" }: { tool: ToolCallState; heading?: string }) {
  return (
    <>
      <section className="detail-section">
        <h3><Braces size={14} />{heading}</h3>
        <pre>{JSON.stringify(tool.args, null, 2)}</pre>
      </section>
      <section className="detail-section">
        <h3><FileText size={14} />执行输出</h3>
        <pre>{outputText(tool) || "暂时没有输出。"}</pre>
      </section>
    </>
  );
}

const terminalRenderer: ToolRendererDefinition = {
  supports: (tool) => /(^|[:_.-])(bash|shell|terminal|exec)([:_.-]|$)/.test(toolName(tool)),
  present: (tool) => ({
    category: "terminal",
    label: "Terminal",
    summary: stringArgument(tool, ["command", "cmd", "script"]) ?? "执行终端命令",
  }),
  renderDetail: (tool) => (
    <TerminalOutput
      command={stringArgument(tool, ["command", "cmd", "script"])}
      output={outputText(tool)}
      status={tool.status}
    />
  ),
};

const readRenderer: ToolRendererDefinition = {
  supports: (tool) => /(^|[:_.-])(read|cat|open_file)([:_.-]|$)/.test(toolName(tool)),
  present: (tool) => ({
    category: "read",
    label: "Read file",
    summary: stringArgument(tool, ["path", "file", "filePath"]) ?? "读取文件",
  }),
  renderDetail: (tool) => <JsonDetail tool={tool} heading="读取参数" />,
};

const editRenderer: ToolRendererDefinition = {
  supports: (tool) => /(^|[:_.-])(write|edit|patch|apply_patch)([:_.-]|$)/.test(toolName(tool)),
  present: (tool) => ({
    category: "edit",
    label: "File change",
    summary: stringArgument(tool, ["path", "file", "filePath"]) ?? "修改项目文件",
  }),
  renderDetail: (tool) => tool.fileChange ? (
    <>
      <DiffViewer change={tool.fileChange} />
      <JsonDetail tool={tool} heading="变更参数" />
    </>
  ) : <JsonDetail tool={tool} heading="变更参数" />,
};

const searchRenderer: ToolRendererDefinition = {
  supports: (tool) => /(^|[:_.-])(grep|search|find|rg)([:_.-]|$)/.test(toolName(tool)),
  present: (tool) => ({
    category: "search",
    label: "Search",
    summary: stringArgument(tool, ["query", "pattern", "text"]) ?? "搜索工作区",
  }),
  renderDetail: (tool) => <JsonDetail tool={tool} heading="搜索参数" />,
};

const genericRenderer: ToolRendererDefinition = {
  supports: () => true,
  present: (tool) => {
    const firstValue = Object.values(tool.args)[0];
    return {
      category: "generic",
      label: tool.name,
      summary: typeof firstValue === "string" ? firstValue : Object.keys(tool.args).join(", ") || "无参数",
    };
  },
  renderDetail: (tool) => <JsonDetail tool={tool} />,
};

const toolRenderers = [terminalRenderer, readRenderer, editRenderer, searchRenderer, genericRenderer];

export function resolveToolRenderer(tool: ToolCallState): ToolRendererDefinition {
  return toolRenderers.find((renderer) => renderer.supports(tool)) ?? genericRenderer;
}

export function ToolCategoryIcon({ category }: { category: ToolPresentation["category"] }) {
  if (category === "terminal") return <Braces size={15} />;
  if (category === "read") return <FileText size={15} />;
  if (category === "edit") return <FilePenLine size={15} />;
  if (category === "search") return <Search size={15} />;
  return <Wrench size={15} />;
}

export function ToolDetailRenderer({ tool }: { tool: ToolCallState }) {
  return resolveToolRenderer(tool).renderDetail(tool);
}
