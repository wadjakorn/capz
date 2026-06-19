"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { detectText, type OcrResult } from "@/lib/ocr";

type Status = "idle" | "scanning" | "done" | "error";

type State = {
  mode: boolean;
  status: Status;
  resultByKey: Record<string, OcrResult>;
  currentKey: string | null;
  thaiNoticeShown: boolean;

  setKey: (key: string | null) => void;
  toggle: () => Promise<void>;
  detect: () => Promise<void>;
  reset: () => void;
};

const isWindows =
  typeof navigator !== "undefined" && /Win/i.test(navigator.platform);

export const useOcr = create<State>((set, get) => ({
  mode: false,
  status: "idle",
  resultByKey: {},
  currentKey: null,
  thaiNoticeShown: false,

  setKey: (key) => set({ currentKey: key }),

  toggle: async () => {
    const next = !get().mode;
    set({ mode: next });
    if (next) await get().detect();
  },

  detect: async () => {
    const { currentKey, resultByKey } = get();
    if (!currentKey) return;
    if (resultByKey[currentKey]) {
      set({ status: "done" });
      return;
    }
    set({ status: "scanning" });
    try {
      const result = await detectText(currentKey);
      set((s) => ({
        status: "done",
        resultByKey: { ...s.resultByKey, [currentKey]: result },
      }));
      if (!result.thaiAvailable && !get().thaiNoticeShown) {
        set({ thaiNoticeShown: true });
        toast(
          "Thai text recognition isn't available on this system" +
            (isWindows
              ? " — install the Thai language pack in Windows Settings."
              : " — it requires a newer macOS version."),
        );
      }
    } catch (e) {
      console.error("ocr_detect failed", e);
      set({ status: "error" });
      toast.error?.("Text detection failed");
    }
  },

  reset: () =>
    set({
      mode: false,
      status: "idle",
      resultByKey: {},
      currentKey: null,
      // thaiNoticeShown intentionally NOT reset — notice stays once-per-session.
    }),
}));

export const currentResult = (s: State): OcrResult | null =>
  s.currentKey ? s.resultByKey[s.currentKey] ?? null : null;
