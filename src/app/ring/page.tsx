"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  RING_ANGLE,
  RING_LABELS,
  RING_WEDGES,
  wedgeAtPoint,
  type RingWedge,
} from "@/lib/commandRing";

/** Fraction of the half-min-dimension used for the outer ring / dead-zone. */
const OUTER_FRAC = 0.9;
const INNER_FRAC = 0.46;
/** Wedge boundary angles (the diagonals), where the radial separators sit. */
const DIVIDERS = [45, 135, 225, 315];

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** Annular sector path for one 90° wedge centered on `centerDeg`. */
function wedgePath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  centerDeg: number,
): string {
  const a0 = centerDeg - 45;
  const a1 = centerDeg + 45;
  const [x0o, y0o] = polar(cx, cy, rOuter, a0);
  const [x1o, y1o] = polar(cx, cy, rOuter, a1);
  const [x1i, y1i] = polar(cx, cy, rInner, a1);
  const [x0i, y0i] = polar(cx, cy, rInner, a0);
  return `M ${x0o} ${y0o} A ${rOuter} ${rOuter} 0 0 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 0 0 ${x0i} ${y0i} Z`;
}

function closeRing() {
  invoke("close_command_ring").catch((e) => console.error("close_command_ring failed", e));
}

export default function CommandRingPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<RingWedge | null>(null);
  const selectedRef = useRef(false);

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
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRing();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cx = size.w / 2;
  const cy = size.h / 2;
  const half = Math.min(size.w, size.h) / 2;
  const rOuter = half * OUTER_FRAC;
  const rInner = half * INNER_FRAC;
  const rLabel = (rInner + rOuter) / 2;

  const wedgeFor = useCallback(
    (px: number, py: number): RingWedge | null => {
      const w = wedgeAtPoint(px, py, cx, cy, rInner);
      if (!w) return null;
      // Only within the ring band counts; outside the outer edge = "no wedge".
      if (Math.hypot(px - cx, py - cy) > rOuter) return null;
      return w;
    },
    [cx, cy, rInner, rOuter],
  );

  const onMove = useCallback(
    (e: React.PointerEvent) => setHover(wedgeFor(e.clientX, e.clientY)),
    [wedgeFor],
  );

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      const w = wedgeFor(e.clientX, e.clientY);
      if (!w) {
        // Click in the dead-zone or outside the ring dismisses it.
        closeRing();
        return;
      }
      if (selectedRef.current) return;
      selectedRef.current = true;
      invoke("command_ring_select", { kind: w }).catch((err) =>
        console.error("command_ring_select failed", err),
      );
    },
    [wedgeFor],
  );

  const ready = size.w > 0 && size.h > 0;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 select-none"
      style={{ background: "transparent", cursor: hover ? "pointer" : "default" }}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      onPointerDown={onDown}
    >
      {ready && (
        <svg width={size.w} height={size.h} className="absolute inset-0">
          {/* Floating dark backdrop disc */}
          <circle
            cx={cx}
            cy={cy}
            r={rOuter + 12}
            fill="rgba(20,20,25,0.72)"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={1}
            style={{ filter: "drop-shadow(0 10px 30px rgba(0,0,0,0.45))" }}
          />

          {/* Hovered wedge highlight (accent tokens, as literals — CSS vars do
              not resolve inside SVG presentation attributes) */}
          {hover && (
            <path
              d={wedgePath(cx, cy, rInner, rOuter, (RING_ANGLE[hover] * 180) / Math.PI)}
              fill="rgba(109,124,255,0.16)"
              stroke="#6d7cff"
              strokeWidth={1.5}
            />
          )}

          {/* Concentric ring outlines */}
          <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1.25} />
          <circle cx={cx} cy={cy} r={rInner} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1.25} />

          {/* Radial separators at the wedge boundaries */}
          {DIVIDERS.map((deg) => {
            const [x0, y0] = polar(cx, cy, rInner, deg);
            const [x1, y1] = polar(cx, cy, rOuter, deg);
            return (
              <line
                key={deg}
                x1={x0}
                y1={y0}
                x2={x1}
                y2={y1}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth={1.25}
              />
            );
          })}

          {/* Wedge labels */}
          {RING_WEDGES.map((w) => {
            const [lx, ly] = polar(cx, cy, rLabel, (RING_ANGLE[w] * 180) / Math.PI);
            return (
              <text
                key={w}
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(13, half * 0.115)}
                fontWeight={600}
                fill={hover === w ? "#ffffff" : "rgba(236,237,240,0.92)"}
                style={{ pointerEvents: "none" }}
              >
                {RING_LABELS[w]}
              </text>
            );
          })}
        </svg>
      )}
    </div>
  );
}
