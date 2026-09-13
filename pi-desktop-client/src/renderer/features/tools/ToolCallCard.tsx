import { motion } from "framer-motion";
import { Check, ChevronRight, CircleAlert, LoaderCircle } from "lucide-react";
import type { ToolCallState } from "../../lib/event-reducer";
import { useSettingsStore } from "../../stores/settings-store";
import { useUiStore } from "../../stores/ui-store";
import { useResourceStore } from "../../stores/resource-store";
import { resolveToolRenderer, ToolCategoryIcon } from "./ToolRenderer";

type ToolCallCardProps = {
  tool: ToolCallState;
};

export function ToolCallCard({ tool }: ToolCallCardProps) {
  const detailSelection = useUiStore((state) => state.detailSelection);
  const selectToolCall = useUiStore((state) => state.selectToolCall);
  const animationEnabled = useSettingsStore((state) => state.animationEnabled);
  const source = useResourceStore((state) => state.tools.find((item) => item.name === tool.name)?.source);
  const outputPreview = tool.output.find((block) => block.type === "text");
  const presentation = resolveToolRenderer(tool).present(tool);
  const status = {
    running: { label: "运行中", icon: <LoaderCircle className="spin" size={14} /> },
    done: { label: "完成", icon: <Check size={14} /> },
    error: { label: "失败", icon: <CircleAlert size={14} /> },
  }[tool.status];

  return (
    <motion.button
      className={`tool-card ${tool.status} ${detailSelection?.type === "tool" && detailSelection.id === tool.id ? "selected" : ""}`}
      type="button"
      layout={animationEnabled ? "position" : false}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: animationEnabled ? 0.18 : 0 }}
      onClick={() => selectToolCall(tool.id)}
    >
      <span className={`tool-icon ${presentation.category}`}><ToolCategoryIcon category={presentation.category} /></span>
      <span className="tool-card-copy">
        <span className="tool-card-heading"><strong>{presentation.label}</strong>{source && <span className={`tool-source-badge compact ${source.kind}`}>{source.label}</span>}<span className="tool-status">{status.icon}{status.label}</span></span>
        <span className="tool-args">{presentation.summary}</span>
        {outputPreview && <span className="tool-preview">{outputPreview.text.slice(0, 240)}</span>}
      </span>
      <ChevronRight size={16} className="tool-chevron" />
    </motion.button>
  );
}
