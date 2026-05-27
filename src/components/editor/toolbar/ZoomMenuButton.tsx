"use client";

import { ChevronDown, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { zoomAtViewportCenter, zoomToFit, zoomTo100, setZoom } from "@/lib/zoom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ZoomMenuButton({
  displayScale,
  disabled,
}: {
  displayScale: number;
  disabled?: boolean;
}) {
  const pct = displayScale > 0 ? Math.round(displayScale * 100) : null;

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-lg">
      <button
        type="button"
        onClick={() => zoomTo100()}
        disabled={disabled}
        title="Zoom to 100% (⌘1)"
        aria-label="Zoom to 100%"
        className="min-w-[44px] px-2 py-1 text-xs tabular-nums text-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
      >
        {pct !== null ? `${pct}%` : "—"}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              disabled={disabled}
              title="Zoom options"
              aria-label="Zoom options"
              className="flex h-8 w-4 items-center justify-center text-foreground/60 transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronDown className="h-3 w-3" aria-hidden />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => zoomAtViewportCenter(1 / 1.2)}>
            <ZoomOut aria-hidden />
            <span>Zoom out</span>
            <DropdownMenuShortcut>⌘−</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => zoomAtViewportCenter(1.2)}>
            <ZoomIn aria-hidden />
            <span>Zoom in</span>
            <DropdownMenuShortcut>⌘+</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => zoomToFit()}>
            <Maximize2 aria-hidden />
            <span>Fit to window</span>
            <DropdownMenuShortcut>⌘0</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => zoomTo100()}>
            <span className="h-3.5 w-3.5 text-center text-[10px] font-semibold leading-[14px]">1</span>
            <span>Zoom to 100%</span>
            <DropdownMenuShortcut>⌘1</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-[10px] text-muted-foreground">Set zoom</div>
          <div className="px-2 pb-1.5">
            <input
              type="number"
              defaultValue={pct ?? 100}
              min={10}
              max={1600}
              step={10}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = parseInt((e.target as HTMLInputElement).value, 10);
                  if (Number.isFinite(v) && v > 0) {
                    setZoom(v / 100);
                  }
                }
              }}
              onBlur={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v) && v > 0) {
                  setZoom(v / 100);
                }
              }}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-foreground outline-none focus:border-violet-400"
            />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
