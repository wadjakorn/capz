"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettings } from "@/stores/settings";
import {
  centeredDefaultRect,
  clampRect,
  cursorForTarget,
  hitTestHandle,
  moveRect,
  resizeBy,
  resizeFromHandle,
  type DragTarget,
  type Rect,
} from "@/lib/areaSelection";

type Point = { x: number; y: number };
type Mode = "area" | "full" | "window" | "scroll";

type WindowOverlayInfo = {
  id: number;
  title: string;
  app_name: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
// Area mode: one transparent overlay per display (no dim — just the rectangle
// outline + handles). Exactly one selection rect is live at a time. The display
// Rust marked as owner shows a template rect first (the remembered region, else
// a centered default); pressing on any other display "claims" it — clearing the
// rect everywhere else via the `area:claim` event — and starts a fresh
// selection there. Capture resolves to that single owning display.
// ---------------------------------------------------------------------------

type Interaction =
  | { kind: "handle"; target: Exclude<DragTarget, "move">; start: Point; orig: Rect }
  | { kind: "move"; start: Point; orig: Rect }
  | { kind: "draw"; start: Point; prev: Rect };

function AreaMode({
  monitorId,
  initialOwner,
  scroll = false,
}: {
  monitorId: number;
  initialOwner: boolean;
  /** When true, the selection starts a scrolling capture instead of a single shot. */
  scroll?: boolean;
}) {
  const { w: dispW, h: dispH } = useViewport();

  const initSettings = useSettings((s) => s.init);
  const settingsReady = useSettings((s) => s.ready);
  const lastRegion = useSettings((s) => s.config.lastUsed?.region);

  const [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState(initialOwner);
  const [rect, setRect] = useState<Rect | null>(null);
  const [hoverTarget, setHoverTarget] = useState<DragTarget | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const initRef = useRef(false);

  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const rectRef = useRef<Rect | null>(null);
  rectRef.current = rect;

  useEffect(() => {
    void initSettings();
  }, [initSettings]);

  // Seed the template once — only on the display Rust designated as owner.
  // Restores the remembered region if it belongs to this display, else a
  // centered default. Claims on other displays never run this (guarded on the
  // static `initialOwner` prop, not the live `owner` state).
  useEffect(() => {
    if (initRef.current || !settingsReady || !initialOwner) return;
    if (dispW === 0 || dispH === 0) return;
    initRef.current = true;
    if (lastRegion && lastRegion.monitorId === monitorId) {
      setRect(
        clampRect(
          { x: lastRegion.x, y: lastRegion.y, w: lastRegion.w, h: lastRegion.h },
          dispW,
          dispH,
        ),
      );
    } else {
      setRect(centeredDefaultRect(dispW, dispH));
    }
  }, [settingsReady, initialOwner, lastRegion, monitorId, dispW, dispH]);

  // Another display claimed the selection → drop ours so only one is ever live.
  useEffect(() => {
    const un = listen<{ monitorId: number }>("area:claim", (e) => {
      if (e.payload.monitorId !== monitorId) {
        interactionRef.current = null;
        setOwner(false);
        setRect(null);
        setHoverTarget(null);
      }
    });
    return () => {
      void un.then((f) => f());
    };
  }, [monitorId]);

  const confirmRegion = useCallback(
    async (r: Rect) => {
      setBusy(true);
      // Persist as monitor-local CSS px so the next capture restores it here.
      try {
        await useSettings.getState().setLastUsed({
          ...(useSettings.getState().config.lastUsed ?? {}),
          region: {
            monitorId,
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.w),
            h: Math.round(r.h),
          },
        });
      } catch (e) {
        console.warn("persist lastUsed.region failed", e);
      }
      // xcap wants physical px; the overlay's devicePixelRatio is this display's
      // scale — reliable on Windows where xcap's scale_factor is not (ticket
      // L9mejWlFPDcZ); on macOS Retina dpr == scale_factor.
      const dpr = window.devicePixelRatio || 1;
      const phys = {
        monitorId,
        x: Math.round(r.x * dpr),
        y: Math.round(r.y * dpr),
        w: Math.round(r.w * dpr),
        h: Math.round(r.h * dpr),
      };
      getCurrentWindow()
        .hide()
        .catch((e) => console.warn("hide overlay failed", e));
      try {
        if (scroll) {
          // Rust hides+closes the overlays, grabs the first frame, opens the
          // HUD, and starts sampling. This window is torn down as part of that,
          // so the invoke may resolve just as our JS context goes away.
          await invoke("scroll_capture_start_command", phys);
          console.info("scroll_capture_start_command started");
        } else {
          const path = await invoke<string>("capture_region_command", phys);
          console.info("capture_region_command → editor", path);
        }
      } catch (e) {
        console.error(scroll ? "scroll_capture_start_command failed" : "capture_region_command failed", e);
        closeOverlay();
      }
    },
    [monitorId, scroll],
  );

  // Enter confirms; arrows nudge/resize the template.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const r = rectRef.current;
      if (!r || busy) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (r.w >= 4 && r.h >= 4) void confirmRegion(r);
        return;
      }
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
          case "ArrowRight": setRect(moveRect(r, 1, 0, dispW, dispH)); break;
          case "ArrowLeft": setRect(moveRect(r, -1, 0, dispW, dispH)); break;
          case "ArrowDown": setRect(moveRect(r, 0, 1, dispW, dispH)); break;
          case "ArrowUp": setRect(moveRect(r, 0, -1, dispW, dispH)); break;
          default: handled = false;
        }
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, dispW, dispH, confirmRegion]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (busy) return;
    const pt = { x: e.clientX, y: e.clientY };
    if (!ownerRef.current) {
      // Selecting on a non-owner display: claim it (which clears the rect
      // elsewhere) and begin a fresh draw. A plain click (no drag) falls back to
      // a centered template on this display via onMouseUp's DRAW_MIN check.
      void emit("area:claim", { monitorId });
      setOwner(true);
      interactionRef.current = {
        kind: "draw",
        start: pt,
        prev: centeredDefaultRect(dispW, dispH),
      };
      setRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
      return;
    }
    const r = rectRef.current;
    const target = r ? hitTestHandle(r, pt.x, pt.y, HANDLE_HIT) : null;
    if (r && target === "move") {
      interactionRef.current = { kind: "move", start: pt, orig: r };
    } else if (r && target !== null && target !== "move") {
      interactionRef.current = { kind: "handle", target, start: pt, orig: r };
    } else {
      // Empty area → draw a fresh rectangle from scratch.
      interactionRef.current = {
        kind: "draw",
        start: pt,
        prev: r ?? centeredDefaultRect(dispW, dispH),
      };
      setRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const pt = { x: e.clientX, y: e.clientY };
    const it = interactionRef.current;
    if (!it) {
      const r = ownerRef.current ? rectRef.current : null;
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
      // A stray click (no real drag) falls back to the template instead.
      if (!r || r.w < DRAW_MIN || r.h < DRAW_MIN) {
        setRect(clampRect(it.prev, dispW, dispH));
      }
    }
  };

  const onDoubleClick = () => {
    const r = rectRef.current;
    if (!busy && r && r.w >= 4 && r.h >= 4) void confirmRegion(r);
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
      {rect ? (
        // Instructions ride along with the rect (see TemplateRect's action pill).
        <TemplateRect rect={rect} dispH={dispH} confirmLabel={scroll ? "Start" : "Capture"} />
      ) : (
        // No selection on this display yet → a single centered prompt to draw.
        <div
          className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg px-3.5 py-2 text-[12px] text-white/85"
          style={{
            background: "var(--surface-overlay)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 32px -14px rgba(0,0,0,0.6)",
          }}
        >
          Drag to select on this screen · Esc to cancel
        </div>
      )}
    </div>
  );
}

