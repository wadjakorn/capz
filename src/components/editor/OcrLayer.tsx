"use client";

import { useEffect, useMemo, useRef } from "react";
import { useOcr, currentResult } from "@/stores/ocr";
import { ocrBoxStyle, computeFitScaleX } from "@/lib/ocr";

const FONT_STACK = '"Noto Sans Thai", system-ui, -apple-system, sans-serif';
// Font size (image-pixel space) for measurement & rendering, as a fraction of
// line-box height so glyphs sit within the box before horizontal fit.
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
 * Visible OCR text overlay — one solid-white chip PER LINE, aligned to the
 * Konva image. Mounted as a sibling of <Stage> in the same positioned wrapper,
 * so an image-space box maps to screen by `* scale` (displayScale). Each line's
 * text is rendered near-black and horizontally scaled to fill its line box, so
 * native selection highlights what the user sees. ⌘/Ctrl+A selects the whole
 * overlay. Pure DOM — never appears in exported PNGs.
 */
export function OcrLayer({
  scale,
  originPxX = 0,
  originPxY = 0,
}: {
  scale: number;
  // Screen-px offset of image coord (0,0) from the wrapper's top-left. Non-zero
  // when the canvas expands past the image's top/left edge (element overflow).
  originPxX?: number;
  originPxY?: number;
}) {
  const mode = useOcr((s) => s.mode);
  const result = useOcr(currentResult);
  const layerRef = useRef<HTMLDivElement>(null);

  // One unit per non-empty line (line box + full line text), fitted once per
  // result (image-space → zoom-invariant fitX).
  const lines = useMemo(() => {
    if (!result) return [];
    return result.lines
      .map((line, li) => {
        const fontPxImg = line.bbox.h * FONT_FACTOR;
        return {
          key: String(li),
          text: line.text,
          bbox: line.bbox,
          fontPxImg,
          fitX: computeFitScaleX(line.text, fontPxImg, line.bbox.w, measureText),
        };
      })
      .filter((l) => l.text.length > 0);
  }, [result]);

  // ⌘/Ctrl+A selects the entire overlay, scoped to the OCR text. The selection,
  // highlight, and ⌘C copy that follow are all native OS behavior. Capture phase
  // so it pre-empts any other Cmd+A handling while OCR read mode is on.
  useEffect(() => {
    if (!mode) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "a" && e.key !== "A") return;
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      const layer = layerRef.current;
      const sel = window.getSelection();
      if (!layer || !sel) return;
      e.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(layer);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mode]);

  if (!mode || !result) return null;

  return (
    <div
      ref={layerRef}
      data-ocr-layer
      className="absolute select-text"
      style={{
        left: originPxX,
        top: originPxY,
        width: result.width * scale,
        height: result.height * scale,
        cursor: "text",
        zIndex: 5,
      }}
    >
      {lines.map((l) => {
        const s = ocrBoxStyle(l.bbox, scale);
        return (
          <span
            key={l.key}
            style={{
              position: "absolute",
              left: s.left,
              top: s.top,
              width: s.width,
              height: s.height,
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              background: "#ffffff",
              borderRadius: 2,
              userSelect: "text",
            }}
          >
            <span
              style={{
                display: "inline-block",
                color: "#0b0b0b",
                fontFamily: FONT_STACK,
                fontSize: l.fontPxImg * scale,
                lineHeight: 1,
                whiteSpace: "pre",
                transform: `scaleX(${l.fitX})`,
                transformOrigin: "left center",
              }}
            >
              {l.text}
              {"\n"}
            </span>
          </span>
        );
      })}
    </div>
  );
}
