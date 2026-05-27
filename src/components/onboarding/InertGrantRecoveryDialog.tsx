"use client";

import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function InertGrantRecoveryDialog({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card relative w-full max-w-lg p-6 text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <h2 className="text-base font-semibold text-white">Fix permission after update</h2>
        <p className="mt-2 text-sm text-foreground/75">
          macOS still shows capz as granted in Screen Recording, but the entry
          is keyed to the previous build and the new binary cannot capture.
          Toggling it off and on does not recover — the row must be removed
          entirely so macOS re-prompts on next launch.
        </p>

        <ol className="mt-5 grid gap-4">
          <li className="grid gap-2">
            <div className="flex items-baseline gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/30 text-xs font-semibold text-violet-100 ring-1 ring-violet-400/40">
                1
              </span>
              <div className="text-sm font-medium">Open Privacy &amp; Security</div>
            </div>
            <p className="ml-7 text-xs text-muted-foreground">
              Find capz in the list and click the <strong>−</strong> button to
              remove it. Toggling off won&apos;t work.
            </p>
            <div className="ml-7">
              <button
                type="button"
                onClick={() => {
                  void invoke("open_system_settings_screen_recording");
                }}
                className="glass-button"
              >
                Open Privacy Settings
              </button>
            </div>
          </li>

          <li className="grid gap-2">
            <div className="flex items-baseline gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/30 text-xs font-semibold text-amber-100 ring-1 ring-amber-400/40">
                2
              </span>
              <div className="text-sm font-medium">Relaunch capz</div>
            </div>
            <p className="ml-7 text-xs text-muted-foreground">
              After removing the entry, click here. The next capture attempt
              will re-prompt for permission.
            </p>
            <div className="ml-7">
              <button
                type="button"
                onClick={() => {
                  void invoke("relaunch_app");
                }}
                className="glass-button-primary"
              >
                Relaunch capz
              </button>
            </div>
          </li>

          <li className="grid gap-1">
            <div className="flex items-baseline gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/30 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-400/40">
                3
              </span>
              <div className="text-sm font-medium">Re-grant on first capture</div>
            </div>
            <p className="ml-7 text-xs text-muted-foreground">
              After relaunch, your next capture surfaces the macOS prompt.
              Approve it and capz writes a fresh TCC entry.
            </p>
          </li>
        </ol>
      </div>
    </div>
  );
}
