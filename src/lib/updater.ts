import { useEffect } from "react";
import { useSettings } from "@/stores/settings";

export type UpdateCheckResult =
  | { kind: "none" }
  | { kind: "available"; version: string; body?: string; downloadAndInstall: () => Promise<void> }
  | { kind: "error"; error: string };

/**
 * Wraps tauri-plugin-updater. Returns a uniform result so callers can drive
 * Sonner toasts / native dialogs without leaking plugin types into the UI.
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const now = Date.now();
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    await useSettings.getState().update("updates", { lastCheckedAt: now });
    if (!update?.available) return { kind: "none" };
    return {
      kind: "available",
      version: update.version,
      body: update.body ?? undefined,
      downloadAndInstall: async () => {
        await update.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      },
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await useSettings.getState().update("updates", { lastCheckedAt: now });
    return { kind: "error", error };
  }
}

export async function promptAndInstall(
  available: Extract<UpdateCheckResult, { kind: "available" }>,
): Promise<boolean> {
  const skipped = useSettings.getState().config.updates.skippedVersion;
  if (skipped === available.version) return false;
  const { ask } = await import("@tauri-apps/plugin-dialog");
  const ok = await ask(
    `Version ${available.version} is available.\n\n${available.body ?? ""}\n\nDownload and install now?`,
    {
      title: "Update Available",
      kind: "info",
      okLabel: "Install",
      cancelLabel: "Later",
    },
  );
  if (!ok) return false;
  await available.downloadAndInstall();
  return true;
}

export async function skipVersion(version: string): Promise<void> {
  await useSettings.getState().update("updates", { skippedVersion: version });
}

/**
 * Subscribes the calling component to the Rust-emitted `updater://check-now`
 * tick. Runs a silent check; if an update is available, opens the native
 * prompt dialog. Honors `updates.skippedVersion` via promptAndInstall.
 */
export function useUpdateCheckListener() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen("updater://check-now", async () => {
        try {
          const r = await checkForUpdates();
          if (r.kind === "available") await promptAndInstall(r);
        } catch (e) {
          console.warn("auto update check failed", e);
        }
      });
    })();
    return () => unlisten?.();
  }, []);
}
