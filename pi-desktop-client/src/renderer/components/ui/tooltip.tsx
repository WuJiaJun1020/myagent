import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useState, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 7,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "app-tooltip",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export function HoverHint({ content, children, disabled = false, side }: { content: ReactNode; children: ReactElement; disabled?: boolean; side?: ComponentProps<typeof TooltipPrimitive.Content>["side"] }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open && !disabled} onOpenChange={setOpen}>
      <TooltipTrigger asChild aria-description={typeof content === "string" ? content : undefined}>{children}</TooltipTrigger>
      <TooltipContent collisionPadding={12} side={side}>{content}</TooltipContent>
    </Tooltip>
  );
}

/** Keep the native button in place so parent grid/flex and direct-child styles still apply. */
export function HintButton({ hint, ...props }: ComponentProps<"button"> & { hint: ReactNode }) {
  return <HoverHint content={hint}><button aria-label={typeof hint === "string" ? hint : undefined} {...props} /></HoverHint>;
}
