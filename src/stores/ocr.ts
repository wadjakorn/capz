"use client";

import { create } from "zustand";
import { t } from "@/i18n/store";
import { toast } from "sonner";
import { detectText, type OcrBox, type OcrEngine, type OcrLine, type OcrResult } from "@/lib/ocr";
import { isScopeTooSmall, scopeLines } from "@/lib/ocrScope";
import { mergeRescan, paddedRegion } from "@/lib/ocrRescan";
import { useSettings } from "@/stores/settings";

type Status = "idle" | "scanning" | "done" | "error";

/**
 * A user-drawn box (image px) and the whole-image lines it keeps (CP-0099).
 * `lines` is computed once in setScope so selectors return a stable reference.
 * With OpenThai the box is then re-scanned (CP-0100): `rescan` is "scanning"
 * until the merged lines replace `lines`.
 */
export type OcrScope = { rect: OcrBox; lines: OcrLine[]; rescan?: "scanning" | "done" };

// One re-scan at a time (each call loads the models and uses up to 8 threads);
// a newer box replaces the one waiting. Kept outside the store: not UI state.
let rescanInFlight: object | null = null;
let rescanNext: OcrScope | null = null;

type State = {
  mode: boolean;
  status: Status;
  resultByKey: Record<string, OcrResult>;
  /** Engine that produced `resultByKey`; switching engines drops the cache. */
  resultEngine: OcrEngine | null;
  currentKey: string | null;
  thaiNoticeShown: boolean;
  scope: OcrScope | null;
  /** The "drag a box" hint rides on the session's first detection toast. */
  scopeHintShown: boolean;

  setKey: (key: string | null) => void;
  toggle: () => Promise<void>;
  detect: () => Promise<void>;
  reset: () => void;
  setScope: (rect: OcrBox) => void;
  clearScope: () => void;
};

export const useOcr = create<State>((set, get) => ({
  mode: false,
  status: "idle",
  resultByKey: {},
  resultEngine: null,
  currentKey: null,
  thaiNoticeShown: false,
  scope: null,
  scopeHintShown: false,

  setKey: (key) => set({ currentKey: key, scope: null }),

  toggle: async () => {
    const next = !get().mode;
    set(next ? { mode: true } : { mode: false, scope: null });
    if (next) await get().detect();
  },

  detect: async () => {
    const { currentKey } = get();
    if (!currentKey) return;
    // macOS only; Rust ignores it elsewhere (Windows/Linux are always OpenThai).
    const engine = useSettings.getState().config.general.ocrEngine;
    if (get().resultEngine !== engine) set({ resultByKey: {}, resultEngine: engine, scope: null });
    if (get().resultByKey[currentKey]) {
      set({ status: "done" });
      return;
    }
    set({ status: "scanning" });
    try {
      const result = await detectText(currentKey, engine);
      // The engine changed while this scan ran: its result belongs to the old
      // engine, so don't cache it under the new one (that scan reports itself).
      if (get().resultEngine !== engine) return;
      set((s) => ({
        status: "done",
        resultByKey: { ...s.resultByKey, [currentKey]: result },
      }));
      const lineCount = result.lines.length;
      if (lineCount > 0) {
        const msg = t(lineCount === 1 ? "app.ocr.detectedOne" : "app.ocr.detectedMany", {
          count: lineCount,
        });
        if (get().scopeHintShown) {
          toast.success(msg);
        } else {
          set({ scopeHintShown: true });
          toast.success(msg, { description: t("app.ocr.scopeHint") });
        }
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

  reset: () => {
    rescanInFlight = null;
    rescanNext = null;
    set({
      mode: false,
      status: "idle",
      resultByKey: {},
      resultEngine: null,
      currentKey: null,
      scope: null,
      // thaiNoticeShown / scopeHintShown intentionally NOT reset — once per session.
    });
  },

  setScope: (rect) => {
    const s = get();
    const result = currentResult(s);
    if (!s.mode || !result || isScopeTooSmall(rect)) return;
    const lines = scopeLines(result.lines, rect).filter((l) => l.text.length > 0);
    if (result.engine !== "openthai") {
      set({ scope: { rect, lines } });
      if (lines.length === 0) toast(t("app.ocr.noText"));
      return;
    }
    // "No text found" waits: the re-scan often finds text the whole image missed.
    const scope: OcrScope = { rect, lines, rescan: "scanning" };
    set({ scope });
    if (rescanInFlight) rescanNext = scope;
    else void rescan(scope);
  },

  clearScope: () => set({ scope: null }),
}));

/**
 * Re-scan `scope`'s padded box with OpenThai and merge what it reads
 * (CP-0100). The result applies only while that same scope, image and engine
 * are current — Esc, a new box, a new image or an engine switch discard it.
 */
async function rescan(scope: OcrScope): Promise<void> {
  const token = {};
  rescanInFlight = token;
  const s0 = useOcr.getState();
  const { currentKey: key, resultEngine: engine } = s0;
  const result = currentResult(s0);
  if (key && result) {
    const region = paddedRegion(scope.rect, result.width, result.height);
    let crop: OcrLine[] | null = null;
    try {
      crop = (await detectText(key, engine ?? undefined, region)).lines;
    } catch (e) {
      console.warn("ocr scope re-scan failed", e);
    }
    const s = useOcr.getState();
    if (s.scope === scope && s.currentKey === key && s.resultEngine === engine) {
      const lines = crop
        ? scopeLines(mergeRescan(result.lines, crop, region, result.width, result.height), scope.rect)
            .filter((l) => l.text.length > 0)
        : scope.lines;
      useOcr.setState({ scope: { rect: scope.rect, lines, rescan: "done" } });
      if (lines.length === 0) toast(t("app.ocr.noText"));
    }
  }
  if (rescanInFlight !== token) return; // reset() while we ran
  rescanInFlight = null;
  const next = rescanNext;
  rescanNext = null;
  if (next && useOcr.getState().scope === next) void rescan(next);
}

export const currentResult = (s: State): OcrResult | null =>
  s.currentKey ? s.resultByKey[s.currentKey] ?? null : null;

/** The lines the OCR layer shows: the scope's, else the whole image's. */
export const visibleLines = (s: State): OcrLine[] | null =>
  s.scope ? s.scope.lines : currentResult(s)?.lines ?? null;
