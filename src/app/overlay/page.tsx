"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { invoke } from "@tauri-apps/api/core";

type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

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

function OverlayInner() {
  const params = useSearchParams();
  const monitorId = Number(params.get("monitor") ?? "0");

  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false);

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

  const onMouseDown = (e: React.MouseEvent) => {
    if (busy) return;
    setStart({ x: e.clientX, y: e.clientY });
    setEnd({ x: e.clientX, y: e.clientY });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!start || busy) return;
    setEnd({ x: e.clientX, y: e.clientY });
  };

  const onMouseUp = async () => {
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

  const rect = start && end ? normalize(start, end) : null;

  return (
    <div
      className="fixed inset-0 cursor-crosshair select-none"
      style={{ background: "rgba(0, 0, 0, 0.3)" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {rect && (
        <div
          className="absolute border-2 border-sky-400"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            background: "rgba(56, 189, 248, 0.1)",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0)",
          }}
        >
          <div className="absolute -top-6 left-0 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
            {Math.round(rect.w)} × {Math.round(rect.h)}
          </div>
        </div>
      )}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-1.5 text-xs text-white">
        Drag to select · Esc to cancel
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
