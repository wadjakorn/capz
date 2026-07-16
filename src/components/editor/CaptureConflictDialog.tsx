"use client";

import { useEffect } from "react";
import { Images, RefreshCw, X } from "lucide-react";

type Props = {
  open: boolean;
  /** Reset the canvas and load the new capture as the base image. */
  onReplace: () => void;
  /** Keep the current canvas and add the new capture as an overlay layer. */
  onAdd: () => void;
  /** Dismiss with no change (Escape, backdrop, X, or Cancel). */
  onCancel: () => void;
};

/**
 * Prompt shown when a new capture arrives while the editor canvas already has
 * work on it. Native `ask()` only offers two buttons, so this in-app modal is
 * used to present the three-way choice: Replace / Add / Cancel. Dismissing any
 * other way (Escape, backdrop, X) is treated as Cancel — no change.
 */
export function CaptureConflictDialog({ open, onReplace, onAdd, onCancel }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={onCancel}
    >
      <div
        className="surface relative flex w-full max-w-md flex-col overflow-hidden text-foreground"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-conflict-title"
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-3 top-3 z-10 rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="p-6 pb-4">
          <h2
            id="capture-conflict-title"
            className="text-base font-semibold text-white"
          >
            New capture — replace or add?
          </h2>
          <p className="mt-2 text-sm text-foreground/75">
            The editor already has work on it. Choose whether to start over with
            the new capture or keep what&apos;s there and layer the new capture
            on top.
          </p>
        </div>

        <div className="flex flex-col gap-2 px-6 pb-6">
          <button
            type="button"
            onClick={onAdd}
            className="btn btn--primary w-full justify-start gap-2"
          >
            <Images className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex flex-col items-start leading-tight">
              <span>Add as a layer</span>
              <span className="text-xs font-normal opacity-80">
                Keep the current canvas; place the new capture on top.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={onReplace}
            className="btn btn--secondary w-full justify-start gap-2"
          >
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex flex-col items-start leading-tight">
              <span>Replace everything</span>
              <span className="text-xs font-normal opacity-80">
                Discard the current image and annotations.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="btn btn--ghost mt-1 self-end"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
