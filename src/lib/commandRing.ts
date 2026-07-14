/** The four command-ring wedges. Values match Rust `CaptureKind` names so a
 *  wedge key is passed straight to `command_ring_select`. */
export type RingWedge = "window" | "full" | "scroll" | "area";

/** Wedges in clockwise order from the top, matching the mockup layout:
 *  window (top) → full (right) → scroll (bottom) → area (left). */
export const RING_WEDGES: readonly RingWedge[] = ["window", "full", "scroll", "area"] as const;

/** Short label rendered on each wedge. */
export const RING_LABELS: Record<RingWedge, string> = {
  window: "window",
  full: "full",
  scroll: "scroll",
  area: "area",
};

/** Center angle (radians, screen coords: y-down, 0 = right) of each wedge. */
export const RING_ANGLE: Record<RingWedge, number> = {
  window: -Math.PI / 2, // up
  full: 0, // right
  scroll: Math.PI / 2, // down
  area: Math.PI, // left
};

/**
 * Which wedge contains the point `(px,py)` relative to ring center `(cx,cy)`?
 * Returns `null` inside the dead-zone (distance < `innerRadius`). Screen coords
 * (y grows downward): up = window, right = full, down = scroll, left = area —
 * each a 90° sector centered on its cardinal direction. The whole circle is
 * covered with no gaps, so any point outside the dead-zone maps to a wedge.
 */
export function wedgeAtPoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  innerRadius: number,
): RingWedge | null {
  const dx = px - cx;
  const dy = py - cy;
  if (Math.hypot(dx, dy) < innerRadius) return null;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI; // 0=right, 90=down, -90=up, ±180=left
  if (deg >= -45 && deg < 45) return "full";
  if (deg >= 45 && deg < 135) return "scroll";
  if (deg >= -135 && deg < -45) return "window";
  return "area"; // |deg| >= 135
}
