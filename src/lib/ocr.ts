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
