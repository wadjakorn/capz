"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import {
  RING_CANCEL,
  RING_LABELS,
  holdRingSlots,
  RING_WEDGES,
  ringSlotAngleDeg,
  ringSweepDeg,
  slotAtPoint,
  type RingSlot,
  type RingWedge,
} from "@/lib/commandRing";

/** Fraction of the half-min-dimension used for the outer ring / dead-zone. */
const OUTER_FRAC = 0.9;
const INNER_FRAC = 0.46;
/** Visible center-button disc as a fraction of the inner (dead-zone) radius. */
const CENTER_FRAC = 0.8;
/**
 * Hold mode (command ring v2, CP-0038): the ring is opened unfocused by Rust,
 * cycles via `ring:highlight`, and fires on modifier release. It must NOT grab
 * focus, close on blur, or handle clicks — the app underneath keeps focus for
 * the whole gesture. Rust bakes this into the URL at window-creation time
 * because the two modes cannot share a reused webview.
 */
function isHoldMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("hold");
}

/** What the cursor is over: a capture wedge, the center editor button, or
 *  nothing (outside the ring → dismiss). */
type Target = RingSlot | "center";

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/**
 * Annular sector for one slot of `sweepDeg` centered on `centerDeg`.
 *
 * `sweepDeg` is a parameter rather than a hardcoded 90 because v2's slot count
 * is user-configurable (1-4). The `large-arc-flag` follows from it: a sweep past
 * 180° must set the flag or SVG draws the minor arc instead — which is the
 * single-slot ring, where one sector covers the whole circle.
 */
function wedgePath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  centerDeg: number,
  sweepDeg: number,
): string {
  // A full circle can't be expressed as one arc (start and end coincide, so SVG
  // draws nothing); shave a hair off so the single-slot ring renders.
  const sweep = Math.min(sweepDeg, 359.9);
  const a0 = centerDeg - sweep / 2;
  const a1 = centerDeg + sweep / 2;
  const large = sweep > 180 ? 1 : 0;
  const [x0o, y0o] = polar(cx, cy, rOuter, a0);
  const [x1o, y1o] = polar(cx, cy, rOuter, a1);
  const [x1i, y1i] = polar(cx, cy, rInner, a1);
  const [x0i, y0i] = polar(cx, cy, rInner, a0);
  return `M ${x0o} ${y0o} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 ${large} 0 ${x0i} ${y0i} Z`;
}

function closeRing() {
  invoke("close_command_ring").catch((e) => console.error("close_command_ring failed", e));
}

