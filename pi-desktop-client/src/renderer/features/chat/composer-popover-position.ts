export function composerPopoverPosition(
  anchor: { left: number; top: number; width: number },
  popoverWidth: number,
  viewport: { width: number; height: number },
) {
  const margin = 12;
  const gap = 8;
  const left = anchor.left + (anchor.width - popoverWidth) / 2;
  return {
    left: Math.max(margin, Math.min(left, viewport.width - popoverWidth - margin)),
    bottom: Math.max(margin, viewport.height - anchor.top + gap),
    maxHeight: Math.max(0, Math.min(430, anchor.top - gap - margin)),
  };
}
