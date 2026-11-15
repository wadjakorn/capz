"use client";

import { create } from "zustand";
import { t } from "@/i18n/store";
import { toast } from "sonner";
import { detectText, type OcrEngine, type OcrResult } from "@/lib/ocr";
import { useSettings } from "@/stores/settings";

type Status = "idle" | "scanning" | "done" | "error";

type State = {
  mode: boolean;
  status: Status;
  resultByKey: Record<string, OcrResult>;
  /** Engine that produced `resultByKey`; switching engines drops the cache. */
  resultEngine: OcrEngine | null;
  currentKey: string | null;
  thaiNoticeShown: boolean;

  setKey: (key: string | null) => void;
  toggle: () => Promise<void>;
  detect: () => Promise<void>;
  reset: () => void;
};

export const useOcr = create<State>((set, get) => ({
  mode: false,
  status: "idle",
  resultByKey: {},
  resultEngine: null,
  currentKey: null,
  thaiNoticeShown: false,

  setKey: (key) => set({ currentKey: key }),

  toggle: async () => {
    const next = !get().mode;
    set({ mode: next });
    if (next) await get().detect();
  },

  detect: async () => {
    const { currentKey } = get();
    if (!currentKey) return;
    // macOS only; Rust ignores it elsewhere (Windows/Linux are always OpenThai).
    const engine = useSettings.getState().config.general.ocrEngine;
    if (get().resultEngine !== engine) set({ resultByKey: {}, resultEngine: engine });
    if (get().resultByKey[currentKey]) {
      set({ status: "done" });
      return;
    }
    set({ status: "scanning" });
    try {
      const result = await detectText(currentKey, engine);
      set((s) => ({
        status: "done",
        resultByKey: { ...s.resultByKey, [currentKey]: result },
      }));
      const lineCount = result.lines.length;
      if (lineCount > 0) {
        toast.success(
          t(lineCount === 1 ? "app.ocr.detectedOne" : "app.ocr.detectedMany", { count: lineCount }),
        );
      } else {
        toast(t("app.ocr.noText"));
      }
      // Only worth mentioning when we found nothing at all: on a screenshot that
      // did contain readable text, a "Thai isn't available" toast is pure noise.
      // We cannot detect Thai in the image directly — the engine that would have
      // to read it is the one that is missing. Only Apple Vision before
      // macOS 13 lacks Thai; OpenThai (Windows, or chosen on macOS) has it.
      if (!result.thaiAvailable && lineCount === 0 && !get().thaiNoticeShown) {
        set({ thaiNoticeShown: true });
        toast(t("app.ocr.thaiUnavailable"), {
          description: t("app.ocr.thaiUnavailableMac"),
          duration: 8_000,
        });
      }
    } catch (e) {
      console.error("ocr_detect failed", e);
      set({ status: "error" });
      toast.error?.(t("app.ocr.failed"));
    }
  },

  reset: () =>
    set({
      mode: false,
      status: "idle",
      resultByKey: {},
      resultEngine: null,
      currentKey: null,
      // thaiNoticeShown intentionally NOT reset — notice stays once-per-session.
    }),
}));

export const currentResult = (s: State): OcrResult | null =>
  s.currentKey ? s.resultByKey[s.currentKey] ?? null : null;
