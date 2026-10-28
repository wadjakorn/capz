"use client";

import { create } from "zustand";
import type { StickerFolder } from "@/lib/config";

export type StickerEntry = { name: string; dataUrl: string };

/** Load state of one user folder set. */
export type FolderState = {
  entries: StickerEntry[];
  loading: boolean;
  error: string | null;
};

type State = {
  /** Keyed by folder id (`dir:<hash>`). A folder is loaded once per webview;
   * `reload` forces a re-scan (Settings → Sync). */
  folders: Record<string, FolderState>;
  /** The picker tab the user last opened this session (not persisted). */
  activeSetId: string | null;
  /** Load every enabled folder that hasn't been loaded yet, in parallel. */
  loadFolders: (folders: StickerFolder[]) => Promise<void>;
  reload: (folder: StickerFolder) => Promise<void>;
  forget: (id: string) => void;
  setActiveSetId: (id: string) => void;
};

export const useStickers = create<State>((set, get) => {
  const load = async (folder: StickerFolder) => {
    set((s) => ({
      folders: { ...s.folders, [folder.id]: { entries: s.folders[folder.id]?.entries ?? [], loading: true, error: null } },
    }));
    let next: FolderState;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const entries = await invoke<StickerEntry[]>("list_stickers", { dir: folder.dir });
      next = { entries, loading: false, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("list_stickers failed", folder.dir, e);
      next = { entries: [], loading: false, error: msg };
    }
    set((s) => ({ folders: { ...s.folders, [folder.id]: next } }));
  };
  return {
    folders: {},
    activeSetId: null,
    loadFolders: async (folders) => {
      const todo = folders.filter((f) => f.enabled && !get().folders[f.id]);
      await Promise.all(todo.map(load));
    },
    reload: load,
    forget: (id) =>
      set((s) => {
        const folders = { ...s.folders };
        delete folders[id];
        return { folders };
      }),
    setActiveSetId: (id) => set({ activeSetId: id }),
  };
});
