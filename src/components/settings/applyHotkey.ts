"use client";

import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import {
  statusMessage,
  type RegoResult,
  type HotkeyAction,
} from "@/lib/shortcuts";
import type { useSettings } from "@/stores/settings";
import { t, type TKey } from "@/i18n/store";

export type HotkeyPatch = {
  captureFull?: string;
  captureArea?: string;
  captureWindow?: string;
  captureScroll?: string;
  captureSystemArea?: string;
  showEditor?: string;
  commandRing?: string;
  commandRingV2?: string;
};

const HOTKEY_LABELS: Record<keyof HotkeyPatch, TKey> = {
  captureFull: "settings.hotkey.action.captureFull",
  captureArea: "settings.hotkey.action.captureArea",
  captureWindow: "settings.hotkey.action.captureWindow",
  captureScroll: "settings.hotkey.action.captureScroll",
  captureSystemArea: "settings.hotkey.action.captureSystemArea",
  showEditor: "settings.hotkey.action.showEditor",
  commandRing: "settings.hotkey.action.commandRing",
  commandRingV2: "settings.hotkey.action.commandRingV2",
};

export async function applyHotkey(
  getState: typeof useSettings.getState,
  update: ReturnType<typeof useSettings.getState>["update"],
  patch: HotkeyPatch,
) {
  const prev = { ...getState().config.hotkeys };
  const next = { ...prev, ...patch } as Record<keyof HotkeyPatch, string>;

  const changedKey = Object.keys(patch)[0] as keyof HotkeyPatch | undefined;
  const newAccel = changedKey ? patch[changedKey] : undefined;
  if (changedKey && newAccel) {
    const clash = (Object.keys(next) as (keyof HotkeyPatch)[]).find(
      (k) => k !== changedKey && next[k] === newAccel,
    );
    if (clash) {
      toast.error(t("settings.hotkey.clash", { accel: newAccel, action: t(HOTKEY_LABELS[clash]) }), {
        id: "hotkey-clash",
      });
      return;
    }
  }

  await update("hotkeys", patch);
  let report: RegoResult[] = [];
  try {
    const res = await invoke<RegoResult[]>("reregister_shortcuts");
    if (Array.isArray(res)) report = res;
  } catch (e) {
    console.error("reregister_shortcuts failed", e);
  }
  const mine = report.find((r) => r.action === (changedKey as HotkeyAction));
  if (mine && mine.status !== "ok") {
    await update("hotkeys", prev);
    await invoke("reregister_shortcuts").catch((e) =>
      console.error("reregister_shortcuts (revert) failed", e),
    );
    toast.error(statusMessage(mine.requested, mine.status) ?? t("settings.hotkey.registerFailed"), {
      id: "hotkey-register-failed",
    });
  }
}
