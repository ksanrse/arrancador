import * as React from "react";
import { cn } from "@/lib/utils";

type SwitchProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> & {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { checked, onCheckedChange, className, disabled, onClick, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full border transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        checked
          ? "bg-primary/90 border-primary/60 shadow-[0_0_14px_hsl(var(--primary)/0.35)]"
          : "bg-muted/60 border-border",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      onClick={(event) => {
        if (!disabled) {
          onCheckedChange?.(!checked);
        }
        onClick?.(event);
      }}
      {...props}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  ),
);

Switch.displayName = "Switch";
