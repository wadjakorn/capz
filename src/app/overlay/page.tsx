"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettings } from "@/stores/settings";
import {
  centeredDefaultRect,
  clampRect,
  cssToOs,
  cursorForTarget,
  hitTestHandle,
  moveRect,
  osToCss,
  resizeBy,
  resizeFromHandle,
  type Box,
  type DragTarget,
  type Rect,
} from "@/lib/areaSelection";

type Point = { x: number; y: number };
type Mode = "area" | "full" | "window";

type WindowOverlayInfo = {
  id: number;
  title: string;
  app_name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type MonitorInfo = {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale_factor: number;
  is_primary: boolean;
};

/** Minimum template size (CSS px) enforced while resizing. */
const MIN_RECT = 24;
/** Pointer grab tolerance around a handle anchor (CSS px). */
const HANDLE_HIT = 18;
/** Drag-from-scratch below this is discarded (treated as a stray click). */
const DRAW_MIN = 8;

function normalize(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x, y, w, h };
}

function closeOverlay() {
  invoke("close_overlay_command").catch((e) => {
    console.error("close_overlay_command failed", e);
  });
}

function hitTestWindow(list: WindowOverlayInfo[], pt: Point): WindowOverlayInfo | null {
  for (const w of list) {
    if (pt.x >= w.x && pt.x < w.x + w.width && pt.y >= w.y && pt.y < w.y + w.height) {
      return w;
    }
  }
  return null;
}

/** Live CSS-pixel size of this overlay window (== the monitor's logical size). */
function useViewport() {
  const [size, setSize] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 0,
    h: typeof window !== "undefined" ? window.innerHeight : 0,
  }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

// ---------------------------------------------------------------------------
// Area mode: one overlay spanning the union of all displays, with a template
// rectangle you can transform and drag freely across screens. On confirm the
// CSS selection is mapped back to OS virtual coordinates and Rust
// (capture_area_virtual) resolves the target monitor + physical crop.
// ---------------------------------------------------------------------------

function AreaMode({ union }: { union: Box }) {
  const { w: dispW, h: dispH } = useViewport();

  const initSettings = useSettings((s) => s.init);
  const settingsReady = useSettings((s) => s.ready);
  const lastRegion = useSettings((s) => s.config.lastUsed?.region);

  const [busy, setBusy] = useState(false);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);

  useEffect(() => {
    void initSettings();
  }, [initSettings]);

  useEffect(() => {
    invoke<MonitorInfo[]>("list_monitors_command")
      .then(setMonitors)
      .catch((e) => console.error("list_monitors_command failed", e));
  }, []);

  // Display outlines, so the user can see screen boundaries on the union surface.
  const monitorRectsCss = useMemo(
    () =>
      monitors.map((m) =>
        osToCss({ x: m.x, y: m.y, w: m.width, h: m.height }, union, dispW, dispH),
      ),
    [monitors, union, dispW, dispH],
  );

  // Seed: the remembered region (stored in OS coords), else a centered default
  // on the primary display.
  const initialRect = useMemo<Rect | null>(() => {
    if (dispW === 0 || dispH === 0) return null;
    if (lastRegion) {
      return clampRect(
        osToCss(
          { x: lastRegion.x, y: lastRegion.y, w: lastRegion.w, h: lastRegion.h },
          union,
          dispW,
          dispH,
        ),
        dispW,
        dispH,
      );
    }
    if (monitors.length === 0) return null;
    const primary = monitors.find((m) => m.is_primary) ?? monitors[0];
    const mcss = osToCss(
      { x: primary.x, y: primary.y, w: primary.width, h: primary.height },
      union,
      dispW,
      dispH,
    );
    const def = centeredDefaultRect(mcss.w, mcss.h);
    return { x: mcss.x + def.x, y: mcss.y + def.y, w: def.w, h: def.h };
  }, [lastRegion, monitors, union, dispW, dispH]);

  const ready = settingsReady && initialRect != null;

  const confirmRegion = useCallback(
    async (rect: Rect) => {
      setBusy(true);
      // Map the CSS selection back to OS virtual coordinates for Rust.
      const os = cssToOs(rect, union, dispW, dispH);
      const rounded = {
        x: Math.round(os.x),
        y: Math.round(os.y),
        w: Math.round(os.w),
        h: Math.round(os.h),
      };
      // Remember the selection (OS coords) + the display holding its center, so
      // next capture restores it. Persistence is unconditional.
      const cx = os.x + os.w / 2;
      const cy = os.y + os.h / 2;
      const target =
        monitors.find(
          (m) => cx >= m.x && cx < m.x + m.width && cy >= m.y && cy < m.y + m.height,
        ) ??
        monitors.find((m) => m.is_primary) ??
        monitors[0];
      try {
        await useSettings.getState().setLastUsed({
          ...(useSettings.getState().config.lastUsed ?? {}),
          region: { monitorId: target?.id ?? 0, ...rounded },
        });
      } catch (e) {
        console.warn("persist lastUsed.region failed", e);
      }
      getCurrentWindow()
        .hide()
        .catch((e) => console.warn("hide overlay failed", e));
      try {
        const path = await invoke<string>("capture_area_virtual", rounded);
        console.info("capture_area_virtual → editor", path);
      } catch (e) {
        console.error("capture_area_virtual failed", e);
        closeOverlay();
      }
    },
    [union, dispW, dispH, monitors],
  );

  return (
    <TransformPhase
      dispW={dispW}
      dispH={dispH}
      initialRect={initialRect}
      ready={ready}
      monitorRectsCss={monitorRectsCss}
      busy={busy}
      onConfirm={confirmRegion}
    />
  );
}

