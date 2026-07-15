"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Tool } from "@/stores/editor";

export type GroupTool = { id: Tool; label: string; hint: string; icon: LucideIcon };

/**
 * A cluster of related tools collapsed into one split control: the primary
 * button selects/re-selects the group's last-used tool, the chevron opens the
 * rest. Collapsing is what buys back toolbar width at the 1024px minimum — the
 * palette can't show all 11 tools flat once a screenshot's controls are on the
 * row. Primary shows the active tool whenever one in the group is active, so the
 * live selection is never hidden; keyboard shortcuts still hit each tool
 * directly.
 */
export function ToolGroupButton({
  label,
  tools,
  activeTool,
  primaryId,
  onSelect,
}: {
  label: string;
  tools: GroupTool[];
  activeTool: Tool;
  /** Which tool the primary button represents when none in the group is active. */
  primaryId: Tool;
  onSelect: (id: Tool) => void;
}) {
  const active = tools.some((t) => t.id === activeTool);
  // Surface the live tool as primary when it's in this group, else the remembered one.
  const primary =
    tools.find((t) => t.id === activeTool) ??
    tools.find((t) => t.id === primaryId) ??
    tools[0];
  const PrimaryIcon = primary.icon;

  return (
    <div
      className={[
        "inline-flex items-stretch overflow-hidden rounded-lg border transition-all",
        active
          ? "border-transparent bg-[var(--accent)] text-[var(--accent-fg)]"
          : "border-transparent text-[var(--fg-2)]",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => onSelect(primary.id)}
        title={`${primary.label} (${primary.hint})`}
        aria-label={primary.label}
        aria-pressed={active}
        className={[
          "flex h-8 w-8 items-center justify-center transition-colors",
          active ? "hover:bg-black/10" : "hover:bg-[var(--surface-raised)] hover:text-[var(--fg)]",
        ].join(" ")}
      >
        <PrimaryIcon className="h-4 w-4" aria-hidden />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              title={`${label} tools`}
              aria-label={`${label} tools`}
              className={[
                "flex h-8 w-4 items-center justify-center transition-colors",
                active
                  ? "hover:bg-black/10"
                  : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)] hover:text-[var(--fg)]",
              ].join(" ")}
            >
              <ChevronDown className="h-3 w-3" aria-hidden />
            </button>
          }
        />
        <DropdownMenuContent align="start">
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <DropdownMenuItem
                key={t.id}
                onClick={() => onSelect(t.id)}
                className={
                  t.id === activeTool ? "bg-[var(--accent-soft)] text-[var(--accent)]" : undefined
                }
              >
                <Icon aria-hidden />
                <span>{t.label}</span>
                <DropdownMenuShortcut>{t.hint}</DropdownMenuShortcut>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
