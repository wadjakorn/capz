"use client";

import { create } from "zustand";

export type StickerEntry = { name: string; dataUrl: string };

type State = {
  entries: StickerEntry[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  load: (dir: string | null) => Promise<void>;
  clear: () => void;
};

export const useStickers = create<State>((set, get) => ({
  entries: [],
  loaded: false,
  loading: false,
  error: null,
  load: async (dir) => {
    if (!dir) {
      set({ entries: [], loaded: true, loading: false, error: null });
      return;
    }
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const entries = await invoke<StickerEntry[]>("list_stickers", { dir });
      set({ entries, loaded: true, loading: false, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("list_stickers failed", e);
      set({ entries: [], loaded: true, loading: false, error: msg });
    }
  },
  clear: () => set({ entries: [], loaded: false, loading: false, error: null }),
}));
