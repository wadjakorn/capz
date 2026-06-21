export type OcrBox = { x: number; y: number; w: number; h: number };
export type OcrWord = { text: string; bbox: OcrBox };
export type OcrLine = { text: string; bbox: OcrBox; words: OcrWord[] };
export type OcrResult = {
  width: number;
  height: number;
  lines: OcrLine[];
  languagesUsed: string[];
  thaiAvailable: boolean;
};

/** Run native OCR on the image at `path`. Boxes are top-left image-pixel space. */
export async function detectText(path: string): Promise<OcrResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<OcrResult>("ocr_detect", { path });
}

/** Map an image-space box to screen pixels for the overlay (`displayScale`). */
export function ocrBoxStyle(box: OcrBox, scale: number) {
  return {
    left: box.x * scale,
    top: box.y * scale,
    width: box.w * scale,
    height: box.h * scale,
    fontSize: box.h * scale,
  };
}

/**
 * Horizontal scale that fits `text` to `boxW` given a text measurer.
 * `fontPx` and `boxW` must be in the SAME coordinate space (use image-pixel
 * space so the result is zoom-invariant). Falls back to 1 (no stretch) when
 * the measurer can't produce a usable width (e.g. no canvas in SSR/jsdom).
 * Clamped to [0.1, 10] so degenerate OCR boxes can't produce wild stretches.
 */
export function computeFitScaleX(
  text: string,
  fontPx: number,
  boxW: number,
  measure: (text: string, fontPx: number) => number,
): number {
  const w = measure(text, fontPx);
  if (!Number.isFinite(w) || w <= 0) return 1;
  const s = boxW / w;
  if (!Number.isFinite(s)) return 1;
  return Math.min(10, Math.max(0.1, s));
}
