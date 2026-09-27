import { useLayoutEffect, useState, type RefObject } from "react";
import { composerPopoverPosition } from "./composer-popover-position";

/** Keep the popup centered when the window or the adjacent review pane resizes. */
export function useComposerPopover(
  open: boolean,
  triggerRef: RefObject<HTMLButtonElement | null>,
  popoverRef: RefObject<HTMLDivElement | null>,
) {
  const [position, setPosition] = useState({ left: 12, bottom: 64, maxHeight: 430 });
  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!open || !trigger || !popover) return;
    const update = () => setPosition(composerPopoverPosition(
      trigger.getBoundingClientRect(),
      popover.getBoundingClientRect().width,
      { width: window.innerWidth, height: window.innerHeight },
    ));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(trigger);
    observer.observe(popover);
    const composer = trigger.closest(".composer-shell");
    if (composer) observer.observe(composer);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, triggerRef, popoverRef]);
  return position;
}
