import type { OcrBox, OcrLine, OcrWord } from "@/lib/ocr";
import { unionAABB } from "@/lib/annotationBounds";

/**
 * OCR area scope (CP-0099): which whole-image words a user-drawn box keeps.
 * Pure image-pixel geometry — no DOM, no store.
 */

/** A release smaller than this (image px, either side) counts as a click. */
export const MIN_SCOPE_PX = 8;

type Point = { x: number; y: number };

const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);

/** Box spanned by two drag points, normalized and clamped to the image. */
export function rectFromPoints(a: Point, b: Point, imgW: number, imgH: number): OcrBox {
  const x0 = clamp(Math.min(a.x, b.x), imgW);
  const y0 = clamp(Math.min(a.y, b.y), imgH);
  const x1 = clamp(Math.max(a.x, b.x), imgW);
  const y1 = clamp(Math.max(a.y, b.y), imgH);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function isScopeTooSmall(r: OcrBox): boolean {
  return r.w < MIN_SCOPE_PX || r.h < MIN_SCOPE_PX;
}

/** Edge-inclusive. */
export function pointInRect(p: Point, r: OcrBox): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

const centre = (b: OcrBox): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const collapse = (s: string) => s.trim().split(/\s+/).join(" ");

/**
 * The units a line can be split into. Its `words` when they spell out its
 * text; otherwise the whole line as one word — Vision drops a word whose range
 * lookup fails, and rebuilding from the rest would silently lose it.
 */
export function lineWords(line: OcrLine): OcrWord[] {
  const { words } = line;
  if (words.length > 0 && words.map((w) => w.text).join(" ") === collapse(line.text)) {
    return words;
  }
  return [{ text: line.text, bbox: line.bbox }];
}

/**
 * Lines kept by `rect`: a word stays when its bbox centre is inside. A fully
 * kept line is returned as the same object; a partly kept one is rebuilt from
 * its kept words. Output is in reading order — rows top-down, then left-to-right.
 */
export function scopeLines(lines: OcrLine[], rect: OcrBox): OcrLine[] {
  const kept: OcrLine[] = [];
  for (const line of lines) {
    const units = lineWords(line);
    const inside = units.filter((w) => pointInRect(centre(w.bbox), rect));
    if (inside.length === 0) continue;
    if (inside.length === units.length) {
      kept.push(line);
      continue;
    }
    kept.push({
      text: inside.map((w) => w.text).join(" "),
      bbox: unionAABB(inside.map((w) => w.bbox))!,
      words: inside,
    });
  }
  return orderLines(kept);
}

function orderLines(lines: OcrLine[]): OcrLine[] {
  const byY = [...lines].sort((a, b) => centre(a.bbox).y - centre(b.bbox).y);
  const rows: { cy: number; h: number; lines: OcrLine[] }[] = [];
  for (const line of byY) {
    const cy = centre(line.bbox).y;
    const row = rows[rows.length - 1];
    if (row && Math.abs(cy - row.cy) < 0.5 * Math.min(line.bbox.h, row.h)) {
      row.lines.push(line);
    } else {
      rows.push({ cy, h: line.bbox.h, lines: [line] });
    }
  }
  return rows.flatMap((r) => r.lines.sort((a, b) => a.bbox.x - b.bbox.x));
}
