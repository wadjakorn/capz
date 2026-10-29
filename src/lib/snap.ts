/**
 * Magnetic snapping for drag-move, live resize and point handles (CP-0025).
 *
 * Everything here is in image-pixel coords. A target line knows whether it
 * comes from the canvas (outer canvas / image edges and centres) or from
 * another element, plus its extent on the other axis, so guides can be drawn
 * as segments that show where the alignment came from.
 *
 * Pick rule, per axis: among (moving edge, line) pairs within `threshold`,
 * the lowest score wins, where score = distance minus `canvasBonus` for canvas
 * lines (the owner wants the canvas to win when many elements are around).
 * Scores within `tieEps` are tied → canvas first, then the element nearest the
 * moving box on the other axis. After the nudge every line aligned with a
 * moving edge (within `tieEps`) becomes a guide, so ties draw every line.
 */
import type { Platform } from "@/lib/shortcuts";

export type SnapBox = { x: number; y: number; w: number; h: number };

export type SnapKind = "canvas" | "element";
/** A target line at `at`, spanning `lo..hi` on the other axis. */
export type SnapLine = { at: number; kind: SnapKind; lo: number; hi: number };
export type SnapLines = { x: SnapLine[]; y: SnapLine[] };
/** A guide segment at `at`, drawn from `from` to `to` on the other axis. */
export type SnapGuide = { at: number; kind: SnapKind; from: number; to: number };
export type SnapGuides = { x: SnapGuide[]; y: SnapGuide[] };

export type SnapOpts = {
  threshold: number;
  canvasBonus: number;
  tieEps: number;
};

/** Screen px within which an edge sticks to a line. */
export const SNAP_SCREEN_PX = 6;
/** Screen px of head start a canvas line gets over an element line. */
export const SNAP_CANVAS_BONUS_PX = 2;
/** Screen px within which two lines count as the same alignment. */
export const SNAP_TIE_PX = 0.5;

export function snapOpts(scale: number): SnapOpts {
  const s = scale > 0 ? scale : 1;
  return {
    threshold: SNAP_SCREEN_PX / s,
    canvasBonus: SNAP_CANVAS_BONUS_PX / s,
    tieEps: SNAP_TIE_PX / s,
  };
}

export const NO_GUIDES: SnapGuides = { x: [], y: [] };

/** Key held to bypass snapping while dragging/resizing. */
export type SnapBypassKey = "alt" | "mod" | "none";

export function isSnapBypass(
  mods: { altKey: boolean; metaKey: boolean; ctrlKey: boolean },
  key: SnapBypassKey,
  platform: Platform,
): boolean {
  if (key === "alt") return mods.altKey;
  if (key === "mod") return platform === "mac" ? mods.metaKey : mods.ctrlKey;
  return false;
}

const thirds = (min: number, size: number) => [min, min + size / 2, min + size];

function intersects(a: SnapBox, b: SnapBox): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/**
 * Target lines: canvas (`canvas` = the exported canvas box, `image` = the base
 * image at the origin) and the boxes of other elements. Elements outside
 * `viewport` are dropped (null = keep all). Same position + kind collapses.
 */
export function buildSnapLines(p: {
  canvas: SnapBox;
  image: { w: number; h: number } | null;
  others: SnapBox[];
  viewport: SnapBox | null;
}): SnapLines {
  const c = p.canvas;
  const x: SnapLine[] = [];
  const y: SnapLine[] = [];
  const seen = new Set<string>();
  const push = (arr: SnapLine[], axis: string, l: SnapLine) => {
    const k = `${axis}:${l.kind}:${Math.round(l.at * 100) / 100}`;
    if (seen.has(k)) return;
    seen.add(k);
    arr.push(l);
  };
  const canvasBoxes: SnapBox[] = [];
  if (c.w > 0 && c.h > 0) canvasBoxes.push(c);
  if (p.image && p.image.w > 0 && p.image.h > 0) {
    canvasBoxes.push({ x: 0, y: 0, w: p.image.w, h: p.image.h });
  }
  for (const b of canvasBoxes) {
    for (const at of thirds(b.x, b.w)) push(x, "x", { at, kind: "canvas", lo: c.y, hi: c.y + c.h });
    for (const at of thirds(b.y, b.h)) push(y, "y", { at, kind: "canvas", lo: c.x, hi: c.x + c.w });
  }
  for (const b of p.others) {
    if (p.viewport && !intersects(b, p.viewport)) continue;
    for (const at of thirds(b.x, b.w)) push(x, "x", { at, kind: "element", lo: b.y, hi: b.y + b.h });
    for (const at of thirds(b.y, b.h)) push(y, "y", { at, kind: "element", lo: b.x, hi: b.x + b.w });
  }
  return { x, y };
}

type Pick = { delta: number; score: number; line: SnapLine };

function gap(lo: number, hi: number, l: SnapLine): number {
  return Math.max(0, l.lo - hi, lo - l.hi);
}

