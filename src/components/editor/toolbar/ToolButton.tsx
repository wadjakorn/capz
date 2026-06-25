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
          ? "border-transparent bg-[var(--accent)] text-[var(--accent-fg)]"
          : pressed
            ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent)]"
            : "border-transparent text-[var(--fg-2)] hover:bg-[var(--surface-raised)] hover:text-[var(--fg)]",
      ].join(" ")}
    >
      <Icon className={["h-4 w-4", iconClassName ?? ""].join(" ").trim()} aria-hidden />
    </button>
  );
}
