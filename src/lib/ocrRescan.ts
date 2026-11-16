import type { OcrBox, OcrLine } from "@/lib/ocr";
import { unionAABB } from "@/lib/annotationBounds";
import { lineWords, pointInRect, rectFromPoints } from "@/lib/ocrScope";

/**
 * OCR scope re-scan (CP-0100): merge the lines OpenThai read from a crop of
 * the scope box into the whole-image lines. Pure image-pixel geometry.
 * Rules and measurements: docs/superpowers/specs/2026-11-16-cp0100-ocr-scope-rescan-design.md
 */

/** OpenThai's detector shrinks the long side to this (det_resize_dims). */
const DET_LIMIT = 1280;
/** Below this detected height (px at detection scale) OpenThai misses or misreads (CP-0098). */
const SMALL_DET_PX = 16;
const OVERLAP = 0.3;

/** The box plus a margin, so lines a tight box cuts through are read whole. */
export function paddedRegion(rect: OcrBox, imgW: number, imgH: number): OcrBox {
  const pad = Math.max(32, 0.1 * Math.max(rect.w, rect.h));
  return rectFromPoints(
    { x: rect.x - pad, y: rect.y - pad },
    { x: rect.x + rect.w + pad, y: rect.y + rect.h + pad },
    imgW,
    imgH,
  );
}

/** Scale the whole-image scan detected at: long side to 1280, capped at 4x. */
export function detScale(imgW: number, imgH: number): number {
  return Math.min(4, DET_LIMIT / Math.max(imgW, imgH));
}

const area = (b: OcrBox) => Math.max(0, b.w) * Math.max(0, b.h);

function overlaps(a: OcrBox, b: OcrBox): boolean {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return false;
  return w * h >= OVERLAP * Math.min(area(a), area(b));
}

/** Within half a line height of a region side that cuts the image (not its border). */
function touchesCutEdge(b: OcrBox, r: OcrBox, imgW: number, imgH: number): boolean {
  const tol = 0.5 * b.h;
  return (
    (r.x > 0 && b.x - r.x < tol) ||
    (r.y > 0 && b.y - r.y < tol) ||
    (r.x + r.w < imgW && r.x + r.w - (b.x + b.w) < tol) ||
    (r.y + r.h < imgH && r.y + r.h - (b.y + b.h) < tol)
  );
}

const visibleChars = (s: string) => [...s.replace(/\s/g, "")].length;

function grow(b: OcrBox, by: number): OcrBox {
  return { x: b.x - by, y: b.y - by, w: b.w + 2 * by, h: b.h + 2 * by };
}

/**
 * Whole-image lines with the crop's lines merged in (scope membership is the
 * caller's `scopeLines`). A crop line is dropped when it is junk (< 2
 * characters) or touches a cut edge of `region` (it may be a fragment). It is
 * added when it overlaps no whole-image line, replaces the overlapped words
 * when every line it overlaps is small, and is discarded when any is large —
 * the crop reads large text no better and adds junk there.
 */
export function mergeRescan(
  whole: OcrLine[],
  crop: OcrLine[],
  region: OcrBox,
  imgW: number,
  imgH: number,
): OcrLine[] {
  const s = detScale(imgW, imgH);
  const small = (l: OcrLine) => l.bbox.h * s < SMALL_DET_PX;
  let base = whole;
  const added: OcrLine[] = [];
  for (const c of crop) {
    if (visibleChars(c.text) < 2 || touchesCutEdge(c.bbox, region, imgW, imgH)) continue;
    const hits = base.filter((l) => overlaps(l.bbox, c.bbox));
    if (hits.some((l) => !small(l))) continue;
    if (hits.length > 0) {
      const cover = grow(c.bbox, 0.25 * c.bbox.h);
      base = base.flatMap((l) => {
        if (!hits.includes(l)) return [l];
        const units = lineWords(l);
        const keep = units.filter(
          (w) => !pointInRect({ x: w.bbox.x + w.bbox.w / 2, y: w.bbox.y + w.bbox.h / 2 }, cover),
        );
        if (keep.length === units.length) return [l];
        if (keep.length === 0) return [];
        return [{ text: keep.map((w) => w.text).join(" "), bbox: unionAABB(keep.map((w) => w.bbox))!, words: keep }];
      });
    }
    added.push(c);
  }
  return [...base, ...added];
}
