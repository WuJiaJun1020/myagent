import { BrainCircuit, ChevronDown } from "lucide-react";

type ThinkingBlockProps = {
  text: string;
  streaming: boolean;
  redacted?: boolean;
};

export function ThinkingBlock({ text, streaming, redacted }: ThinkingBlockProps) {
  return (
    <details className="thinking-block" open={streaming}>
      <summary>
        <span><BrainCircuit size={14} />{streaming ? "Pi 正在思考" : "思考过程"}</span>
        <ChevronDown size={14} className="thinking-chevron" />
      </summary>
      <div className="thinking-content">
        {redacted ? "该思考内容已由模型提供方隐藏。" : text || "正在等待模型输出可展示的思考内容…"}
      </div>
    </details>
  );
}
