import { useEffect } from "react";
import { t } from "@/i18n/store";
import { useSettings } from "@/stores/settings";
import { useEditor } from "@/stores/editor";
import { useWorkspaces } from "@/stores/workspaces";
import { installIdHeaders } from "@/lib/installId";
import { setUpdateStatus } from "@/lib/appVersion";

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
  setUpdateStatus({ state: "checking" });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    // Opt-in only: `installIdHeaders()` is undefined unless the user enabled
    // "Share anonymous install ID". Version/target/arch ride on the endpoint
    // URL template configured in tauri.conf.json.
    const headers = await installIdHeaders();
    const update = await check(headers ? { headers } : undefined);
    await useSettings.getState().update("updates", { lastCheckedAt: now });
    if (!update?.available) {
      setUpdateStatus({ state: "ok", at: now });
      return { kind: "none" };
    }
    setUpdateStatus({ state: "available", version: update.version, at: now });
    return {
      kind: "available",
      version: update.version,
      body: update.body ?? undefined,
      downloadAndInstall: async () => {
        // Download and install separately so the save lands between them:
        // edits made while the download runs are included, and on Windows the
        // installer may take the process down as soon as install starts.
        await update.download();
        await saveEditorWorkForRestart();
        await update.install();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      },
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // `lastCheckedAt` is written even here, so the timestamp alone cannot tell
    // a successful check from a failed one — that is why the status store
    // records the failure separately for the footer to show.
    await useSettings.getState().update("updates", { lastCheckedAt: now });
    setUpdateStatus({ state: "error", error, at: now });
    return { kind: "error", error };
  }
}

/**
 * The paragraph the update prompt adds when installing would lose editor work,
 * or "" when there is nothing to lose. capz has no "exported since the last
 * change" flag, so any image or annotation counts.
 */
export function unsavedWorkWarning(): string {
  if (useSettings.getState().config.workspaces.enabled) {
    // Workspaces are saved before install — except a pasted image, which
    // lives only as a blob URL and is never written out.
    const { activeId, docs } = useWorkspaces.getState();
    const image = activeId ? docs[activeId]?.image : null;
    return image?.kind === "blob" ? `\n\n${t("app.updater.unsavedPasted")}` : "";
  }
  const { hasImage, annotations } = useEditor.getState();
  return hasImage || annotations.length > 0 ? `\n\n${t("app.updater.unsavedLost")}` : "";
}

/**
 * Get the current workspace onto disk before the update restarts capz. Never
 * blocks the update: the user has already chosen Install.
 */
async function saveEditorWorkForRestart(): Promise<void> {
  if (!useSettings.getState().config.workspaces.enabled) return;
  try {
    const ws = useWorkspaces.getState();
    ws.commitActive();
    await ws.flushPersist();
  } catch (e) {
    console.error("saving workspaces before update failed", e);
  }
}

export async function promptAndInstall(
  available: Extract<UpdateCheckResult, { kind: "available" }>,
): Promise<boolean> {
  const skipped = useSettings.getState().config.updates.skippedVersion;
  if (skipped === available.version) return false;
  const { ask } = await import("@tauri-apps/plugin-dialog");
  const ok = await ask(
    t("app.updater.prompt", {
      version: available.version,
      body: available.body ?? "",
      warning: unsavedWorkWarning(),
    }),
    {
      title: t("app.updater.title"),
      kind: "info",
      okLabel: t("app.updater.install"),
      cancelLabel: t("app.updater.later"),
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
