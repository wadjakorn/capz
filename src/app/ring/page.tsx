"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
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
/** Visible center-button disc as a fraction of the inner (dead-zone) radius. */
const CENTER_FRAC = 0.8;
/** Wedge boundary angles (the diagonals), where the radial separators sit. */
const DIVIDERS = [45, 135, 225, 315];

/** What the cursor is over: a capture wedge, the center editor button, or
 *  nothing (outside the ring → dismiss). */
type Target = RingWedge | "center";

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
  const [hover, setHover] = useState<Target | null>(null);
  const selectedRef = useRef(false);

  // The ring window is transparent — clear the opaque app background so only
  // the ring paints (same trick as the scroll HUD).
  // CP-0038 POC: Rust opens `ring/?poc=1` when the ring is shown WITHOUT focus.
  // In that mode the ring is a passive display — Rust owns selection, so we must
  // not grab focus (Q3) and must not close on blur (we are never focused).
  const isPoc =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("poc");

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
    if (isPoc) return;
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
  }, [isPoc]);

  // CP-0038 POC: highlight is pushed from Rust (the slot key was captured by a
  // transient global shortcut, not by this webview — it has no focus).
  useEffect(() => {
    if (!isPoc) return;
    const un = listen<string>("ring-poc:highlight", (e) => setHover(e.payload as Target));
    // Rust creates this window and emits the opening highlight immediately, so
    // that first event lands before the listener above exists. Announce once we
    // are actually listening and let Rust replay the current selection.
    void un.then(() => emit("ring-poc:ready"));
    return () => {
      void un.then((f) => f());
    };
  }, [isPoc]);

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
  const rCenter = rInner * CENTER_FRAC;
  const rLabel = (rInner + rOuter) / 2;

  // Center (dead-zone) → editor button; ring band → capture wedge; beyond the
  // outer edge → null (dismiss). The whole inner circle is the editor hit-area,
  // not just the visible disc, so clicks near the center never fall through.
  const targetAt = useCallback(
    (px: number, py: number): Target | null => {
      const d = Math.hypot(px - cx, py - cy);
      if (d < rInner) return "center";
      if (d <= rOuter) return wedgeAtPoint(px, py, cx, cy, rInner);
      return null;
    },
    [cx, cy, rInner, rOuter],
  );

  const onMove = useCallback(
    (e: React.PointerEvent) => setHover(targetAt(e.clientX, e.clientY)),
    [targetAt],
  );

  const onDown = useCallback(
    (e: React.PointerEvent) => {
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
      } else {
        invoke("command_ring_select", { kind: t }).catch((err) =>
          console.error("command_ring_select failed", err),
        );
      }
    },
    [targetAt],
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

          {/* Hovered wedge highlight */}
          {hover && hover !== "center" && (
            <path
              d={wedgePath(cx, cy, rInner, rOuter, (RING_ANGLE[hover] * 180) / Math.PI)}
              strokeWidth={1.5}
              style={{ fill: "var(--accent-soft)", stroke: "var(--accent)" }}
            />
          )}

          {/* Concentric ring outlines */}
          <circle cx={cx} cy={cy} r={rOuter} strokeWidth={1.25} style={{ fill: "none", stroke: "var(--border-strong)" }} />
          <circle cx={cx} cy={cy} r={rInner} strokeWidth={1.25} style={{ fill: "none", stroke: "var(--border-strong)" }} />

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
                strokeWidth={1.25}
                style={{ stroke: "var(--border-strong)" }}
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
                style={{
                  fill: hover === w ? "var(--accent)" : "var(--fg)",
                  pointerEvents: "none",
                }}
              >
                {RING_LABELS[w]}
              </text>
            );
          })}

          {/* Center button → open / refocus the editor */}
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
          {(() => {
            const icon = rCenter * 1.15;
            return (
              <svg
                x={cx - icon / 2}
                y={cy - icon / 2}
                width={icon}
                height={icon}
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
            );
          })()}
        </svg>
      )}
    </div>
  );
}
