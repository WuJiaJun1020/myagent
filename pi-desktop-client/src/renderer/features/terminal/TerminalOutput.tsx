import { CircleAlert, LoaderCircle, TerminalSquare } from "lucide-react";
import { useMemo } from "react";

const MAX_RENDERED_OUTPUT = 100_000;

type TerminalOutputProps = {
  command?: string;
  output: string;
  status: "running" | "done" | "error";
};

export function TerminalOutput({ command, output, status }: TerminalOutputProps) {
  const visibleOutput = useMemo(() => output.length > MAX_RENDERED_OUTPUT
    ? `${output.slice(output.length - MAX_RENDERED_OUTPUT)}\n\n[终端输出过长，仅展示最后 100,000 个字符]`
    : output, [output]);
  return (
    <section className={`terminal-output ${status}`}>
      <header>
        <span><TerminalSquare size={13} />Terminal</span>
        <span>
          {status === "running" && <LoaderCircle className="spin" size={12} />}
          {status === "error" && <CircleAlert size={12} />}
          {status === "done" ? "已完成" : status === "error" ? "失败" : "运行中"}
        </span>
      </header>
      {command && <div className="terminal-command"><span>$</span>{command}</div>}
      <pre>{visibleOutput || (status === "running" ? "等待命令输出…" : "命令没有返回文本输出。")}</pre>
    </section>
  );
}