// ---------------------------------------------------------------------------

type Interaction =
  | { kind: "handle"; target: Exclude<DragTarget, "move">; start: Point; orig: Rect }
  | { kind: "move"; start: Point; orig: Rect }
  | { kind: "draw"; start: Point; prev: Rect };

function TransformPhase({
  dispW,
  dispH,
  initialRect,
  ready,
  monitorRectsCss,
  busy,
  onConfirm,
}: {
  dispW: number;
  dispH: number;
  initialRect: Rect | null;
  ready: boolean;
  monitorRectsCss: Rect[];
  busy: boolean;
  onConfirm: (rect: Rect) => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [hoverTarget, setHoverTarget] = useState<DragTarget | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const initRef = useRef(false);

  // Seed the template once the initial rect (remembered or centered) is ready.
  useEffect(() => {
    if (initRef.current || !ready || !initialRect) return;
    initRef.current = true;
    setRect(initialRect);
  }, [ready, initialRect]);

  const rectRef = useRef<Rect | null>(null);
  rectRef.current = rect;

  // Enter confirms; arrows nudge/resize the template.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const r = rectRef.current;
      if (!r || busy) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (r.w >= 4 && r.h >= 4) onConfirm(r);
        return;
      }
      const step = e.shiftKey ? undefined : 1;
      let handled = true;
      if (e.shiftKey) {
        switch (e.key) {
          case "ArrowRight": setRect(resizeBy(r, 1, 0, MIN_RECT, dispW, dispH)); break;
          case "ArrowLeft": setRect(resizeBy(r, -1, 0, MIN_RECT, dispW, dispH)); break;
          case "ArrowDown": setRect(resizeBy(r, 0, 1, MIN_RECT, dispW, dispH)); break;
          case "ArrowUp": setRect(resizeBy(r, 0, -1, MIN_RECT, dispW, dispH)); break;
          default: handled = false;
        }
      } else {
        switch (e.key) {
          case "ArrowRight": setRect(moveRect(r, step!, 0, dispW, dispH)); break;
          case "ArrowLeft": setRect(moveRect(r, -step!, 0, dispW, dispH)); break;
          case "ArrowDown": setRect(moveRect(r, 0, step!, dispW, dispH)); break;
          case "ArrowUp": setRect(moveRect(r, 0, -step!, dispW, dispH)); break;
          default: handled = false;
        }
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, dispW, dispH, onConfirm]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (busy) return;
    const pt = { x: e.clientX, y: e.clientY };
    const r = rectRef.current;
    const target = r ? hitTestHandle(r, pt.x, pt.y, HANDLE_HIT) : null;
    if (r && target === "move") {
      interactionRef.current = { kind: "move", start: pt, orig: r };
    } else if (r && target !== null && target !== "move") {
      interactionRef.current = { kind: "handle", target, start: pt, orig: r };
    } else {
      // Empty area → draw a fresh rectangle from scratch (kept from old model).
      interactionRef.current = { kind: "draw", start: pt, prev: r ?? centeredDefaultRect(dispW, dispH) };
      setRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const pt = { x: e.clientX, y: e.clientY };
    const it = interactionRef.current;
    if (!it) {
      const r = rectRef.current;
      setHoverTarget(r ? hitTestHandle(r, pt.x, pt.y, HANDLE_HIT) : null);
      return;
    }
    const dx = pt.x - it.start.x;
    const dy = pt.y - it.start.y;
    if (it.kind === "handle") {
      setRect(resizeFromHandle(it.orig, it.target, dx, dy, MIN_RECT, dispW, dispH));
    } else if (it.kind === "move") {
      setRect(moveRect(it.orig, dx, dy, dispW, dispH));
    } else {
      setRect(clampRect(normalize(it.start, pt), dispW, dispH));
    }
  };

  const onMouseUp = () => {
    const it = interactionRef.current;
    interactionRef.current = null;
    if (it?.kind === "draw") {
      const r = rectRef.current;
      // A stray click (no real drag) discards the draw and keeps the template.
      if (!r || r.w < DRAW_MIN || r.h < DRAW_MIN) setRect(it.prev);
    }
  };

  const onDoubleClick = () => {
    const r = rectRef.current;
    if (!busy && r && r.w >= 4 && r.h >= 4) onConfirm(r);
  };

  const cursor = interactionRef.current
    ? cursorForTarget(
        interactionRef.current.kind === "move"
          ? "move"
          : interactionRef.current.kind === "handle"
          ? interactionRef.current.target
          : null,
      )
    : cursorForTarget(hoverTarget);

  return (
    <div
      className="fixed inset-0 select-none"
      style={{ background: "transparent", cursor }}
      onMouseEnter={() => getCurrentWindow().setFocus().catch(() => {})}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onDoubleClick={onDoubleClick}
    >
      {rect && <OuterDim rect={rect} />}
      {/* Faint outlines of each display so screen boundaries are visible. */}
      {monitorRectsCss.map((m, i) => (
        <div
          key={i}
          className="pointer-events-none absolute"
          style={{
            left: m.x,
            top: m.y,
            width: m.w,
            height: m.h,
            border: "1px solid rgba(255,255,255,0.14)",
          }}
        />
      ))}
      {rect && <TemplateRect rect={rect} />}

      <div
        className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg px-3.5 py-2 text-[12px] text-white/85"
        style={{
          background: "var(--surface-overlay)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 32px -14px rgba(0,0,0,0.6)",
        }}
      >
        Drag body to move · Handles to resize · Enter to capture · Esc to cancel
      </div>
    </div>
  );
}

