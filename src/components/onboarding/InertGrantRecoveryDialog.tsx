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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-lg border border-neutral-700 bg-neutral-900 p-6 text-neutral-100 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          aria-label="Close"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <h2 className="text-base font-semibold">Fix permission after update</h2>
        <p className="mt-2 text-sm text-neutral-300">
          macOS still shows capz as granted in Screen Recording, but the entry
          is keyed to the previous build and the new binary cannot capture.
          Toggling it off and on does not recover — the row must be removed
          entirely so macOS re-prompts on next launch.
        </p>

        <ol className="mt-5 grid gap-4">
          <li className="grid gap-2">
            <div className="flex items-baseline gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-xs font-semibold">
                1
              </span>
              <div className="text-sm font-medium">Open Privacy &amp; Security</div>
            </div>
            <p className="ml-7 text-xs text-neutral-400">
              Find capz in the list and click the <strong>−</strong> button to
              remove it. Toggling off won&apos;t work.
            </p>
            <div className="ml-7">
              <button
                type="button"
                onClick={() => {
                  void invoke("open_system_settings_screen_recording");
                }}
                className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
              >
                Open Privacy Settings
              </button>
            </div>
          </li>

          <li className="grid gap-2">
            <div className="flex items-baseline gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-xs font-semibold">
                2
              </span>
              <div className="text-sm font-medium">Relaunch capz</div>
            </div>
            <p className="ml-7 text-xs text-neutral-400">
              After removing the entry, click here. The next capture attempt
              will re-prompt for permission.
            </p>
            <div className="ml-7">
              <button
                type="button"
                onClick={() => {
                  void invoke("relaunch_app");
                }}
                className="rounded border border-amber-700 bg-amber-900/30 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-900/50"
              >
                Relaunch capz
              </button>
            </div>
          </li>

          <li className="grid gap-1">
            <div className="flex items-baseline gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-xs font-semibold">
                3
              </span>
              <div className="text-sm font-medium">Re-grant on first capture</div>
            </div>
            <p className="ml-7 text-xs text-neutral-400">
              After relaunch, your next capture surfaces the macOS prompt.
              Approve it and capz writes a fresh TCC entry.
            </p>
          </li>
        </ol>
      </div>
    </div>
  );
}
