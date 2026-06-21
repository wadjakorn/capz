"use client";

import { useMemo } from "react";
import { useOcr, currentResult } from "@/stores/ocr";
import { ocrBoxStyle, computeFitScaleX } from "@/lib/ocr";

const FONT_STACK = '"Noto Sans Thai", system-ui, -apple-system, sans-serif';
// Font size (image-pixel space) used for measurement & rendering, as a
// fraction of box height so glyphs sit within the box before horizontal fit.
const FONT_FACTOR = 0.8;

// Shared offscreen text measurer. Returns 0 when canvas/text metrics are
// unavailable (SSR / jsdom) so computeFitScaleX falls back to no-stretch.
let measureCanvas: HTMLCanvasElement | null = null;
function measureText(text: string, fontPx: number): number {
  if (typeof document === "undefined") return 0;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = `${fontPx}px ${FONT_STACK}`;
  return ctx.measureText(text).width;
}

/**
 * Visible, box-fitted OCR text overlay aligned to the Konva image. Mounted as a
 * sibling of <Stage> in the same positioned wrapper, so an image-space box maps
 * to screen by `* scale` (displayScale). Each unit is a white-translucent chip
 * with the recognized text rendered near-black and horizontally scaled to fill
 * its box — so the native selection highlights exactly what the user sees.
 * Pure DOM — never appears in exported PNGs.
 */
export function OcrLayer({ scale }: { scale: number }) {
  const mode = useOcr((s) => s.mode);
  const result = useOcr(currentResult);

  // Fit each unit once per result (image-space → zoom-invariant fitX).
  const units = useMemo(() => {
    if (!result) return [];
    const out: {
      key: string;
      text: string;
      bbox: { x: number; y: number; w: number; h: number };
      fitX: number;
      fontPxImg: number;
      lineEnd: boolean;
    }[] = [];
    result.lines.forEach((line, li) => {
      const us =
        line.words.length > 0
          ? line.words
          : [{ text: line.text, bbox: line.bbox }];
      us.forEach((u, wi) => {
        const fontPxImg = u.bbox.h * FONT_FACTOR;
        out.push({
          key: `${li}-${wi}`,
          text: u.text,
          bbox: u.bbox,
          fontPxImg,
          fitX: computeFitScaleX(u.text, fontPxImg, u.bbox.w, measureText),
          lineEnd: wi === us.length - 1,
        });
      });
    });
    return out;
  }, [result]);

  if (!mode || !result) return null;

  return (
    <div
      data-ocr-layer
      className="absolute left-0 top-0 select-text"
      style={{
        width: result.width * scale,
        height: result.height * scale,
        cursor: "text",
        zIndex: 5,
      }}
    >
      {units.map((u) => {
        const s = ocrBoxStyle(u.bbox, scale);
        return (
          <span
            key={u.key}
            style={{
              position: "absolute",
              left: s.left,
              top: s.top,
              width: s.width,
              height: s.height,
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              background: "rgba(255,255,255,0.7)",
              borderRadius: 2,
              userSelect: "text",
            }}
          >
            <span
              style={{
                display: "inline-block",
                color: "#0b0b0b",
                fontFamily: FONT_STACK,
                fontSize: u.fontPxImg * scale,
                lineHeight: 1,
                whiteSpace: "pre",
                transform: `scaleX(${u.fitX})`,
                transformOrigin: "left center",
              }}
            >
              {u.text}
              {u.lineEnd ? "\n" : " "}
            </span>
          </span>
        );
      })}
    </div>
  );
}
