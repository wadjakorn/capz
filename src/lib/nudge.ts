/**
 * Arrow-key nudge (CP-0056): move the selected annotation by a fixed step in
 * image pixels, so the distance does not depend on the on-screen zoom.
 */

/** Plain Arrow step, image px. */
export const NUDGE_STEP = 1;
/** Shift+Arrow step, image px. */
export const NUDGE_STEP_LARGE = 10;
/** Nudges closer together than this (and with nothing else in between) share one undo entry. */
export const NUDGE_COALESCE_MS = 1000;

const DIRS: Record<string, readonly [number, number]> = {
  arrowleft: [-1, 0],
  arrowright: [1, 0],
  arrowup: [0, -1],
  arrowdown: [0, 1],
};

/** The (dx, dy) an arrow key moves the selection by, or null for any other key. */
export function nudgeDelta(
  key: string,
  shift: boolean,
): { dx: number; dy: number } | null {
  const d = DIRS[key.toLowerCase()];
  if (!d) return null;
  const step = shift ? NUDGE_STEP_LARGE : NUDGE_STEP;
  return { dx: d[0] * step, dy: d[1] * step };
}
