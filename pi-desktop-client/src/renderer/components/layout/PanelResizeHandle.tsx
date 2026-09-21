import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";

type ResizePreviewTarget = {
  readonly current: HTMLElement | null;
};

type PanelResizeHandleProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  direction: "right" | "left";
  oppositeMin?: number;
  previewTarget: ResizePreviewTarget;
  previewProperty: `--${string}`;
  onCommit: (value: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function PanelResizeHandle({
  label,
  value,
  min,
  max,
  direction,
  oppositeMin,
  previewTarget,
  previewProperty,
  onCommit,
}: PanelResizeHandleProps) {
  const cancelActiveResizeRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelActiveResizeRef.current?.(), []);

  function availableMax(element: HTMLDivElement): number {
    if (oppositeMin === undefined) return max;
    const containerWidth = element.parentElement?.getBoundingClientRect().width;
    if (!containerWidth) return max;
    return Math.max(min, Math.min(max, containerWidth - oppositeMin - element.getBoundingClientRect().width));
  }

  function beginResize(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    cancelActiveResizeRef.current?.();
    const startX = event.clientX;
    const pointerId = event.pointerId;
    const resizeMax = availableMax(event.currentTarget);
    const startValue = clamp(value, min, resizeMax);
    let pendingValue = startValue;
    let previewedValue = startValue;
    let animationFrame: number | null = null;
    let stopped = false;
    document.body.classList.add("is-resizing-panel");

    const preview = (nextValue: number): void => {
      previewedValue = nextValue;
      previewTarget.current?.style.setProperty(previewProperty, `${nextValue}px`);
    };
    const flushPreview = (): void => {
      animationFrame = null;
      if (pendingValue !== previewedValue) preview(pendingValue);
    };
    const move = (moveEvent: globalThis.PointerEvent): void => {
      if (moveEvent.pointerId !== pointerId) return;
      const distance = direction === "right" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      pendingValue = Math.round(clamp(startValue + distance, min, resizeMax));
      if (animationFrame === null) animationFrame = window.requestAnimationFrame(flushPreview);
    };
    const cleanup = (): void => {
      if (stopped) return;
      stopped = true;
      document.body.classList.remove("is-resizing-panel");
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      cancelActiveResizeRef.current = null;
    };
    const stop = (stopEvent: globalThis.PointerEvent): void => {
      if (stopEvent.pointerId !== pointerId) return;
      if (pendingValue !== previewedValue) preview(pendingValue);
      cleanup();
      if (pendingValue !== value) onCommit(pendingValue);
    };
    cancelActiveResizeRef.current = () => {
      preview(startValue);
      cleanup();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const movement = event.key === "ArrowRight" ? 12 : -12;
    onCommit(clamp(value + (direction === "right" ? movement : -movement), min, availableMax(event.currentTarget)));
  }

  return (
    <div
      className="panel-resize-handle"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={beginResize}
      onKeyDown={resizeWithKeyboard}
    >
      <span />
    </div>
  );
}