/** Small key-cap chip used inside the action pill. */
const KEYCAP: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 16,
  height: 16,
  padding: "0 4px",
  borderRadius: 4,
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.20)",
  fontSize: 10,
  lineHeight: 1,
  fontWeight: 600,
};

function TemplateRect({
  rect,
  dispH,
  confirmLabel = "Capture",
}: {
  rect: Rect;
  dispH: number;
  confirmLabel?: string;
}) {
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
  // Action pill sits just below the rect; if the rect hugs the screen bottom,
  // tuck it inside the bottom edge instead so it never clips off-screen.
  const actionsBelow = rect.y + rect.h + 34 <= dispH;
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
        <div
          className="absolute left-0 flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium text-white/85"
          style={{
            ...(actionsBelow ? { top: "calc(100% + 6px)" } : { bottom: 6, left: 6 }),
            background: "var(--surface-overlay)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 8px 24px -10px rgba(0,0,0,0.55)",
          }}
        >
          <span className="flex items-center gap-1">
            <span style={KEYCAP}>↵</span>
            {confirmLabel}
          </span>
          <span className="opacity-40">·</span>
          <span className="flex items-center gap-1">
            <span style={KEYCAP}>esc</span>
            Cancel
          </span>
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
  const initialOwner = params.get("owner") === "1";

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

  if (mode === "area" || mode === "scroll")
    return (
      <AreaMode
        monitorId={monitorId}
        initialOwner={initialOwner}
        scroll={mode === "scroll"}
      />
    );
  return <PickMode mode={mode} monitorId={monitorId} />;
}

export default function OverlayPage() {
  return (
    <Suspense fallback={null}>
      <OverlayInner />
    </Suspense>
  );
}
