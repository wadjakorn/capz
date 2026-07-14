"use client";

import { ChevronDown, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import {
  zoomAtViewportCenter,
  zoomToFit,
  zoomTo100,
  setZoom,
  scaleToSlider,
  sliderToScale,
  SLIDER_TICK_100,
} from "@/lib/zoom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToolButton } from "./ToolButton";

// Shared 32px hit target, matching every other toolbar button.
const HIT =
  "flex h-8 items-center justify-center rounded-lg border border-transparent text-[var(--fg-2)] transition-all hover:bg-[var(--surface-raised)] hover:text-[var(--fg)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--fg-2)]";

export function ZoomMenuButton({
  displayScale,
  disabled,
}: {
  displayScale: number;
  disabled?: boolean;
}) {
  const pct = displayScale > 0 ? Math.round(displayScale * 100) : null;
  const sliderValue = scaleToSlider(displayScale > 0 ? displayScale : 1);

  return (
    <div className="inline-flex items-center gap-1">
      <ToolButton
        icon={Maximize2}
        label="Fit to window"
        hint="⌘0"
        disabled={disabled}
        onClick={() => zoomToFit()}
      />
      <button
        type="button"
        onClick={() => zoomTo100()}
        disabled={disabled}
        title="Zoom to 100% (⌘1)"
        aria-label="Zoom to 100%"
        className={`${HIT} w-8 text-[11px] font-semibold tabular-nums`}
      >
        1:1
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              disabled={disabled}
              title="Set zoom"
              aria-label="Set zoom"
              className={`${HIT} gap-1 px-2 text-xs tabular-nums`}
            >
              {pct !== null ? `${pct}%` : "—"}
              <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
            </button>
          }
        />
        <DropdownMenuContent align="end" className="w-56 p-2">
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => zoomAtViewportCenter(1 / 1.2)}
              title="Zoom out (⌘−)"
              aria-label="Zoom out"
              className={`${HIT} w-8 shrink-0`}
            >
              <ZoomOut className="h-4 w-4" aria-hidden />
            </button>

            {/* Log-scaled zoom slider with a 100% landmark tick. */}
            <div className="relative flex-1">
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-[var(--fg-2)]/40"
                style={{ left: `${SLIDER_TICK_100 * 100}%` }}
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={sliderValue}
                disabled={disabled}
                aria-label="Zoom level"
                onChange={(e) => setZoom(sliderToScale(Number(e.target.value)))}
                className="relative w-full accent-[var(--accent)]"
              />
            </div>

            <button
              type="button"
              onClick={() => zoomAtViewportCenter(1.2)}
              title="Zoom in (⌘+)"
              aria-label="Zoom in"
              className={`${HIT} w-8 shrink-0`}
            >
              <ZoomIn className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="px-1 text-center text-[10px] tabular-nums text-muted-foreground">
            {pct !== null ? `${pct}%` : "—"}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