function TemplateRect({ rect }: { rect: Rect }) {
  // Eight resize handles: corners + edge midpoints.
  const handles: Array<{ t: DragTarget; left: number; top: number }> = [
    { t: "nw", left: rect.x, top: rect.y },
    { t: "n", left: rect.x + rect.w / 2, top: rect.y },
    { t: "ne", left: rect.x + rect.w, top: rect.y },
    { t: "e", left: rect.x + rect.w, top: rect.y + rect.h / 2 },
    { t: "se", left: rect.x + rect.w, top: rect.y + rect.h },
    { t: "s", left: rect.x + rect.w / 2, top: rect.y + rect.h },
    { t: "sw", left: rect.x, top: rect.y + rect.h },
    { t: "w", left: rect.x, top: rect.y + rect.h / 2 },
  ];
  const HANDLE = 10;
  return (
    <>
      <div
        className="pointer-events-none absolute"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.w,
          height: rect.h,
          border: "2px solid var(--accent)",
          boxShadow:
            "0 0 0 1px rgba(109, 124, 255, 0.25), 0 8px 24px -8px rgba(109, 124, 255, 0.45)",
        }}
      >
        <div
          className="absolute -top-7 left-0 rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide text-white/90"
          style={{
            background: "var(--surface-overlay)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 8px 24px -10px rgba(0,0,0,0.55)",
          }}
        >
          {Math.round(rect.w)} × {Math.round(rect.h)}
        </div>
      </div>
      {handles.map((h) => (
        <div
          key={h.t}
          className="pointer-events-none absolute rounded-[3px]"
          style={{
            left: h.left - HANDLE / 2,
            top: h.top - HANDLE / 2,
            width: HANDLE,
            height: HANDLE,
            background: "#fff",
            border: "1.5px solid var(--accent)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
          }}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Full / window mode: single-click / hover-to-pick a whole screen or window.
// (Preserved from the original overlay; area mode no longer uses this path.)
// ---------------------------------------------------------------------------

function PickMode({ mode, monitorId }: { mode: "full" | "window"; monitorId: number }) {
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [windows, setWindows] = useState<WindowOverlayInfo[]>([]);
  const [hovered, setHovered] = useState<WindowOverlayInfo | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (mode !== "window" || !active || fetchedRef.current) return;
    fetchedRef.current = true;
    invoke<WindowOverlayInfo[]>("list_capture_windows", { monitorId })
      .then(setWindows)
      .catch((e) => console.error("list_capture_windows failed", e));
  }, [mode, active, monitorId]);

  const onPointerEnter = () => {
    setActive(true);
    getCurrentWindow().setFocus().catch((e) => console.warn("setFocus failed", e));
  };
  const onPointerLeave = () => {
    setActive(false);
    if (mode === "window") setHovered(null);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!active) setActive(true);
    if (mode === "window") {
      if (busy) return;
      setHovered(hitTestWindow(windows, { x: e.clientX, y: e.clientY }));
    }
  };

  const onClick = async () => {
    if (busy || !active) return;
    if (mode === "full") {
      setBusy(true);
      getCurrentWindow().hide().catch((e) => console.warn("hide overlay failed", e));
      try {
        await invoke<string>("capture_full_monitor", { monitorId });
      } catch (err) {
        console.error("capture_full_monitor failed", err);
        closeOverlay();
      }
    } else {
      if (!hovered) return;
      setBusy(true);
      getCurrentWindow().hide().catch((e) => console.warn("hide overlay failed", e));
      try {
        await invoke<string>("capture_window_command", { windowId: hovered.id });
      } catch (err) {
        console.error("capture_window_command failed", err);
        closeOverlay();
      }
    }
  };

  const cutoutRect: Rect | null =
    mode === "window" && active && hovered
      ? { x: hovered.x, y: hovered.y, w: hovered.width, h: hovered.height }
      : null;

  const hintText = !active
    ? "Move cursor here to select on this screen"
    : mode === "full"
    ? "Click to capture this screen · Esc to cancel"
    : "Click a window to capture · Esc to cancel";

  return (
    <div
      className={`fixed inset-0 select-none ${active ? "cursor-crosshair" : "cursor-default"}`}
      style={{
        background: cutoutRect ? "transparent" : active ? "rgba(0, 0, 0, 0.35)" : "rgba(0, 0, 0, 0.12)",
        transition: cutoutRect ? "none" : "background 80ms ease-out",
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onMouseMove={onMouseMove}
      onClick={onClick}
    >
      {active && !cutoutRect && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: "inset 0 0 0 3px rgba(109, 124, 255, 0.6)" }}
        />
      )}
      {cutoutRect && <OuterDim rect={cutoutRect} />}
      {mode === "window" && active && hovered && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: hovered.x,
            top: hovered.y,
            width: hovered.width,
            height: hovered.height,
            border: "2px solid var(--accent)",
            boxShadow:
              "0 0 0 1px rgba(109, 124, 255, 0.25), 0 8px 24px -8px rgba(109, 124, 255, 0.45)",
          }}
        >
          <div
            className="absolute -top-7 left-0 max-w-[80vw] truncate rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide text-white/90"
            style={{
              background: "var(--surface-overlay)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 8px 24px -10px rgba(0,0,0,0.55)",
            }}
          >
            {(hovered.app_name || "") + (hovered.title ? ` — ${hovered.title}` : "")}
          </div>
        </div>
      )}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg px-3.5 py-2 text-[12px] text-white/85"
        style={{
          background: "var(--surface-overlay)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 32px -14px rgba(0,0,0,0.6)",
        }}
      >
        {hintText}
      </div>
    </div>
  );
}

