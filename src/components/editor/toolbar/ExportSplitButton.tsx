"use client";

import { useEffect, useState } from "react";
import {
  Copy as CopyIcon,
  Save,
  SaveAll,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { currentPlatform, formatShortcut, type Platform } from "@/lib/shortcuts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ExportAction = "copy" | "file" | "both";

const ACTIONS: {
  action: ExportAction;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
}[] = [
  { action: "copy", label: "Copy", icon: CopyIcon, shortcut: "CmdOrCtrl+C" },
  { action: "file", label: "Save", icon: Save },
  { action: "both", label: "Save & Copy", icon: SaveAll },
];

/**
 * Output as one split button: the primary runs the last-used export action,
 * the chevron opens the other two. Copy / Save / Save & Copy are three flavors
 * of a single terminal action (export), done once at the end — so they collapse
 * into one control the same way capture-kind does, instead of three equal
 * buttons implying three separate jobs.
 */
export function ExportSplitButton({
  lastAction,
  onExport,
  disabled,
}: {
  lastAction: ExportAction;
  onExport: (action: ExportAction) => void;
  disabled?: boolean;
}) {
  const primary = ACTIONS.find((a) => a.action === lastAction) ?? ACTIONS[0];
  const PrimaryIcon = primary.icon;

  // Shortcut glyphs are platform-specific (⌘ vs Ctrl). navigator is absent
  // during prerender, so pin to the prerender value ("win") until mounted to
  // avoid a hydration mismatch, then switch to the real platform.
  const [platform, setPlatform] = useState<Platform>("win");
  useEffect(() => setPlatform(currentPlatform()), []);

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-lg">
      <button
        type="button"
        onClick={() => onExport(primary.action)}
        disabled={disabled}
        title={
          primary.shortcut
            ? `${primary.label} (${formatShortcut(primary.shortcut, platform)})`
            : primary.label
        }
        aria-label={primary.label}
        className="flex h-8 w-8 items-center justify-center text-foreground/80 transition-colors hover:bg-[var(--surface-raised)] hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <PrimaryIcon className="h-4 w-4" aria-hidden />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              title="Output options"
              aria-label="Output options"
              disabled={disabled}
              className="flex h-8 w-4 items-center justify-center text-foreground/60 transition-colors hover:bg-[var(--surface-raised)] hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <ChevronDown className="h-3 w-3" aria-hidden />
            </button>
          }
        />
        <DropdownMenuContent align="start">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <DropdownMenuItem key={a.action} onClick={() => onExport(a.action)}>
                <Icon aria-hidden />
                <span>{a.label}</span>
                {a.shortcut ? (
                  <DropdownMenuShortcut>
                    {formatShortcut(a.shortcut, platform)}
                  </DropdownMenuShortcut>
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
