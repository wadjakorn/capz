"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

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

  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [windows, setWindows] = useState<WindowOverlayInfo[]>([]);
  const [hovered, setHovered] = useState<WindowOverlayInfo | null>(null);
  const fetchedRef = useRef(false);

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
    if (mode === "window") setHovered(null);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!active) setActive(true);
    if (mode === "area") {
      if (!start || busy) return;
      setEnd({ x: e.clientX, y: e.clientY });
    } else if (mode === "window") {
      if (busy) return;
      setHovered(hitTest(windows, { x: e.clientX, y: e.clientY }));
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (busy || !active) return;
    if (mode !== "area") return;
    setStart({ x: e.clientX, y: e.clientY });
    setEnd({ x: e.clientX, y: e.clientY });
  };

  const onClick = async () => {
    if (busy || !active) return;
    if (mode === "full") {
      setBusy(true);
      try {
        await invoke<string>("capture_full_monitor", { monitorId });
      } catch (err) {
        console.error("capture_full_monitor failed", err);
        closeOverlay();
      }
    } else if (mode === "window") {
      if (!hovered) return;
      setBusy(true);
      try {
        await invoke<string>("capture_window_command", { windowId: hovered.id });
      } catch (err) {
        console.error("capture_window_command failed", err);
        closeOverlay();
      }
    }
  };

  const onMouseUp = async () => {
    if (mode !== "area") return;
    if (!start || !end || busy) return;
    const rect = normalize(start, end);
    setStart(null);
    setEnd(null);
    if (rect.w < 4 || rect.h < 4) {
      closeOverlay();
      return;
    }
    setBusy(true);
    try {
      const path = await invoke<string>("capture_region_command", {
        monitorId,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.w),
        h: Math.round(rect.h),
      });
      console.info("capture_region_command → editor", path);
    } catch (e) {
      console.error("capture_region_command failed", e);
      closeOverlay();
    }
  };

  const dragRect = start && end ? normalize(start, end) : null;

  const hintText = useMemo(() => {
    if (!active) return "Move cursor here to select on this screen";
    switch (mode) {
      case "area":
        return "Drag to select · Esc to cancel";
      case "full":
        return "Click to capture this screen · Esc to cancel";
      case "window":
        return "Click a window to capture · Esc to cancel";
    }
  }, [active, mode]);

  return (
    <div
      className={`fixed inset-0 select-none ${active ? "cursor-crosshair" : "cursor-default"}`}
      style={{
        background: active ? "rgba(0, 0, 0, 0.35)" : "rgba(0, 0, 0, 0.12)",
        transition: "background 80ms ease-out",
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onClick={onClick}
    >
      {active && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: "inset 0 0 0 3px rgba(56, 189, 248, 0.6)" }}
        />
      )}

      {mode === "area" && dragRect && (
        <div
          className="absolute border-2 border-sky-400"
          style={{
            left: dragRect.x,
            top: dragRect.y,
            width: dragRect.w,
            height: dragRect.h,
            background: "rgba(56, 189, 248, 0.1)",
          }}
        >
          <div className="absolute -top-6 left-0 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
            {Math.round(dragRect.w)} × {Math.round(dragRect.h)}
          </div>
        </div>
      )}

      {mode === "window" && active && hovered && (
        <div
          className="pointer-events-none absolute border-2 border-sky-400"
          style={{
            left: hovered.x,
            top: hovered.y,
            width: hovered.width,
            height: hovered.height,
            background: "rgba(56, 189, 248, 0.12)",
          }}
        >
          <div className="absolute -top-6 left-0 max-w-[80vw] truncate rounded bg-black/80 px-2 py-0.5 text-xs text-white">
            {(hovered.app_name || "") +
              (hovered.title ? ` — ${hovered.title}` : "")}
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-1.5 text-xs text-white">
        {hintText}
      </div>
    </div>
  );
}

export default function OverlayPage() {
  return (
    <Suspense fallback={null}>
      <OverlayInner />
    </Suspense>
  );
}
