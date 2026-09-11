"use client";

import { ImageIcon, Layers } from "lucide-react";

/**
 * Drop target shown while a capture-history row is being dragged.
 *
 * Visibility is driven by `data-on` written straight to the DOM by the drag
 * handler in CaptureHistorySection, not by React state: the pointer moves at
 * frame rate and re-rendering the editor page for each move would fight the
 * Konva stage for the main thread.
 */
export function CanvasDropHint() {
  return (
    <div
      id="canvas-drop-hint"
      data-on="false"
      data-mode="base"
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 hidden place-items-center bg-[var(--accent-soft)] data-[on=true]:grid"
    >
      <div className="absolute inset-3 rounded-xl border-2 border-dashed border-[var(--accent)]" />
      <div className="surface relative inline-flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium shadow-[var(--elev-3)]">
        <span className="group-data-[mode=layer]:hidden" />
        <Layers
          className="hidden h-4 w-4 text-[var(--accent)] [[data-mode=layer]_&]:block"
          aria-hidden
        />
        <ImageIcon
          className="hidden h-4 w-4 text-[var(--accent)] [[data-mode=base]_&]:block"
          aria-hidden
        />
        <span className="hidden [[data-mode=layer]_&]:inline">
          Drop to add as a layer
        </span>
        <span className="hidden [[data-mode=base]_&]:inline">
          Drop to open as the main image
        </span>
      </div>
    </div>
  );
}