export default function CommandRingPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<Target | null>(null);
  const selectedRef = useRef(false);
  const [hold] = useState(isHoldMode);
  /** Slots to draw. v1 is always the fixed four; v2 gets its configured 1-4
   *  from Rust with the first `ring:highlight`. */
  const [slots, setSlots] = useState<readonly RingSlot[]>(() =>
    isHoldMode() ? holdRingSlots(RING_WEDGES) : RING_WEDGES,
  );
  /** Highlighted slot index in hold mode (null = v1 / pointer-driven). */
  const [heldIndex, setHeldIndex] = useState<number | null>(null);

  // The ring window is transparent — clear the opaque app background so only
  // the ring paints (same trick as the scroll HUD).
  useEffect(() => {
    const prevBody = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    return () => {
      document.body.style.background = prevBody;
      document.documentElement.style.background = prevHtml;
    };
  }, []);

  // Measure so wedge hit-testing uses real pixel geometry.
  useEffect(() => {
    const measure = () => {
      const el = rootRef.current;
      if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Grab focus so Esc and focus-loss both work without a click first. Best
  // effort from JS: the window is already focused by Rust (show_command_ring),
  // and no capability grants JS set-focus — so swallow the rejection exactly
  // like the area overlay does, rather than surfacing it as a runtime error.
  useEffect(() => {
    // Hold mode never takes focus and never closes on blur: the source app is
    // meant to stay focused, so "not focused" is the normal state, and Rust
    // owns the ring's lifetime (it closes on modifier release).
    if (hold) return;
    getCurrentWindow().setFocus().catch(() => {});
    let disposed = false;
    // Close when focus is lost (clicked another app, or hotkey toggled). Guarded
    // by a short grace window so the initial setFocus round-trip can't self-close.
    const readyAt = Date.now() + 250;
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused && !disposed && !selectedRef.current && Date.now() > readyAt) {
        closeRing();
      }
    });
    return () => {
      disposed = true;
      void unlisten.then((f) => f());
    };
  }, [hold]);

  useEffect(() => {
    // Hold mode is unfocused, so this window receives no key events at all —
    // wiring Escape here would do nothing. (Cancelling a hold gesture would
    // need a globally-registered Escape, which is exactly the transient
    // registration CP-0038 rules out.)
    if (hold) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRing();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hold]);

  // Hold mode: Rust drives the highlight and tells us which slots to draw.
  useEffect(() => {
    if (!hold) return;
    // Rust sends the full cycle, cancel slot included — it appends it, so the
    // two ends can't disagree about where cancel sits.
    const un = listen<{ modes: RingSlot[]; index: number }>("ring:highlight", (e) => {
      const { modes, index } = e.payload;
      if (modes.length > 0) setSlots(modes);
      setHeldIndex(index);
    });
    // Rust creates this window and emits the opening highlight in the same
    // breath, so that first emit lands before this listener exists. Announcing
    // readiness makes it a handshake rather than a race against a guessed delay.
    void un.then(() => emit("ring:ready"));
    return () => {
      void un.then((f) => f());
    };
  }, [hold]);

  const cx = size.w / 2;
  const cy = size.h / 2;
  const half = Math.min(size.w, size.h) / 2;
  const rOuter = half * OUTER_FRAC;
  const rInner = half * INNER_FRAC;
  const rCenter = rInner * CENTER_FRAC;
  const rLabel = (rInner + rOuter) / 2;

  // Center (dead-zone) → editor button; ring band → capture wedge; beyond the
  // outer edge → null (dismiss). The whole inner circle is the editor hit-area,
  // not just the visible disc, so clicks near the center never fall through.
  const targetAt = useCallback(
    (px: number, py: number): Target | null => {
      const d = Math.hypot(px - cx, py - cy);
      // No center button in hold mode — the dead-zone is inert, not a target.
      if (d < rInner) return hold ? null : "center";
      if (d > rOuter) return null;
      const slot = slotAtPoint(px, py, cx, cy, rInner, slots.length);
      return slot === null ? null : slots[slot];
    },
    [cx, cy, rInner, rOuter, slots, hold],
  );

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (hold) return;
      setHover(targetAt(e.clientX, e.clientY));
    },
    [targetAt, hold],
  );

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      // Hold mode is click-through by intent: the ring is an unfocused HUD and
      // the gesture ends on modifier release, never on a click.
      if (hold) return;
      const t = targetAt(e.clientX, e.clientY);
      if (t === null) {
        // Click outside the ring dismisses it.
        closeRing();
        return;
      }
      if (selectedRef.current) return;
      selectedRef.current = true;
      if (t === "center") {
        invoke("command_ring_editor").catch((err) =>
          console.error("command_ring_editor failed", err),
        );
      } else if (t === RING_CANCEL) {
        // Not reachable today (v1's slots are capture modes only), but the type
        // allows it — dismiss rather than dispatch "cancel" as a capture kind.
        closeRing();
      } else {
        invoke("command_ring_select", { kind: t }).catch((err) =>
          console.error("command_ring_select failed", err),
        );
      }
    },
    [targetAt, hold],
  );

  const ready = size.w > 0 && size.h > 0;
  const sweep = ringSweepDeg(slots.length);
  // One highlight source: the cycled index in hold mode, the pointer otherwise.
  const activeIndex =
    heldIndex !== null
      ? Math.min(heldIndex, slots.length - 1)
      : hover && hover !== "center"
        ? slots.indexOf(hover)
        : -1;
  const activeIsCancel = activeIndex >= 0 && slots[activeIndex] === RING_CANCEL;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 select-none"
      style={{
        background: "transparent",
        cursor: !hold && hover ? "pointer" : "default",
      }}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      onPointerDown={onDown}
    >
      {ready && (
        <svg width={size.w} height={size.h} className="absolute inset-0">
          {/* Floating backdrop disc — opaque surface token (no see-through to
              the desktop), theme-aware. The window outside this disc stays
              transparent so the ring reads as a floating circle. Colors go
              through `style` because CSS var() does not resolve inside SVG
              presentation attributes. */}
          <circle
            cx={cx}
            cy={cy}
            r={rOuter + 12}
            strokeWidth={1}
            style={{
              fill: "var(--surface-overlay)",
              stroke: "var(--border-strong)",
              filter: "drop-shadow(0 10px 30px rgba(0,0,0,0.45))",
            }}
          />

          {/* Active slot: pointer hover in v1, the cycled selection in v2. */}
          {activeIndex >= 0 && (
            <path
              d={wedgePath(
                cx,
                cy,
                rInner,
                rOuter,
                ringSlotAngleDeg(activeIndex, slots.length),
                sweep,
              )}
              strokeWidth={1.5}
              // Cancel highlights in muted tones rather than the accent: the
              // accent everywhere else means "this will capture", and cancel is
              // the one slot that won't.
              style={
                activeIsCancel
                  ? { fill: "var(--border-strong)", stroke: "var(--muted-foreground)" }
                  : { fill: "var(--accent-soft)", stroke: "var(--accent)" }
              }
            />
          )}

          {/* Concentric ring outlines */}
          <circle cx={cx} cy={cy} r={rOuter} strokeWidth={1.25} style={{ fill: "none", stroke: "var(--border-strong)" }} />
          <circle cx={cx} cy={cy} r={rInner} strokeWidth={1.25} style={{ fill: "none", stroke: "var(--border-strong)" }} />

          {/* Radial separators at the slot boundaries. A one-slot ring has no
              boundary to draw — a lone divider would read as a seam. */}
          {slots.length > 1 &&
            slots.map((_, i) => {
              const deg = ringSlotAngleDeg(i, slots.length) - sweep / 2;
              const [x0, y0] = polar(cx, cy, rInner, deg);
              const [x1, y1] = polar(cx, cy, rOuter, deg);
              return (
                <line
                  key={`div-${i}`}
                  x1={x0}
                  y1={y0}
                  x2={x1}
                  y2={y1}
                  strokeWidth={1.25}
                  style={{ stroke: "var(--border-strong)" }}
                />
              );
            })}

          {/* Slot labels */}
          {slots.map((w, i) => {
            const [lx, ly] = polar(cx, cy, rLabel, ringSlotAngleDeg(i, slots.length));
            return (
              <text
                key={w}
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(13, half * 0.115)}
                fontWeight={600}
                style={{
                  fill:
                    activeIndex === i
                      ? activeIsCancel
                        ? "var(--fg)"
                        : "var(--accent)"
                      : w === RING_CANCEL
                        ? "var(--muted-foreground)"
                        : "var(--fg)",
                  pointerEvents: "none",
                }}
              >
                {RING_LABELS[w]}
              </text>
            );
          })}

          {/* Center button → open / refocus the editor. v1 only: the hold ring
              is unfocused and takes no clicks, so this would be an affordance
              that cannot be used. Its hit-area is dropped too (see `targetAt`),
              leaving the dead-zone as plain chrome. */}
          {!hold && (
            <>
              <circle
                cx={cx}
                cy={cy}
                r={rCenter}
                strokeWidth={1.25}
                style={{
                  fill: hover === "center" ? "var(--accent-soft)" : "var(--surface-overlay)",
                  stroke: hover === "center" ? "var(--accent)" : "var(--border-strong)",
                }}
              />
              <svg
                x={cx - rCenter * 1.15 / 2}
                y={cy - rCenter * 1.15 / 2}
                width={rCenter * 1.15}
                height={rCenter * 1.15}
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  stroke: hover === "center" ? "var(--accent)" : "var(--fg)",
                  pointerEvents: "none",
                }}
              >
                {/* lucide "square-pen" */}
                <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
              </svg>
            </>
          )}
        </svg>
      )}
    </div>
  );
}
