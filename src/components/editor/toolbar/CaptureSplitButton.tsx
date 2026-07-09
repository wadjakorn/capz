"use client";

import { useEffect, useState } from "react";
import {
  Monitor,
  Crop,
  AppWindow,
  ChevronDown,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import { currentPlatform, formatShortcut, type Platform } from "@/lib/shortcuts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CaptureKind = "full" | "area" | "window";

const KINDS: { kind: CaptureKind; label: string; icon: LucideIcon }[] = [
  { kind: "full", label: "Capture full screen", icon: Monitor },
  { kind: "area", label: "Capture area", icon: Crop },
  { kind: "window", label: "Capture window", icon: AppWindow },
];

export function CaptureSplitButton({
  lastKind,
  onCapture,
  onScrollCapture,
  accelerators,
}: {
  lastKind: CaptureKind;
  onCapture: (kind: CaptureKind) => void;
  /** Start a scrolling (long-page) capture. Kept out of `CaptureKind` so it
   * never becomes the persisted primary/last kind. */
  onScrollCapture?: () => void;
  accelerators: Record<CaptureKind, string>;
}) {
  const primary = KINDS.find((k) => k.kind === lastKind) ?? KINDS[0];
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
        onClick={() => onCapture(primary.kind)}
        title={`${primary.label} (${formatShortcut(accelerators[primary.kind], platform)})`}
        aria-label={primary.label}
        className="flex h-8 w-8 items-center justify-center text-foreground/80 transition-colors hover:bg-[var(--surface-raised)] hover:text-foreground"
      >
        <PrimaryIcon className="h-4 w-4" aria-hidden />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              title="Capture options"
              aria-label="Capture options"
              className="flex h-8 w-4 items-center justify-center text-foreground/60 transition-colors hover:bg-[var(--surface-raised)] hover:text-foreground"
            >
              <ChevronDown className="h-3 w-3" aria-hidden />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          {KINDS.map((k) => {
            const Icon = k.icon;
            return (
              <DropdownMenuItem
                key={k.kind}
                onClick={() => onCapture(k.kind)}
              >
                <Icon aria-hidden />
                <span>{k.label}</span>
                <DropdownMenuShortcut>
                  {formatShortcut(accelerators[k.kind], platform)}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            );
          })}
          {onScrollCapture ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onScrollCapture()}>
                <ScrollText aria-hidden />
                <span>Scrolling capture</span>
                <span
                  className="ml-1.5 rounded-full px-1.5 py-px text-[10px] font-semibold uppercase leading-none tracking-wide"
                  style={{
                    color: "var(--accent)",
                    background: "color-mix(in srgb, var(--accent) 18%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                  }}
                >
                  Beta
                </span>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
