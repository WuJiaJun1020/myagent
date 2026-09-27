import { Check, ChevronDown, ShieldCheck } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { HoverHint } from "../../components/ui/tooltip";
import { useComposerPopover } from "./use-composer-popover";

const policies = [
  { value: "ask", label: "请求批准", description: "每次工具调用前等待你的确认" },
  { value: "auto", label: "自动批准", description: "直接调用当前会话已启用的工具" },
] as const;
type ApprovalPolicy = typeof policies[number]["value"];

export function ComposerApprovalControl({ value, disabled, onChange }: {
  value: ApprovalPolicy;
  disabled: boolean;
  onChange: (value: ApprovalPolicy) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusIndex = useRef(0);
  const position = useComposerPopover(open, triggerRef, popoverRef);
  const selected = policies.find((policy) => policy.value === value)!;

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function show(index = policies.findIndex((policy) => policy.value === value)) {
    focusIndex.current = index;
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (open) optionRefs.current[focusIndex.current]?.focus();
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = optionRefs.current.findIndex((option) => option === document.activeElement);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = (current + 1) % policies.length;
    if (event.key === "ArrowUp") next = (current + policies.length - 1) % policies.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = policies.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      optionRefs.current[next]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") {
      close(true);
    }
  }

  return <>
    <HoverHint content={`${selected.label}：${selected.description}`} disabled={open}>
      <button
        ref={triggerRef}
        className={`approval-select ${value} ${open ? "open" : ""}`}
        type="button"
        disabled={disabled}
        aria-label={`工具批准策略：${selected.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => open ? close() : show()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show(event.key === "ArrowDown" ? 0 : policies.length - 1);
          }
        }}
      >
        <span className="approval-select-icon"><ShieldCheck size={13} /></span>
        <span className="approval-select-label">{selected.label}</span>
        <ChevronDown size={11} />
      </button>
    </HoverHint>
    {open && createPortal(
      <div ref={popoverRef} id={menuId} className="composer-approval-popover composer-popover" role="menu" aria-label="工具批准策略" style={position} onKeyDown={handleMenuKeyDown}>
        {policies.map((policy, index) => <button
          ref={(element) => { optionRefs.current[index] = element; }}
          key={policy.value}
          type="button"
          role="menuitemradio"
          aria-checked={value === policy.value}
          tabIndex={-1}
          disabled={disabled}
          onClick={() => { close(true); if (policy.value !== value) onChange(policy.value); }}
        >
          <span><strong>{policy.label}</strong><small>{policy.description}</small></span>
          {value === policy.value && <Check size={15} />}
        </button>)}
      </div>, document.body,
    )}
  </>;
}