/** Best nudge for `edges` (spanning `lo..hi` on the other axis), or null. */
function pickAxis(
  edges: number[],
  lines: SnapLine[],
  lo: number,
  hi: number,
  o: SnapOpts,
): Pick | null {
  if (o.threshold <= 0) return null;
  let best: Pick | null = null;
  for (const line of lines) {
    for (const e of edges) {
      const delta = line.at - e;
      const dist = Math.abs(delta);
      if (dist > o.threshold) continue;
      const score = dist - (line.kind === "canvas" ? o.canvasBonus : 0);
      const cand = { delta, score, line };
      if (!best || score < best.score - o.tieEps) {
        best = cand;
        continue;
      }
      if (score > best.score + o.tieEps) continue;
      // Tied: canvas first, then the element nearest on the other axis.
      if (line.kind !== best.line.kind) {
        if (line.kind === "canvas") best = cand;
        continue;
      }
      const g = gap(lo, hi, line);
      const bg = gap(lo, hi, best.line);
      if (g < bg || (g === bg && dist < Math.abs(best.delta))) best = cand;
    }
  }
  return best;
}

/** Every line aligned with one of `edges`, as guide segments. */
function alignedGuides(
  edges: number[],
  lines: SnapLine[],
  lo: number,
  hi: number,
  o: SnapOpts,
): SnapGuide[] {
  const out: SnapGuide[] = [];
  for (const line of lines) {
    if (!edges.some((e) => Math.abs(line.at - e) <= o.tieEps)) continue;
    const from = Math.min(lo, line.lo);
    const to = Math.max(hi, line.hi);
    const dup = out.find((g) => g.kind === line.kind && Math.abs(g.at - line.at) <= o.tieEps);
    if (dup) {
      dup.from = Math.min(dup.from, from);
      dup.to = Math.max(dup.to, to);
    } else {
      out.push({ at: line.at, kind: line.kind, from, to });
    }
  }
  return out;
}

/** Snap a whole box being dragged: its min / centre / max edges on each axis. */
export function snapMove(
  box: SnapBox,
  lines: SnapLines,
  o: SnapOpts,
): { dx: number; dy: number; guides: SnapGuides } {
  const px = pickAxis(thirds(box.x, box.w), lines.x, box.y, box.y + box.h, o);
  const py = pickAxis(thirds(box.y, box.h), lines.y, box.x, box.x + box.w, o);
  const dx = px?.delta ?? 0;
  const dy = py?.delta ?? 0;
  const x = box.x + dx;
  const y = box.y + dy;
  return {
    dx,
    dy,
    guides: {
      x: px ? alignedGuides(thirds(x, box.w), lines.x, y, y + box.h, o) : [],
      y: py ? alignedGuides(thirds(y, box.h), lines.y, x, x + box.w, o) : [],
    },
  };
}

/** Snap a single point (an arrow endpoint / control handle). */
export function snapPoint(
  p: { x: number; y: number },
  lines: SnapLines,
  o: SnapOpts,
): { x: number; y: number; guides: SnapGuides } {
  const px = pickAxis([p.x], lines.x, p.y, p.y, o);
  const py = pickAxis([p.y], lines.y, p.x, p.x, o);
  const x = p.x + (px?.delta ?? 0);
  const y = p.y + (py?.delta ?? 0);
  return {
    x,
    y,
    guides: {
      x: px ? alignedGuides([x], lines.x, y, y, o) : [],
      y: py ? alignedGuides([y], lines.y, x, x, o) : [],
    },
  };
}

export type ResizeSnapOpts = SnapOpts & {
  /** Corner anchors keep the box's aspect ratio. */
  keepRatio?: boolean;
  /** The opposite edge mirrors the moving one (resize from centre). */
  centered?: boolean;
  minSize?: number;
};

/**
 * Snap a box mid-resize. `anchor` is the Konva Transformer anchor being
 * dragged ("top-left", "middle-right", …): only its edges move. With
 * `keepRatio` on a corner, the axis with the better pick snaps and the other
 * is derived from the ratio, keeping the opposite corner (or centre) fixed.
 */
