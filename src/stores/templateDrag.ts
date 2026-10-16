import { create } from "zustand";

export const FLASH_MS = 600;

let flashTimer: ReturnType<typeof setTimeout> | null = null;

/** Drag-over / just-applied state for workspace tiles during a template drag. */
export const useTemplateDrag = create<{
  dropTargetId: string | null;
  flashId: string | null;
  setDropTarget: (id: string | null) => void;
  flash: (id: string) => void;
}>((set) => ({
  dropTargetId: null,
  flashId: null,
  setDropTarget: (id) => set((s) => (s.dropTargetId === id ? s : { dropTargetId: id })),
  flash: (id) => {
    if (flashTimer) clearTimeout(flashTimer);
    set({ flashId: id });
    flashTimer = setTimeout(() => {
      flashTimer = null;
      set({ flashId: null });
    }, FLASH_MS);
  },
}));