function OuterDim({ rect }: { rect: Rect }) {
  const dim = "rgba(0, 0, 0, 0.4)";
  return (
    <>
      <div
        className="pointer-events-none absolute left-0 right-0"
        style={{ top: 0, height: Math.max(0, rect.y), background: dim }}
      />
      <div
        className="pointer-events-none absolute left-0 right-0"
        style={{ top: rect.y + rect.h, bottom: 0, background: dim }}
      />
      <div
        className="pointer-events-none absolute"
        style={{ top: rect.y, height: rect.h, left: 0, width: Math.max(0, rect.x), background: dim }}
      />
      <div
        className="pointer-events-none absolute"
        style={{ top: rect.y, height: rect.h, left: rect.x + rect.w, right: 0, background: dim }}
      />
    </>
  );
}

function OverlayInner() {
  const params = useSearchParams();
  const monitorId = Number(params.get("monitor") ?? "0");
  const mode = (params.get("mode") ?? "area") as Mode;
  const unionParam = params.get("union");
  const union = useMemo<Box | null>(() => {
    if (!unionParam) return null;
    const [x, y, w, h] = unionParam.split(",").map(Number);
    if ([x, y, w, h].some((n) => Number.isNaN(n)) || w <= 0 || h <= 0) return null;
    return { x, y, w, h };
  }, [unionParam]);

  // Escape always cancels; keep the overlay background transparent.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeOverlay();
      }
    };
    window.addEventListener("keydown", onKey);
    const prevBody = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.background = prevBody;
      document.documentElement.style.background = prevHtml;
    };
  }, []);

  if (mode === "area") return union ? <AreaMode union={union} /> : null;
  return <PickMode mode={mode} monitorId={monitorId} />;
}

export default function OverlayPage() {
  return (
    <Suspense fallback={null}>
      <OverlayInner />
    </Suspense>
  );
}