export function snapResize(
  box: SnapBox,
  anchor: string,
  lines: SnapLines,
  o: ResizeSnapOpts,
): { box: SnapBox; guides: SnapGuides } | null {
  const minSize = o.minSize ?? 1;
  const mx = anchor.includes("left") ? "left" : anchor.includes("right") ? "right" : null;
  const my = anchor.includes("top") ? "top" : anchor.includes("bottom") ? "bottom" : null;
  const k = o.centered ? 2 : 1;

  const px = mx
    ? pickAxis([mx === "left" ? box.x : box.x + box.w], lines.x, box.y, box.y + box.h, o)
    : null;
  const py = my
    ? pickAxis([my === "top" ? box.y : box.y + box.h], lines.y, box.x, box.x + box.w, o)
    : null;

  // A nudge of `d` on the moving edge → new [min, size] on that axis.
  const applyAxis = (min: number, size: number, side: "lo" | "hi", d: number) => {
    if (side === "lo") return { min: min + d, size: size - d * k };
    return { min: o.centered ? min - d : min, size: size + d * k };
  };
  // Re-place an axis after its size changed: keep the fixed side (or centre).
  const placeAxis = (min: number, size: number, next: number, side: "lo" | "hi") => {
    if (o.centered) return min + size / 2 - next / 2;
    return side === "lo" ? min + size - next : min;
  };

  let { x, y, w, h } = box;
  if (o.keepRatio && mx && my && (px || py) && box.w > 0 && box.h > 0) {
    const ratio = box.w / box.h;
    const useX = px && (!py || px.score <= py.score);
    if (useX) {
      const ax = applyAxis(box.x, box.w, mx === "left" ? "lo" : "hi", px.delta);
      const nh = ax.size / ratio;
      if (ax.size < minSize || nh < minSize) return null;
      x = ax.min;
      w = ax.size;
      h = nh;
      y = placeAxis(box.y, box.h, nh, my === "top" ? "lo" : "hi");
    } else if (py) {
      const ay = applyAxis(box.y, box.h, my === "top" ? "lo" : "hi", py.delta);
      const nw = ay.size * ratio;
      if (ay.size < minSize || nw < minSize) return null;
      y = ay.min;
      h = ay.size;
      w = nw;
      x = placeAxis(box.x, box.w, nw, mx === "left" ? "lo" : "hi");
    }
  } else {
    let snapped = false;
    if (px && mx) {
      const ax = applyAxis(box.x, box.w, mx === "left" ? "lo" : "hi", px.delta);
      if (ax.size >= minSize) {
        x = ax.min;
        w = ax.size;
        snapped = true;
      }
    }
    if (py && my) {
      const ay = applyAxis(box.y, box.h, my === "top" ? "lo" : "hi", py.delta);
      if (ay.size >= minSize) {
        y = ay.min;
        h = ay.size;
        snapped = true;
      }
    }
    if (!snapped) return null;
  }

  const edgesX = mx ? (o.centered ? [x, x + w] : [mx === "left" ? x : x + w]) : [];
  const edgesY = my ? (o.centered ? [y, y + h] : [my === "top" ? y : y + h]) : [];
  return {
    box: { x, y, w, h },
    guides: {
      x: alignedGuides(edgesX, lines.x, y, y + h, o),
      y: alignedGuides(edgesY, lines.y, x, x + w, o),
    },
  };
}

/** Rotate a vector by `q` clockwise quarter turns (screen y points down). */
function turn(v: { x: number; y: number }, q: number) {
  let { x, y } = v;
  for (let i = 0; i < q; i++) [x, y] = [-y, x];
  return { x: x + 0, y: y + 0 }; // normalise -0
}

/**
 * `snapResize` for a box turned by `quarter` × 90° clockwise about its origin
 * (a Konva node rotated 90/180/270°). `box.x/y` is the turned origin and
 * `w/h` the un-turned size; `anchor` is the Transformer's anchor name, which
 * is in the box's own frame. The drawn box is still axis-aligned, so snap that
 * and map the result back.
 */
export function snapResizeTurned(
  box: SnapBox,
  quarter: number,
  anchor: string,
  lines: SnapLines,
  o: ResizeSnapOpts,
): { box: SnapBox; guides: SnapGuides } | null {
  const q = ((Math.round(quarter) % 4) + 4) % 4;
  if (q === 0) return snapResize(box, anchor, lines, o);
  const offsets = (w: number, h: number) =>
    [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: 0, y: h },
      { x: w, y: h },
    ].map((c) => turn(c, q));
  const min = (w: number, h: number) => {
    const cs = offsets(w, h);
    return { x: Math.min(...cs.map((c) => c.x)), y: Math.min(...cs.map((c) => c.y)) };
  };
  const m0 = min(box.w, box.h);
  const odd = q % 2 === 1;
  const drawn = {
    x: box.x + m0.x,
    y: box.y + m0.y,
    w: odd ? box.h : box.w,
    h: odd ? box.w : box.h,
  };
  const dir = turn(
    {
      x: anchor.includes("left") ? -1 : anchor.includes("right") ? 1 : 0,
      y: anchor.includes("top") ? -1 : anchor.includes("bottom") ? 1 : 0,
    },
    q,
  );
  const v = dir.y < 0 ? "top" : dir.y > 0 ? "bottom" : "middle";
  const hz = dir.x < 0 ? "left" : dir.x > 0 ? "right" : "center";
  const hit = snapResize(drawn, `${v}-${hz}`, lines, o);
  if (!hit) return null;
  const w = odd ? hit.box.h : hit.box.w;
  const h = odd ? hit.box.w : hit.box.h;
  const m = min(w, h);
  return { box: { x: hit.box.x - m.x, y: hit.box.y - m.y, w, h }, guides: hit.guides };
}
