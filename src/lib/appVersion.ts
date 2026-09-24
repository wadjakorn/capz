"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { isTauriRuntime } from "@/lib/platform";

/**
 * What the last update check did, for the footer in Settings (CP-0053).
 *
 * Every check the app makes goes through `checkForUpdates`, which writes here:
 * the manual button and the `updater://check-now` tick Rust emits. That
 * listener runs in the editor window — the same window Settings lives in — so
 * the footer reflects checks the user never asked for, as they happen.
 */
export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok"; at: number }
  | { state: "available"; version: string; at: number }
  | { state: "error"; error: string; at: number };

export const useUpdateStatus = create<UpdateStatus>(() => ({ state: "idle" }));

export function setUpdateStatus(status: UpdateStatus): void {
  useUpdateStatus.setState(status, true);
}

/** The running app's version, or null in the browser build. */
export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const v = await getVersion();
        if (!cancelled) setVersion(v);
      } catch (e) {
        console.warn("app version failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}
