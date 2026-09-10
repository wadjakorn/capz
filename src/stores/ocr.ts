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

const isWindows = () =>
  typeof navigator !== "undefined" && /Win/i.test(navigator.platform);

const THAI_OCR_NOTE_URL =
  "https://github.com/wadjakorn/capz/blob/main/docs/OCR-THAI-WINDOWS.th.md";

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
      const lineCount = result.lines.length;
      if (lineCount > 0) {
        toast.success(`Detected ${lineCount} text ${lineCount === 1 ? "line" : "lines"}`);
      } else {
        toast("No text found");
      }
      // Only worth mentioning when we found nothing at all: on a screenshot that
      // did contain readable text, a "Thai isn't available" toast is pure noise.
      // We cannot detect Thai in the image directly — the engine that would have
      // to read it is the one that is missing.
      if (!result.thaiAvailable && lineCount === 0 && !get().thaiNoticeShown) {
        set({ thaiNoticeShown: true });
        toast("Thai text recognition isn't available on this system", {
          description: isWindows()
            ? "Windows ไม่มีชุด OCR ภาษาไทยให้ติดตั้ง (ไม่ว่าเวอร์ชันใด) จึงยังอ่านภาษาไทย" +
              "ไม่ได้ — ไม่ต้องไปหาติดตั้งเพิ่ม ภาษาอังกฤษยังใช้ได้ตามปกติ · " +
              `รายละเอียด: ${THAI_OCR_NOTE_URL}`
            : "It requires a newer macOS version.",
          duration: isWindows() ? 12_000 : 8_000,
        });
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
