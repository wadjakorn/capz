"use client";

import { useEffect, useState } from "react";
import {
  Monitor,
  Crop,
  AppWindow,
  ChevronDown,
  ScrollText,
  Crosshair,
  Layers,
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

/**
 * `replace` — the capture becomes the new workspace, discarding what is there.
 * `layer`   — the capture is added as a new image layer over the existing
 *             canvas, leaving the base image and its annotations alone.
 *
 * Both variants offer the same set of capture kinds; the variant only decides
 * where the resulting image lands, and is carried through the capture
 * round-trip by Rust (see `AppState::pending_layer`).
 */
export type CaptureVariant = "replace" | "layer";

export function CaptureSplitButton({
  variant = "replace",
  disabled = false,
  disabledReason,
  lastKind,
  onCapture,
  onScrollCapture,
  onSystemAreaCapture,
  systemAreaAccelerator,
  accelerators,
}: {
  variant?: CaptureVariant;
  /** Greys out the whole control (both halves) and suppresses the menu. */
  disabled?: boolean;
  /** Tooltip explaining why the control is disabled. */
  disabledReason?: string;
  lastKind: CaptureKind;
  onCapture: (kind: CaptureKind) => void;
  /** Start a scrolling (long-page) capture. Kept out of `CaptureKind` so it
   * never becomes the persisted primary/last kind. */
  onScrollCapture?: () => void;
  /** Start a macOS system area capture (`screencapture -i`) — a separate mode
   * from the remembered-region area capture. Kept out of `CaptureKind` so it
   * never becomes the persisted primary/last kind, and only passed on macOS
   * (the caller gates on platform), so the item is hidden elsewhere. */
  onSystemAreaCapture?: () => void;
  /** Accelerator glyph for the system area item (may be "" when unbound). */
  systemAreaAccelerator?: string;
  accelerators: Record<CaptureKind, string>;
}) {
  // Shortcut glyphs are platform-specific (⌘ vs Ctrl). navigator is absent
  // during prerender, so pin to the prerender value ("win") until mounted to
  // avoid a hydration mismatch, then switch to the real platform.
  const [platform, setPlatform] = useState<Platform>("win");
  useEffect(() => setPlatform(currentPlatform()), []);

  const layer = variant === "layer";
  const primary = KINDS.find((k) => k.kind === lastKind) ?? KINDS[0];
  // The layer variant leads with a single Layers glyph: what distinguishes it
  // is the destination, not the capture kind, and reusing the replace icons
  // would make the two buttons indistinguishable at a glance.
  const PrimaryIcon = layer ? Layers : primary.icon;
  const label = (base: string) => (layer ? `${base} as a layer` : base);
  const primaryLabel = label(primary.label);
  const primaryTitle = disabled
    ? (disabledReason ?? primaryLabel)
    : `${primaryLabel} (${formatShortcut(accelerators[primary.kind], platform)})`;

  return (
    <div
      className="inline-flex items-stretch overflow-hidden rounded-lg"
      title={disabled ? disabledReason : undefined}
    >
      <button
        type="button"
        onClick={() => onCapture(primary.kind)}
        disabled={disabled}
        title={primaryTitle}
        aria-label={primaryLabel}
        className="flex h-8 w-8 items-center justify-center text-foreground/80 transition-colors hover:bg-[var(--surface-raised)] hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <PrimaryIcon className="h-4 w-4" aria-hidden />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              disabled={disabled}
              title={disabled ? disabledReason : label("Capture options")}
              aria-label={label("Capture options")}
              className="flex h-8 w-4 items-center justify-center text-foreground/60 transition-colors hover:bg-[var(--surface-raised)] hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
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
                <span>{label(k.label)}</span>
                <DropdownMenuShortcut>
                  {formatShortcut(accelerators[k.kind], platform)}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            );
          })}
          {onSystemAreaCapture ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onSystemAreaCapture()}>
                <Crosshair aria-hidden />
                <span>{label("System area capture")}</span>
                {systemAreaAccelerator ? (
                  <DropdownMenuShortcut>
                    {formatShortcut(systemAreaAccelerator, platform)}
                  </DropdownMenuShortcut>
                ) : null}
              </DropdownMenuItem>
            </>
          ) : null}
          {onScrollCapture ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onScrollCapture()}>
                <ScrollText aria-hidden />
                <span>{label("Scrolling capture")}</span>
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
