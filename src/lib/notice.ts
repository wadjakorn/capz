"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { CONFIG_STORE_FILE } from "@/lib/config";

const IS_MAC =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

type NoticeKind = "info" | "success" | "error";
type NoticePayload = { kind: NoticeKind; message: string };

/**
 * Subscribes the calling component to Rust-emitted `app:notice` events and
 * routes them to the local Sonner toaster. Pair with a `<Toaster />` in the
 * window's root.
 */
export function useNoticeListener() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<NoticePayload>("app:notice", (e) => {
        const { kind, message } = e.payload;
        if (kind === "error") toast.error(message);
        else if (kind === "success") toast.success(message);
        else toast(message);
      });
    })();
    return () => unlisten?.();
  }, []);
}

/**
 * Listen for `app:permission-revoked` (capture failed because macOS Screen
 * Recording is no longer granted). Persistent toast with a "Re-run
 * onboarding" action that re-opens the in-editor onboarding view.
 */
export function usePermissionRevokedListener() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen, emit } = await import("@tauri-apps/api/event");
      unlisten = await listen("app:permission-revoked", () => {
        toast.error("Screen Recording permission revoked", {
          id: "permission-revoked",
          description:
            "Re-grant in System Settings → Privacy & Security → Screen Recording.",
          duration: 12_000,
          action: {
            label: "Re-run onboarding",
            onClick: () => {
              void emit("editor:show-onboarding");
            },
          },
        });
      });
    })();
    return () => unlisten?.();
  }, []);
}

/**
 * macOS only. On launch, compares the current binary's version against the
 * last version that successfully obtained Screen Recording permission. If a
 * grant was recorded for an earlier build but the current build reports
 * denied, the TCC entry is stale across the update (ad-hoc signing changes
 * the cdhash, so System Settings still lists capz but the new binary's
 * identity no longer matches the granted row). Surfaces a persistent toast
 * with copy that tells the user to toggle the entry off+on.
 *
 * Side-effect: when the current run is granted, records the current version
 * as the last-granted marker. First install with no prior marker stays
 * silent — onboarding owns the never-granted path.
 */
export function useStalePermissionAfterUpdateListener() {
  useEffect(() => {
    if (!IS_MAC) return;
    let cancelled = false;
    (async () => {
      const [{ invoke }, { getVersion }, { load }] = await Promise.all([
        import("@tauri-apps/api/core"),
        import("@tauri-apps/api/app"),
        import("@tauri-apps/plugin-store"),
      ]);
      const [granted, currentVersion, store] = await Promise.all([
        invoke<boolean>("has_screen_recording_permission"),
        getVersion(),
        load(CONFIG_STORE_FILE, { autoSave: false, defaults: {} }),
      ]);
      if (cancelled) return;
      const prior = (
        await store.get<{ lastGrantedVersion?: string }>("permissions")
      )?.lastGrantedVersion;
      if (granted) {
        if (prior !== currentVersion) {
          await store.set("permissions", { lastGrantedVersion: currentVersion });
          await store.save();
        }
        return;
      }
      if (prior && prior !== currentVersion) {
        toast.error("Screen Recording permission needs re-grant after update", {
          id: "permission-stale-after-update",
          description:
            "macOS keeps the previous version’s entry, but the new build needs a fresh approval. Toggle capz off and on in System Settings → Privacy & Security → Screen Recording, then relaunch.",
          duration: 20_000,
          action: {
            label: "Open Privacy Settings",
            onClick: () => {
              void invoke("open_system_settings_screen_recording");
            },
          },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}

const INERT_TOAST_ID = "permission-inert-after-update";

/**
 * macOS only. Detects the post-update "inert grant" state where preflight
 * reports granted but a real capture still fails — TCC's row is keyed to the
 * prior build's cdhash, so the new binary reads zero pixels. Distinct from
 * `useStalePermissionAfterUpdateListener` which only fires on the *denied*
 * case. On mount (and on each window focus) runs `probe_capture_command`; if
 * preflight = granted but probe = false, surfaces a persistent toast whose
 * action opens the Remove → Relaunch → Re-grant recovery dialog.
 *
 * Version-gated: once the probe succeeds on the current binary version, that
 * version is recorded in `permissions.lastProbeOkVersion` and subsequent
 * launches stay silent until the version changes.
 */
export function useInertGrantAfterUpdateListener(onOpenRecovery: () => void) {
  useEffect(() => {
    if (!IS_MAC) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const probe = async () => {
      const [{ invoke }, { getVersion }, { load }] = await Promise.all([
        import("@tauri-apps/api/core"),
        import("@tauri-apps/api/app"),
        import("@tauri-apps/plugin-store"),
      ]);
      const granted = await invoke<boolean>("has_screen_recording_permission");
      if (cancelled) return;
      if (!granted) return; // stale-after-update hook owns this path
      const currentVersion = await getVersion();
      const store = await load(CONFIG_STORE_FILE, { autoSave: false, defaults: {} });
      const perms =
        (await store.get<{ lastProbeOkVersion?: string }>("permissions")) ?? {};
      if (perms.lastProbeOkVersion === currentVersion) return;
      const ok = await invoke<boolean>("probe_capture_command");
      if (cancelled) return;
      if (ok) {
        await store.set("permissions", {
          ...perms,
          lastProbeOkVersion: currentVersion,
        });
        await store.save();
        toast.dismiss(INERT_TOAST_ID);
        return;
      }
      toast.error("Capture is broken after the macOS update", {
        id: INERT_TOAST_ID,
        description:
          "System Settings shows capz as allowed, but the entry is keyed to the previous build. TCC needs a full reset: remove the row, relaunch, re-grant.",
        duration: Infinity,
        action: {
          label: "Fix permission…",
          onClick: onOpenRecovery,
        },
      });
    };

    void probe();
    (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      unlisten = await win.onFocusChanged(({ payload: focused }) => {
        if (focused) void probe();
      });
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onOpenRecovery]);
}
