"use client";

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";

import { isTauriRuntime } from "@/lib/platform";
import { uid } from "@/lib/uid";

export const HISTORY_STORE_FILE = "history.json";

export type HistoryItem = {
  id: string;
  /** Absolute path on disk. Also the dedupe key: re-saving over a file
   *  updates the existing row rather than stacking a second one. */
  path: string;
  fileName: string;
  savedAt: number;
  bytes: number;
  size: { w: number; h: number } | null;
  /** Data URL, ~128px wide — large enough for the grid tile at 108px. */
  thumb: string;
  /** Resolved lazily on mount: the file may have been moved or deleted
   *  outside the app since it was recorded. */
  missing?: boolean;
};

type State = {
  ready: boolean;
  items: HistoryItem[];
  /** Row the action strip is attached to, or null. */
  selectedId: string | null;

  init: (enabled: boolean) => Promise<void>;
  record: (item: Omit<HistoryItem, "id">, max: number) => void;
  /** Drop rows past `max` after the setting is lowered. Files are untouched. */
  trim: (max: number) => number;
  select: (id: string | null) => void;
  /** Remove the row only. Use after a successful trash, or for a missing file. */
  forget: (id: string) => void;
  markMissing: (id: string) => void;
  clear: () => void;
  /** Check every path and flag the ones that are gone. */
  refreshMissing: () => Promise<void>;
};

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise)
    storePromise = load(HISTORY_STORE_FILE, { autoSave: false, defaults: {} });
  return storePromise;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (!isTauriRuntime()) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void (async () => {
      try {
        const store = await getStore();
        await store.set("items", useHistory.getState().items);
        await store.save();
      } catch (e) {
        console.error("history persist failed", e);
      }
    })();
  }, 400);
}

function reviveItem(raw: unknown): HistoryItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.path !== "string" || !o.path) return null;
  return {
    id: typeof o.id === "string" && o.id ? o.id : uid(),
    path: o.path,
    fileName: typeof o.fileName === "string" ? o.fileName : baseName(o.path),
    savedAt: typeof o.savedAt === "number" ? o.savedAt : Date.now(),
    bytes: typeof o.bytes === "number" ? o.bytes : 0,
    size:
      o.size && typeof o.size === "object" &&
      typeof (o.size as Record<string, unknown>).w === "number" &&
      typeof (o.size as Record<string, unknown>).h === "number"
        ? (o.size as { w: number; h: number })
        : null,
    thumb: typeof o.thumb === "string" ? o.thumb : "",
    missing: o.missing === true,
  };
}

/** Last path segment, for either separator — paths come from both platforms. */
export function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(i + 1) : path;
}

/** Directory part of a path, for the row subtitle in a dialog. */
export function dirName(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i > 0 ? path.slice(0, i) : "";
}

export function formatBytes(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Apply the FIFO cap.
 *
 * Pure and exported so the cap is testable without a store: the rule that a
 * trimmed record never implies a deleted file is the one thing here a user
 * could misread, and it is enforced by this function alone.
 */
export function applyCap(items: HistoryItem[], max: number): HistoryItem[] {
  return max > 0 ? items.slice(0, max) : [];
}

/** Insert newest-first, replacing any existing row for the same path. */
export function insertItem(
  items: HistoryItem[],
  item: HistoryItem,
  max: number,
): HistoryItem[] {
  return applyCap([item, ...items.filter((i) => i.path !== item.path)], max);
}

export const useHistory = create<State>((set, get) => ({
  ready: false,
  items: [],
  selectedId: null,

  init: async (enabled) => {
    if (get().ready) return;
    if (!enabled || !isTauriRuntime()) {
      set({ ready: true });
      return;
    }
    try {
      const store = await getStore();
      const raw = (await store.get<unknown[]>("items")) ?? [];
      const items = raw.map(reviveItem).filter((x): x is HistoryItem => x !== null);
      set({ ready: true, items });
      void get().refreshMissing();
    } catch (e) {
      console.error("history store load failed", e);
      set({ ready: true });
    }
  },

  record: (item, max) => {
    set({ items: insertItem(get().items, { ...item, id: uid() }, max) });
    schedulePersist();
  },

  trim: (max) => {
    const before = get().items.length;
    if (before <= max) return 0;
    set({ items: applyCap(get().items, max) });
    schedulePersist();
    return before - max;
  },

  select: (id) => set({ selectedId: id }),

  forget: (id) => {
    const { items, selectedId } = get();
    set({
      items: items.filter((i) => i.id !== id),
      selectedId: selectedId === id ? null : selectedId,
    });
    schedulePersist();
  },

  markMissing: (id) => {
    set({ items: get().items.map((i) => (i.id === id ? { ...i, missing: true } : i)) });
    schedulePersist();
  },

  clear: () => {
    set({ items: [], selectedId: null });
    schedulePersist();
  },

  refreshMissing: async () => {
    if (!isTauriRuntime()) return;
    const items = get().items;
    if (!items.length) return;
    try {
      const { exists } = await import("@tauri-apps/plugin-fs");
      const flags = await Promise.all(
        items.map((i) => exists(i.path).catch(() => true)),
      );
      const next = items.map((i, idx) => ({ ...i, missing: !flags[idx] }));
      // Only write when something actually changed, so a normal launch does
      // not rewrite the store file for nothing.
      if (next.some((i, idx) => i.missing !== items[idx].missing)) {
        set({ items: next });
        schedulePersist();
      }
    } catch (e) {
      console.warn("history missing-file check skipped", e);
    }
  },
}));
