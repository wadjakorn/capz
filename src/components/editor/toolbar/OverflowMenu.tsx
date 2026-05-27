"use client";

import { MoreHorizontal, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type OverflowItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export function OverflowMenu({ items }: { items: OverflowItem[] }) {
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title="More tools"
            aria-label="More tools"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent align="end">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <DropdownMenuItem
              key={it.key}
              onClick={it.onSelect}
              disabled={it.disabled}
              className={it.active ? "bg-violet-500/25 text-white" : undefined}
            >
              <Icon aria-hidden />
              <span>{it.label}</span>
              {it.hint ? <DropdownMenuShortcut>{it.hint}</DropdownMenuShortcut> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
