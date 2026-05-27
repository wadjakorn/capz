"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettings } from "@/stores/settings";

type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
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

function hitTest(list: WindowOverlayInfo[], pt: Point): WindowOverlayInfo | null {
  for (const w of list) {
    if (
      pt.x >= w.x &&
      pt.x < w.x + w.width &&
      pt.y >= w.y &&
      pt.y < w.y + w.height
    ) {
      return w;
    }
  }
  return null;
}

function OverlayInner() {
  const params = useSearchParams();
  const monitorId = Number(params.get("monitor") ?? "0");
  const mode = (params.get("mode") ?? "area") as Mode;

  const initSettings = useSettings((s) => s.init);
  const settingsReady = useSettings((s) => s.ready);
  const rememberLastRegion = useSettings((s) => s.config.general.rememberLastRegion);
  const lastRegion = useSettings((s) => s.config.lastUsed?.region);

  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [windows, setWindows] = useState<WindowOverlayInfo[]>([]);
  const [hovered, setHovered] = useState<WindowOverlayInfo | null>(null);
  const fetchedRef = useRef(false);
  const cutoutRafRef = useRef<number | null>(null);
  const lastCutoutRef = useRef<Rect | null>(null);

  // Rust-side HWND region cutout (Windows-only no-op elsewhere). Coalesced to
  // one call per animation frame so high-frequency mousemove doesn't thrash
  // SetWindowRgn.
  const requestCutout = (rect: Rect | null) => {
    const next = rect && rect.w > 0 && rect.h > 0
      ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }
      : { x: 0, y: 0, w: 0, h: 0 };
    const prev = lastCutoutRef.current;
    if (prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h) {
      return;
    }
    lastCutoutRef.current = next;
    if (cutoutRafRef.current != null) return;
    cutoutRafRef.current = requestAnimationFrame(() => {
      cutoutRafRef.current = null;
      const r = lastCutoutRef.current;
      if (!r) return;
      invoke("set_overlay_cutout", {
        monitorId,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
      }).catch((e) => console.warn("set_overlay_cutout failed", e));
    });
  };

  useEffect(() => {
    void initSettings();
  }, [initSettings]);

  // Prefill drag rect with last region if toggle on and region matches this monitor.
  useEffect(() => {
    if (mode !== "area" || !settingsReady) return;
    if (!rememberLastRegion || !lastRegion) return;
    if (lastRegion.monitorId !== monitorId) return;
    if (start || end) return;
    const a = { x: lastRegion.x, y: lastRegion.y };
    const b = { x: lastRegion.x + lastRegion.w, y: lastRegion.y + lastRegion.h };
    setStart(a);
    setEnd(b);
    setPrefilled(true);
    setActive(true);
    requestCutout({ x: a.x, y: a.y, w: lastRegion.w, h: lastRegion.h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsReady, rememberLastRegion, lastRegion, mode, monitorId]);

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
      if (cutoutRafRef.current != null) {
        cancelAnimationFrame(cutoutRafRef.current);
        cutoutRafRef.current = null;
      }
    };
  }, []);

  // Enter confirms current area selection (prefilled or freshly drawn).
  useEffect(() => {
    if (mode !== "area") return;
    const onEnter = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || busy || !start || !end) return;
      e.preventDefault();
      const rect = normalize(start, end);
      if (rect.w >= 4 && rect.h >= 4) void confirmRegion(rect);
    };
    window.addEventListener("keydown", onEnter);
    return () => window.removeEventListener("keydown", onEnter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, busy, start, end]);

  // window-mode: fetch list once when this overlay becomes active.
  useEffect(() => {
    if (mode !== "window" || !active || fetchedRef.current) return;
    fetchedRef.current = true;
    invoke<WindowOverlayInfo[]>("list_capture_windows", { monitorId })
      .then(setWindows)
      .catch((e) => console.error("list_capture_windows failed", e));
  }, [mode, active, monitorId]);

  const onPointerEnter = () => {
    setActive(true);
    getCurrentWindow()
      .setFocus()
      .catch((e) => console.warn("setFocus failed", e));
  };

  const onPointerLeave = () => {
    if (!start) setActive(false);
    if (mode === "window") {
      setHovered(null);
      requestCutout(null);
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!active) setActive(true);
    if (mode === "area") {
      if (!start || busy || prefilled) return;
      const next = { x: e.clientX, y: e.clientY };
      setEnd(next);
      requestCutout(normalize(start, next));
    } else if (mode === "window") {
      if (busy) return;
      const hit = hitTest(windows, { x: e.clientX, y: e.clientY });
      setHovered(hit);
      requestCutout(hit ? { x: hit.x, y: hit.y, w: hit.width, h: hit.height } : null);
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (busy || !active) return;
    if (mode !== "area") return;
    setPrefilled(false);
    setStart({ x: e.clientX, y: e.clientY });
    setEnd({ x: e.clientX, y: e.clientY });
    requestCutout(null);
  };

  const onClick = async () => {
    if (busy || !active) return;
    if (mode === "full") {
      setBusy(true);
      getCurrentWindow()
        .hide()
        .catch((e) => console.warn("hide overlay failed", e));
      try {
        await invoke<string>("capture_full_monitor", { monitorId });
      } catch (err) {
        console.error("capture_full_monitor failed", err);
        closeOverlay();
      }
    } else if (mode === "window") {
      if (!hovered) return;
      setBusy(true);
      getCurrentWindow()
        .hide()
        .catch((e) => console.warn("hide overlay failed", e));
      try {
        await invoke<string>("capture_window_command", { windowId: hovered.id });
      } catch (err) {
        console.error("capture_window_command failed", err);
        closeOverlay();
      }
    }
  };

  const confirmRegion = async (rect: Rect) => {
    setBusy(true);
    const rounded = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.w),
      h: Math.round(rect.h),
    };
    if (rememberLastRegion) {
      try {
        await useSettings.getState().setLastUsed({
          ...(useSettings.getState().config.lastUsed ?? {}),
          region: { monitorId, ...rounded },
        });
      } catch (e) {
        console.warn("persist lastUsed.region failed", e);
      }
    }
    getCurrentWindow()
      .hide()
      .catch((e) => console.warn("hide overlay failed", e));
    try {
      const path = await invoke<string>("capture_region_command", {
        monitorId,
        ...rounded,
      });
      console.info("capture_region_command → editor", path);
    } catch (e) {
      console.error("capture_region_command failed", e);
      closeOverlay();
    }
  };

  const onMouseUp = async () => {
    if (mode !== "area") return;
    if (!start || !end || busy) return;
    const rect = normalize(start, end);
    if (rect.w < 4 || rect.h < 4) {
      setStart(null);
      setEnd(null);
      requestCutout(null);
      closeOverlay();
      return;
    }
    // Keep dragRect rendered (cutout + 4-div dim) until Rust hides the
    // overlay inside capture_region_command. Clearing start/end here would
    // briefly revert to full-screen dim that BitBlt could bake into the
    // capture.
    await confirmRegion(rect);
  };

  const dragRect = start && end ? normalize(start, end) : null;

  const hintText = useMemo(() => {
    if (!active) return "Move cursor here to select on this screen";
    switch (mode) {
      case "area":
        return start && end
          ? "Enter to capture · Drag to adjust · Esc to cancel"
          : "Drag to select · Esc to cancel";
      case "full":
        return "Click to capture this screen · Esc to cancel";
      case "window":
        return "Click a window to capture · Esc to cancel";
    }
  }, [active, mode, start, end]);

  const cutoutRect: Rect | null =
    mode === "area"
      ? dragRect
      : mode === "window" && active && hovered
      ? { x: hovered.x, y: hovered.y, w: hovered.width, h: hovered.height }
      : null;

  return (
    <div
      className={`fixed inset-0 select-none ${active ? "cursor-crosshair" : "cursor-default"}`}
      style={{
        background: cutoutRect ? "transparent" : active ? "rgba(0, 0, 0, 0.35)" : "rgba(0, 0, 0, 0.12)",
        transition: cutoutRect ? "none" : "background 80ms ease-out",
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onClick={onClick}
    >
      {active && !cutoutRect && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: "inset 0 0 0 3px rgba(167, 139, 250, 0.6)" }}
        />
      )}

      {/* OuterDim children are pointer-events:none so clicks pass through to
          the root div's handlers (which guard via active/start/hovered checks). */}
      {cutoutRect && <OuterDim rect={cutoutRect} />}

      {mode === "area" && dragRect && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: dragRect.x,
            top: dragRect.y,
            width: dragRect.w,
            height: dragRect.h,
            border: prefilled
              ? "2px dashed #34d399"
              : "2px solid #a78bfa",
            boxShadow: prefilled
              ? "0 0 0 1px rgba(52, 211, 153, 0.25), 0 8px 24px -8px rgba(52, 211, 153, 0.45)"
              : "0 0 0 1px rgba(167, 139, 250, 0.25), 0 8px 24px -8px rgba(124, 58, 237, 0.45)",
          }}
        >
          <div
            className="absolute -top-7 left-0 rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide text-white/90"
            style={{
              background: "rgba(22, 6, 47, 0.88)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 0 rgba(255,255,255,0.04), 0 8px 24px -10px rgba(0,0,0,0.55)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            {Math.round(dragRect.w)} × {Math.round(dragRect.h)}
          </div>
        </div>
      )}

      {mode === "window" && active && hovered && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: hovered.x,
            top: hovered.y,
            width: hovered.width,
            height: hovered.height,
            border: "2px solid #a78bfa",
            boxShadow:
              "0 0 0 1px rgba(167, 139, 250, 0.25), 0 8px 24px -8px rgba(124, 58, 237, 0.45)",
          }}
        >
          <div
            className="absolute -top-7 left-0 max-w-[80vw] truncate rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide text-white/90"
            style={{
              background: "rgba(22, 6, 47, 0.88)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 0 rgba(255,255,255,0.04), 0 8px 24px -10px rgba(0,0,0,0.55)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            {(hovered.app_name || "") +
              (hovered.title ? ` — ${hovered.title}` : "")}
          </div>
        </div>
      )}

      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg px-3.5 py-2 text-[12px] text-white/85"
        style={{
          background: "rgba(22, 6, 47, 0.88)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 32px -14px rgba(0,0,0,0.6)",
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

export default function OverlayPage() {
  return (
    <Suspense fallback={null}>
      <OverlayInner />
    </Suspense>
  );
}
