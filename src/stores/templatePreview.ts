import { create } from "zustand";

/** Annotation id the template picker is hovering; EditorStage outlines it. */
export const useTemplatePreview = create<{
  highlightId: string | null;
  setHighlight: (id: string | null) => void;
}>((set) => ({
  highlightId: null,
  setHighlight: (id) => set({ highlightId: id }),
}));
