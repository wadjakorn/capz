"use client";

import { useOcr, currentResult } from "@/stores/ocr";
import { ocrBoxStyle } from "@/lib/ocr";

/**
 * Transparent, natively-selectable text overlay aligned to the Konva image.
 * Mounted as a sibling of <Stage> inside the same positioned wrapper, so an
 * image-space box maps to screen by a single `* scale` (displayScale) multiply.
 * Pure DOM — never appears in exported PNGs. Native selection + copy work
 * because the spans contain the real text (rendered transparent).
 */
export function OcrLayer({ scale }: { scale: number }) {
  const mode = useOcr((s) => s.mode);
  const result = useOcr(currentResult);

  if (!mode || !result) return null;

  return (
    <div
      data-ocr-layer
      className="absolute left-0 top-0 select-text"
      style={{
        width: result.width * scale,
        height: result.height * scale,
        cursor: "text",
        // Above the Konva canvas; below toolbar/menus.
        zIndex: 5,
      }}
    >
      {result.lines.map((line, li) => {
        // When word boxes exist, place each word; otherwise place the whole
        // line as one selectable block (line-level fallback).
        const units =
          line.words.length > 0
            ? line.words
            : [{ text: line.text, bbox: line.bbox }];
        return units.map((u, wi) => {
          const s = ocrBoxStyle(u.bbox, scale);
          return (
            <span
              key={`${li}-${wi}`}
              style={{
                position: "absolute",
                left: s.left,
                top: s.top,
                height: s.height,
                fontSize: s.fontSize,
                lineHeight: `${s.height}px`,
                color: "transparent",
                whiteSpace: "pre",
                userSelect: "text",
                // Trailing space so word-to-word copy is space-separated;
                // block-per-line below preserves newlines.
              }}
            >
              {u.text}
              {wi < units.length - 1 ? " " : "\n"}
            </span>
          );
        });
      })}
    </div>
  );
}
