/** A capture mode that can occupy a ring slot. Values match Rust `CaptureKind`'s
 *  serde names so a slot id is passed straight to `command_ring_select`. */
export type RingWedge = "window" | "full" | "scroll" | "area" | "systemArea";

/**
 * Every capture mode that may be assigned to a ring slot, in the order the
 * Settings checkbox list presents them.
 *
 * This is the single source of truth for "what can go in the ring" — the
 * Settings UI, config validation and the ring renderer all derive from it, so
 * adding a capture mode means editing this list only. The Rust side mirrors it
 * in `ring::RING_MODES`; the two are hand-kept in sync (see CLAUDE.md — there
 * is no codegen).
 */
export const RING_MODE_IDS: readonly RingWedge[] = [
  "window",
  "full",
  "scroll",
  "area",
  "systemArea",
] as const;

/** Modes that only exist on one platform. A config naming one on another OS is
 *  valid but silently skipped at render/dispatch time — see `usableRingModes`. */
export const MACOS_ONLY_RING_MODES: readonly RingWedge[] = ["systemArea"] as const;

/** Minimum / maximum slots. Enforced in Settings *and* on read, so a
 *  hand-edited or newer-version config can never leave the ring empty. */
export const RING_MIN_MODES = 1;
export const RING_MAX_MODES = 4;

/** The v1 (click-to-pick) ring layout, and the v2 default slot assignment. */
export const RING_WEDGES: readonly RingWedge[] = ["window", "full", "scroll", "area"] as const;

/** Short label rendered on each wedge. */
export const RING_LABELS: Record<RingWedge, string> = {
  window: "window",
  full: "full",
  scroll: "scroll",
  area: "area",
  systemArea: "system",
};

/** Longer label for the Settings checkbox list, where there is room to be clear. */
export const RING_MODE_LABELS: Record<RingWedge, string> = {
  window: "Window",
  full: "Full screen",
  scroll: "Scrolling",
  area: "Area",
  systemArea: "System area (macOS)",
};

/**
 * Drop modes this platform cannot run. A config synced from a Mac may list
 * `systemArea` on Windows; rendering a wedge that can never fire would be a
 * dead slot, so it is skipped rather than shown broken.
 *
 * May return fewer than `RING_MIN_MODES` entries (even zero) — callers decide
 * how to recover, because the right fallback differs between "render nothing"
 * and "refuse to open the ring".
 */
export function usableRingModes(modes: readonly RingWedge[], isMac: boolean): RingWedge[] {
  return modes.filter((m) => isMac || !MACOS_ONLY_RING_MODES.includes(m));
}

/**
 * Geometry for an `n`-slot ring: each slot owns an equal sector, the first
 * centered at the top and the rest running clockwise.
 *
 * v1 hardcoded four 90° wedges on cardinal directions. v2's slot count is
 * user-configurable (1–4), so the sweep is derived instead. With n=4 this
 * reproduces the v1 layout exactly — up/right/down/left — which is why the v1
 * click ring can share this renderer.
 */
export function ringSweepDeg(n: number): number {
  return 360 / Math.max(1, n);
}

/** Center angle (degrees, screen coords: y-down, 0 = right) of slot `i` of `n`. */
export function ringSlotAngleDeg(i: number, n: number): number {
  return -90 + i * ringSweepDeg(n);
}

/** Center angle (radians) of each wedge in the fixed 4-slot v1 layout. */
export const RING_ANGLE: Record<RingWedge, number> = {
  window: -Math.PI / 2, // up
  full: 0, // right
  scroll: Math.PI / 2, // down
  area: Math.PI, // left
  systemArea: Math.PI, // unused in the v1 layout
};

/**
 * Which slot contains the point `(px,py)` relative to ring center `(cx,cy)`?
 * Returns `null` inside the dead-zone (distance < `innerRadius`). Screen coords,
 * y-down. Slots partition the full circle with no gaps, so any point outside the
 * dead-zone maps to exactly one slot.
 */
export function slotAtPoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  innerRadius: number,
  n: number,
): number | null {
  const dx = px - cx;
  const dy = py - cy;
  if (Math.hypot(dx, dy) < innerRadius) return null;
  if (n <= 0) return null;
  const sweep = ringSweepDeg(n);
  // Angle measured from the leading edge of slot 0, normalised to [0,360).
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const rel = (((deg - (-90 - sweep / 2)) % 360) + 360) % 360;
  return Math.min(n - 1, Math.floor(rel / sweep));
}

/**
 * Which wedge contains the point, in the fixed 4-slot v1 layout.
 * Kept as a thin wrapper so the v1 click path reads unchanged.
 */
export function wedgeAtPoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  innerRadius: number,
): RingWedge | null {
  const slot = slotAtPoint(px, py, cx, cy, innerRadius, RING_WEDGES.length);
  return slot === null ? null : RING_WEDGES[slot];
}
