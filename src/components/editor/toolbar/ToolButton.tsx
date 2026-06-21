"use client";

import type { LucideIcon } from "lucide-react";

export type ToolButtonProps = {
  icon: LucideIcon;
  label: string;
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  iconClassName?: string;
};

export function ToolButton({
  icon: Icon,
  label,
  hint,
  active,
  disabled,
  pressed,
  onClick,
  iconClassName,
}: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint ? `${label} (${hint})` : label}
      aria-label={label}
      aria-pressed={pressed}
      className={[
        "flex h-8 w-8 items-center justify-center rounded-lg border transition-all disabled:opacity-30 disabled:hover:bg-transparent",
        active
          ? "border-white/20 bg-gradient-to-b from-violet-400 to-violet-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_rgba(124,58,237,0.45)]"
          : pressed
            ? "border-violet-400/40 bg-violet-500/25 text-violet-100"
            : "border-transparent text-foreground/80 hover:border-white/10 hover:bg-white/[0.08] hover:text-foreground",
      ].join(" ")}
    >
      <Icon className={["h-4 w-4", iconClassName ?? ""].join(" ").trim()} aria-hidden />
    </button>
  );
}
