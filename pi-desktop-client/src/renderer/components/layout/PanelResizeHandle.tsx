import type { KeyboardEvent, PointerEvent } from "react";

type PanelResizeHandleProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  direction: "right" | "left";
  onChange: (value: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function PanelResizeHandle({ label, value, min, max, direction, onChange }: PanelResizeHandleProps) {
  function beginResize(event: PointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    const startX = event.clientX;
    const startValue = value;
    document.body.classList.add("is-resizing-panel");

    const move = (moveEvent: globalThis.PointerEvent): void => {
      const distance = direction === "right" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      onChange(clamp(startValue + distance, min, max));
    };
    const stop = (): void => {
      document.body.classList.remove("is-resizing-panel");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const movement = event.key === "ArrowRight" ? 12 : -12;
    onChange(clamp(value + (direction === "right" ? movement : -movement), min, max));
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
