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
        "flex h-8 w-8 items-center justify-center rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent",
        active
          ? "bg-neutral-100 text-neutral-900"
          : pressed
            ? "bg-neutral-800 text-sky-300"
            : "text-neutral-300 hover:bg-neutral-800",
      ].join(" ")}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
