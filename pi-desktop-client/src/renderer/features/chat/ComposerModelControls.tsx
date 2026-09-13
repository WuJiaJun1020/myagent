import { Check, ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DesktopModel, ThinkingLevel } from "../../../shared/contracts/agent-session";
import { normalizeThinkingLevels } from "../../../shared/thinking-levels";
import { useAgentStore } from "../../stores/agent-store";
import { useSessionStore } from "../../stores/session-store";

const thinkingLabels: Record<ThinkingLevel, string> = {
  off: "关闭",
  minimal: "最少",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "超高",
  max: "最大",
};

function groupModels(models: DesktopModel[]): Array<[string, DesktopModel[]]> {
  const groups = new Map<string, DesktopModel[]>();
  for (const model of models) groups.set(model.provider, [...(groups.get(model.provider) ?? []), model]);
  return [...groups.entries()];
}

export function ComposerModelControls() {
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ right: 12, bottom: 64 });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const busy = useAgentStore((state) => state.busy);
  const session = useSessionStore((state) => state.session);
  const models = useSessionStore((state) => state.models);
  const thinkingLevels = useSessionStore((state) => state.thinkingLevels);
  const mutation = useSessionStore((state) => state.mutation);
  const selectModel = useSessionStore((state) => state.selectModel);
  const selectThinkingLevel = useSessionStore((state) => state.selectThinkingLevel);
  const controlsDisabled = busy || Boolean(mutation) || !session;
  const availableThinkingLevels = normalizeThinkingLevels(thinkingLevels, session?.thinkingLevel);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const positionPopover = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPopoverPosition({
        right: Math.max(12, window.innerWidth - rect.right),
        bottom: Math.max(12, window.innerHeight - rect.top + 8),
      });
    };
    positionPopover();
    window.addEventListener("resize", positionPopover);
    return () => window.removeEventListener("resize", positionPopover);
  }, [open]);

  return (
    <div className={`composer-model-control ${open ? "open" : ""}`} ref={rootRef}>
      <button
        className="composer-model-trigger"
        ref={triggerRef}
        type="button"
        disabled={!session || models.length === 0}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="选择模型与思考深度"
        onClick={() => setOpen((value) => !value)}
      >
        <Sparkles size={13} />
        <span className="composer-model-name">{session?.model?.name ?? "选择模型"}</span>
        <span className="composer-thinking-label">{thinkingLabels[session?.thinkingLevel ?? "off"]}</span>
        <ChevronDown size={12} />
      </button>

      {open && createPortal(
        <div
          className="composer-model-popover"
          ref={popoverRef}
          role="dialog"
          aria-label="选择模型与思考深度"
          aria-busy={controlsDisabled}
          style={popoverPosition}
        >
          <section className="composer-model-section">
            <header>模型</header>
            <div className="composer-model-list">
              {groupModels(models).map(([provider, providerModels]) => (
                <div className="composer-model-group" key={provider}>
                  <small>{provider}</small>
                  {providerModels.map((model) => {
                    const active = session?.model?.provider === model.provider && session.model.id === model.id;
                    return (
                      <button
                        type="button"
                        className={active ? "active" : ""}
                        disabled={controlsDisabled}
                        aria-pressed={active}
                        key={`${model.provider}/${model.id}`}
                        onClick={() => void selectModel(model.provider, model.id)}
                      >
                        <span>{model.name}</span>
                        {active && <Check size={14} />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>

          <section className="composer-thinking-section">
            <header>思考深度</header>
            <div>
              {availableThinkingLevels.map((level) => (
                <button
                  type="button"
                  className={session?.thinkingLevel === level ? "active" : ""}
                  disabled={controlsDisabled}
                  aria-pressed={session?.thinkingLevel === level}
                  key={level}
                  onClick={() => void selectThinkingLevel(level)}
                >
                  {thinkingLabels[level]}
                </button>
              ))}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
