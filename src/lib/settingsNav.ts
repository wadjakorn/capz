"use client";

import { create } from "zustand";
import {
  isSettingId,
  settingDef,
  type PageId,
  type SettingId,
} from "@/components/settings/registry";

/**
 * Where the settings view is, and which row it was asked to reveal (CP-0053).
 *
 * This lives outside React on purpose. Settings is a view inside the editor
 * window that only mounts once `view === "settings"`, and it subscribes to
 * events after two dynamic imports — so the old approach (emit
 * `settings:focus-tab` and hope someone is listening) dropped the message and
 * landed the user on the default tab. A store has no such window: a call made
 * before the view exists is still here when it mounts.
 */
export type SettingsNavState = {
  page: PageId;
  /** Row to scroll to and flash once the view is ready; cleared after use. */
  target: SettingId | null;
  /** Advanced fold state per page, kept in memory only (no localStorage). */
  advOpen: Partial<Record<PageId, boolean>>;
  /**
   * Bumped on every `openSettings` call so asking for the same row twice
   * re-runs the scroll and flash instead of looking like nothing happened.
   */
  nonce: number;
  setPage: (page: PageId) => void;
  toggleAdvanced: (page: PageId) => void;
  setAdvanced: (page: PageId, open: boolean) => void;
  consumeTarget: () => void;
  /** Test helper: forget everything. */
  resetNav: () => void;
};

const INITIAL: Pick<SettingsNavState, "page" | "target" | "advOpen" | "nonce"> = {
  page: "capture",
  target: null,
  advOpen: {},
  nonce: 0,
};

export const useSettingsNav = create<SettingsNavState>((set) => ({
  ...INITIAL,
  setPage: (page) => set({ page }),
  toggleAdvanced: (page) =>
    set((s) => ({ advOpen: { ...s.advOpen, [page]: !s.advOpen[page] } })),
  setAdvanced: (page, open) =>
    set((s) => ({ advOpen: { ...s.advOpen, [page]: open } })),
  consumeTarget: () => set({ target: null }),
  resetNav: () => set({ ...INITIAL, advOpen: {} }),
}));

/**
 * Open Settings at a specific row: switch to its page, unfold Advanced when the
 * row lives there, and mark it for the scroll-and-flash the view performs once
 * it is mounted and ready.
 *
 * Callers that also need to leave the canvas (the editor's own UI) switch the
 * view themselves; this only says where Settings should land.
 */
export function openSettings(id: SettingId): void {
  const def = settingDef(id);
  useSettingsNav.setState((s) => ({
    page: def.page,
    target: id,
    nonce: s.nonce + 1,
    advOpen: def.advanced ? { ...s.advOpen, [def.page]: true } : s.advOpen,
  }));
}

/** Open a whole page, with no particular row in mind. */
export function openSettingsPage(page: PageId): void {
  useSettingsNav.setState((s) => ({ page, target: null, nonce: s.nonce + 1 }));
}

/**
 * Same as `openSettings`, for payloads that arrive as plain strings — a Tauri
 * event, a deep link, anything that has not been through the type system.
 * Unknown values leave the view where it is rather than throwing at the user.
 */
export function openSettingsFromPayload(payload: unknown): boolean {
  if (isSettingId(payload)) {
    openSettings(payload);
    return true;
  }
  if (typeof payload === "string" && payload) {
    console.warn(`openSettings: unknown setting "${payload}"`);
  }
  return false;
}
