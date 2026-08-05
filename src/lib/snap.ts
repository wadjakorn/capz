/**
 * 1D snap: pick the smallest delta needed to align one of the moving rect's
 * candidate edges (min/mid/max) with any target value, provided it's within
 * `thresholdImg` (image-pixel coords). Returns the snap delta to apply to the
 * moving rect's `min`, plus the target value to draw a guide line at.
 */
export type SnapHit = { delta: number; guide: number };

export type SnapBox = { x: number; y: number; w: number; h: number };

export type SnapBoxHit = { box: SnapBox; guides: { x: number[]; y: number[] } };

export function snapValue(
  value: number,
  targets: number[],
  thresholdImg: number,
): SnapHit | null {
  if (!targets.length || thresholdImg <= 0) return null;
  let best: SnapHit | null = null;
  let bestAbs = thresholdImg;
  for (const t of targets) {
    const d = t - value;
    const ad = Math.abs(d);
    if (ad <= bestAbs) {
      bestAbs = ad;
      best = { delta: d, guide: t };
    }
  }
  return best;
}

export function snapAxis(
  movingMin: number,
  movingSize: number,
  targets: number[],
  thresholdImg: number,
): SnapHit | null {
  if (!targets.length || thresholdImg <= 0) return null;
  const movingEdges = [
    movingMin,
    movingMin + movingSize / 2,
    movingMin + movingSize,
  ];
  let best: SnapHit | null = null;
  let bestAbs = thresholdImg;
  for (const t of targets) {
    for (const e of movingEdges) {
      const d = t - e;
      const ad = Math.abs(d);
      if (ad <= bestAbs) {
        bestAbs = ad;
        best = { delta: d, guide: t };
      }
    }
  }
  return best;
}

/**
 * Snap a resized box by nudging the edge that moved the most on each axis.
 * The opposite edge stays anchored, so resize snapping behaves like a true
 * magnetic resize rather than a whole-box drag.
 */
export function snapResizedBox(
  oldBox: SnapBox,
  newBox: SnapBox,
  targetsX: number[],
  targetsY: number[],
  thresholdImg: number,
  minSize = 5,
): SnapBoxHit | null {
  if (thresholdImg <= 0 || (!targetsX.length && !targetsY.length)) return null;

  const oldRight = oldBox.x + oldBox.w;
  const oldBottom = oldBox.y + oldBox.h;
  const newRight = newBox.x + newBox.w;
  const newBottom = newBox.y + newBox.h;
  const leftMoved = Math.abs(newBox.x - oldBox.x);
  const rightMoved = Math.abs(newRight - oldRight);
  const topMoved = Math.abs(newBox.y - oldBox.y);
  const bottomMoved = Math.abs(newBottom - oldBottom);

  let x = newBox.x;
  let y = newBox.y;
  let w = newBox.w;
  let h = newBox.h;
  const guidesX: number[] = [];
  const guidesY: number[] = [];
  const EPS = 1e-6;

  if (leftMoved > rightMoved + EPS) {
    const hit = snapValue(newBox.x, targetsX, thresholdImg);
    if (hit && w - hit.delta >= minSize) {
      x += hit.delta;
      w -= hit.delta;
      guidesX.push(hit.guide);
    }
  } else if (rightMoved > leftMoved + EPS) {
    const hit = snapValue(newRight, targetsX, thresholdImg);
    if (hit && w + hit.delta >= minSize) {
      w += hit.delta;
      guidesX.push(hit.guide);
    }
  } else {
    const hit = snapAxis(newBox.x, newBox.w, targetsX, thresholdImg);
    if (hit) {
      x += hit.delta;
      guidesX.push(hit.guide);
    }
  }

  if (topMoved > bottomMoved + EPS) {
    const hit = snapValue(newBox.y, targetsY, thresholdImg);
    if (hit && h - hit.delta >= minSize) {
      y += hit.delta;
      h -= hit.delta;
      guidesY.push(hit.guide);
    }
  } else if (bottomMoved > topMoved + EPS) {
    const hit = snapValue(newBottom, targetsY, thresholdImg);
    if (hit && h + hit.delta >= minSize) {
      h += hit.delta;
      guidesY.push(hit.guide);
    }
  } else {
    const hit = snapAxis(newBox.y, newBox.h, targetsY, thresholdImg);
    if (hit) {
      y += hit.delta;
      guidesY.push(hit.guide);
    }
  }

  if (!guidesX.length && !guidesY.length) return null;
  return {
    box: { x, y, w, h },
    guides: { x: guidesX, y: guidesY },
  };
}

/** Collect unique snap target lines along one axis. */
export function collectTargets(values: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of values) {
    const k = Math.round(v * 100) / 100;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}
