"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  /** Body copy. Say what is lost and what is not — both halves matter here. */
  body: string;
  /** Optional preview of the thing being acted on. */
  preview?: { thumb?: string; line1: string; line2?: string };
  confirmLabel: string;
  cancelLabel?: string;
  /** Paints the confirm button red. True for anything that destroys work. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * A single-question confirm.
 *
 * Written fresh rather than extracted from InertGrantRecoveryDialog: that one
 * is a four-step permission wizard that polls the OS while it is open, and
 * pulling a generic dialog out of it would mean editing hard-to-test
 * permission-recovery code for no gain. The overlay/escape/focus behaviour
 * here follows the same pattern so the two look and feel identical.
 *
 * Focus starts on Cancel: every caller is destructive, and a stray Enter
 * should not be what closes a workspace.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  preview,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onCancel]);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={onCancel}
    >
      <div
        className="surface flex w-full max-w-[400px] flex-col gap-3.5 p-5 text-foreground"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 flex-none text-[var(--warning)]"
            aria-hidden
          />
          <h2 id="confirm-title" className="text-base font-semibold">
            {title}
          </h2>
        </div>

        {preview && (
          <div className="flex items-center gap-2.5">
            {preview.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail
              <img
                src={preview.thumb}
                alt=""
                className="h-[55px] w-[88px] flex-none rounded-md border border-[var(--border)] bg-[var(--bg-canvas)] object-contain"
              />
            ) : null}
            <div className="min-w-0">
              <div className="truncate text-xs text-[var(--fg-2)]">{preview.line1}</div>
              {preview.line2 && (
                <div className="truncate text-[11px] text-[var(--fg-4)]">
                  {preview.line2}
                </div>
              )}
            </div>
          </div>
        )}

        <p id="confirm-body" className="text-[13px] leading-relaxed text-[var(--fg-2)]">
          {body}
        </p>

        <div className="flex justify-end gap-2">
          <button ref={cancelRef} type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn--sm ${destructive ? "btn--danger" : "btn--primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
