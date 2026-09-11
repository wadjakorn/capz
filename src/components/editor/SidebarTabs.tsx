"use client";

import { Clock, Image as ImageIcon } from "lucide-react";

import type { ToolPanelInfo } from "@/stores/sidebar";

/** The two panels that are always there, plus the transient tool panel. */
export type SidebarTab = "canvas" | "history" | "tool";

export type SidebarTabsProps = {
  active: SidebarTab;
  /** Present only while a tool or selection has options of its own. */
  toolPanel: ToolPanelInfo | null;
  onSelect: (tab: SidebarTab) => void;
};

/**
 * Panel switcher at the head of the sidebar.
 *
 * **Underlines, not pills.** The History panel already carries two pill groups
 * of its own (the All/Saved/Captures filter and the list/grid switch); a third
 * pill group stacked above them would say nothing about which control governs
 * which. Here the shape carries the hierarchy: an underline moves between
 * *panels*, a pill chooses *within* one.
 *
 * The tool tab is icon-only and sits last, so Canvas and History never move.
 * The icon repeats the one just clicked in the toolbar, which is both the
 * shortest possible label and an honest signal that this tab is contextual —
 * it is the only one that comes and goes.
 */
export function SidebarTabs({ active, toolPanel, onSelect }: SidebarTabsProps) {
  const ToolIcon = toolPanel?.icon;
  return (
    <div
      role="tablist"
      aria-label="Sidebar panels"
      className="flex flex-none items-stretch gap-3"
    >
      <Tab
        id="canvas"
        active={active === "canvas"}
        onSelect={onSelect}
        icon={<ImageIcon className="h-3.5 w-3.5" aria-hidden />}
        label="Canvas"
      />
      <Tab
        id="history"
        active={active === "history"}
        onSelect={onSelect}
        icon={<Clock className="h-3.5 w-3.5" aria-hidden />}
        label="History"
      />
      <span className="flex-1" />
      {toolPanel && ToolIcon && (
        <Tab
          id="tool"
          active={active === "tool"}
          onSelect={onSelect}
          icon={<ToolIcon className="h-4 w-4" aria-hidden />}
          label={toolPanel.label}
          iconOnly
        />
      )}
    </div>
  );
}

function Tab({
  id,
  active,
  onSelect,
  icon,
  label,
  iconOnly,
}: {
  id: SidebarTab;
  active: boolean;
  onSelect: (t: SidebarTab) => void;
  icon: React.ReactNode;
  label: string;
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={`sidebar-panel-${id}`}
      title={iconOnly ? `${label} options` : label}
      aria-label={iconOnly ? `${label} options` : undefined}
      onClick={() => onSelect(id)}
      className={`relative -mb-px flex items-center gap-1.5 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
        iconOnly ? "px-1.5" : "px-0.5"
      } ${
        active
          ? "text-[var(--fg)]"
          : "text-[var(--fg-3)] hover:text-[var(--fg-2)]"
      }`}
    >
      {icon}
      {!iconOnly && label}
      <span
        aria-hidden
        className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full transition-colors ${
          active ? "bg-[var(--accent)]" : "bg-transparent"
        }`}
      />
    </button>
  );
}
