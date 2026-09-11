"use client";

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";

import { isTauriRuntime } from "@/lib/platform";
import { listArchive, type ArchiveFile } from "@/lib/captureArchive";
import { uid } from "@/lib/uid";

export const HISTORY_STORE_FILE = "history.json";

/**
 * Where a row came from, and therefore who owns the file.
 *
 * `saved` — the user exported it. Never touched by the app again.
 * `capture` — the app copied it into `<saveDir>/Captures/` automatically, and
 *   will evict it when the folder outgrows its budget.
 *
 * The kinds differ only in ownership: both are real files, so Reveal, Copy and
 * Move to Trash behave identically for either.
 */
export type HistoryKind = "saved" | "capture";

export type HistoryItem = {
  id: string;
  kind: HistoryKind;
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

/** Which rows the sidebar is showing. */
export type HistoryFilter = "all" | "saved" | "capture";

type State = {
  ready: boolean;
  /** Exported files. Stored in history.json, bounded by `history.max`. */
  items: HistoryItem[];
  /**
   * Archived captures. NOT stored — derived from a listing of
   * `<saveDir>/Captures/` every time, so the folder is the single source of
   * truth and a lost store can never orphan a file we own.
   */
  archived: HistoryItem[];
  filter: HistoryFilter;
  /** Row the action strip is attached to, or null. */
  selectedId: string | null;

  init: (enabled: boolean) => Promise<void>;
  /** Re-read the archive folder. Cheap enough to call on mount and after edits. */
  refreshArchive: (saveDir: string | null) => Promise<void>;
  setFilter: (f: HistoryFilter) => void;
  /** Cache a decoded thumbnail for an archived file, keyed by path. */
  setArchiveThumb: (path: string, thumb: string) => void;
  record: (item: Omit<HistoryItem, "id" | "kind">, max: number) => void;
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
    // Rows written before the archive existed are all exports.
    kind: o.kind === "capture" ? "capture" : "saved",
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

/** Turn a file on disk into a row. Thumbnails are filled in lazily. */
function archiveRow(f: ArchiveFile, thumb: string): HistoryItem {
  return {
    // Path-derived id, so a row keeps its identity across refreshes and the
    // selected row does not jump when the folder is re-read.
    id: `archive:${f.path}`,
    kind: "capture",
    path: f.path,
    fileName: f.name,
    savedAt: f.at,
    bytes: f.bytes,
    size: null,
    thumb,
  };
}

/**
 * The list the sidebar renders: exports and archived captures interleaved by
 * time, newest first, narrowed by the active filter.
 *
 * Pure and exported because the partition is the thing a user would notice if
 * it were wrong — a row appearing twice, or vanishing from `all`.
 */
export function visibleItems(
  saved: HistoryItem[],
  archived: HistoryItem[],
  filter: HistoryFilter,
): HistoryItem[] {
  const rows =
    filter === "saved" ? saved : filter === "capture" ? archived : [...saved, ...archived];
  return [...rows].sort((a, b) => b.savedAt - a.savedAt);
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
  archived: [],
  filter: "all",
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
    set({
      items: insertItem(get().items, { kind: "saved", ...item, id: uid() }, max),
    });
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
    const { items, archived, selectedId } = get();
    set({
      items: items.filter((i) => i.id !== id),
      // Archive rows are derived from disk, so dropping one here is only a
      // local echo of a file that has already been removed.
      archived: archived.filter((i) => i.id !== id),
      selectedId: selectedId === id ? null : selectedId,
    });
    schedulePersist();
  },

  markMissing: (id) => {
    set({ items: get().items.map((i) => (i.id === id ? { ...i, missing: true } : i)) });
    schedulePersist();
  },

  // Clears the list of EXPORTED files only, and deletes nothing from disk.
  // Archived captures are files the app owns; removing those is a separate,
  // explicitly-worded action.
  clear: () => {
    set({ items: [], selectedId: null });
    schedulePersist();
  },

  setFilter: (filter) => set({ filter, selectedId: null }),

  setArchiveThumb: (path, thumb) => {
    if (!thumb) return;
    set({
      archived: get().archived.map((i) => (i.path === path ? { ...i, thumb } : i)),
    });
  },

  refreshArchive: async (saveDir) => {
    if (!saveDir || !isTauriRuntime()) {
      set({ archived: [] });
      return;
    }
    const files = await listArchive(saveDir);
    const prev = get().archived;
    // Carry thumbnails over by path so a refresh does not re-decode every file.
    const thumbs = new Map(prev.map((i) => [i.path, i.thumb]));
    set({ archived: files.map((f) => archiveRow(f, thumbs.get(f.path) ?? "")) });
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
