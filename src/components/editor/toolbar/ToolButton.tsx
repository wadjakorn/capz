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
};

export function ToolButton({
  icon: Icon,
  label,
  hint,
  active,
  disabled,
  pressed,
  onClick,
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
        "flex h-8 w-8 items-center justify-center rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent",
        active
          ? "bg-gradient-to-b from-violet-400 to-violet-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_rgba(124,58,237,0.45)]"
          : pressed
            ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/40"
            : "text-foreground/75 hover:bg-white/10 hover:text-foreground",
      ].join(" ")}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
