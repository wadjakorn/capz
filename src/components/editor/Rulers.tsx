"use client";

import { useEffect, useRef, useState } from "react";

const RULER_SIZE = 20;
const BG = "#150330";
const TICK_MINOR = "rgba(255,255,255,0.10)";
const TICK_MAJOR = "rgba(245,243,255,0.45)";
const TEXT = "rgba(245,243,255,0.55)";
const CROSS = "#a78bfa";

type Props = {
  containerEl: HTMLDivElement | null;
  containerW: number;
  containerH: number;
  padX: number;
  padY: number;
  scale: number;
};

function niceStep(approx: number): number {
  if (!isFinite(approx) || approx <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(approx)));
  const norm = approx / pow;
  let m = 1;
  if (norm > 5) m = 10;
  else if (norm > 2) m = 5;
  else if (norm > 1) m = 2;
  return m * pow;
}

export function Rulers({
  containerEl,
  containerW,
  containerH,
  padX,
  padY,
  scale,
}: Props) {
  const topRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!containerEl) return;
    const onScroll = () => {
      setScroll({ left: containerEl.scrollLeft, top: containerEl.scrollTop });
    };
    onScroll();
    containerEl.addEventListener("scroll", onScroll, { passive: true });
    return () => containerEl.removeEventListener("scroll", onScroll);
  }, [containerEl]);

  useEffect(() => {
    if (!containerEl) return;
    const onMove = (e: MouseEvent) => {
      const r = containerEl.getBoundingClientRect();
      setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
    };
    const onLeave = () => setCursor(null);
    containerEl.addEventListener("mousemove", onMove);
    containerEl.addEventListener("mouseleave", onLeave);
    return () => {
      containerEl.removeEventListener("mousemove", onMove);
      containerEl.removeEventListener("mouseleave", onLeave);
    };
  }, [containerEl]);

  useEffect(() => {
    const canvas = topRef.current;
    if (!canvas || scale <= 0 || containerW <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = containerW;
    const h = RULER_SIZE;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    ctx.font = "9px ui-sans-serif, system-ui, -apple-system";
    ctx.textBaseline = "top";

    const step = niceStep(50 / scale);
    const minor = Math.max(1, step / 5);
    const imgAtLeft = (scroll.left - padX) / scale;
    const imgAtRight = imgAtLeft + w / scale;

    ctx.strokeStyle = TICK_MINOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const firstMinor = Math.ceil(imgAtLeft / minor) * minor;
    for (let v = firstMinor; v <= imgAtRight; v += minor) {
      const sx = Math.round(padX + v * scale - scroll.left) + 0.5;
      ctx.moveTo(sx, h - 3);
      ctx.lineTo(sx, h);
    }
    ctx.stroke();

    ctx.strokeStyle = TICK_MAJOR;
    ctx.fillStyle = TEXT;
    ctx.beginPath();
    const firstMajor = Math.ceil(imgAtLeft / step) * step;
    for (let v = firstMajor; v <= imgAtRight; v += step) {
      const sx = Math.round(padX + v * scale - scroll.left) + 0.5;
      ctx.moveTo(sx, h - 7);
      ctx.lineTo(sx, h);
      ctx.fillText(String(Math.round(v)), sx + 2, 1);
    }
    ctx.stroke();

    if (cursor && cursor.x >= RULER_SIZE && cursor.y >= 0) {
      ctx.strokeStyle = CROSS;
      ctx.beginPath();
      const cx = Math.round(cursor.x) + 0.5;
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();
    }
  }, [containerW, padX, scale, scroll.left, cursor]);

  useEffect(() => {
    const canvas = leftRef.current;
    if (!canvas || scale <= 0 || containerH <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = RULER_SIZE;
    const h = containerH;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    ctx.font = "9px ui-sans-serif, system-ui, -apple-system";
    ctx.textBaseline = "top";

    const step = niceStep(50 / scale);
    const minor = Math.max(1, step / 5);
    const imgAtTop = (scroll.top - padY) / scale;
    const imgAtBottom = imgAtTop + h / scale;

    ctx.strokeStyle = TICK_MINOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const firstMinor = Math.ceil(imgAtTop / minor) * minor;
    for (let v = firstMinor; v <= imgAtBottom; v += minor) {
      const sy = Math.round(padY + v * scale - scroll.top) + 0.5;
      ctx.moveTo(w - 3, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();

    ctx.strokeStyle = TICK_MAJOR;
    ctx.fillStyle = TEXT;
    ctx.beginPath();
    const firstMajor = Math.ceil(imgAtTop / step) * step;
    for (let v = firstMajor; v <= imgAtBottom; v += step) {
      const sy = Math.round(padY + v * scale - scroll.top) + 0.5;
      ctx.moveTo(w - 7, sy);
      ctx.lineTo(w, sy);
      ctx.save();
      ctx.translate(1, sy + 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(String(Math.round(v)), -16, 0);
      ctx.restore();
    }
    ctx.stroke();

    if (cursor && cursor.y >= RULER_SIZE && cursor.x >= 0) {
      ctx.strokeStyle = CROSS;
      ctx.beginPath();
      const cy = Math.round(cursor.y) + 0.5;
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.stroke();
    }
  }, [containerH, padY, scale, scroll.top, cursor]);

  if (scale <= 0) return null;

  return (
    <>
      <canvas
        ref={topRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          pointerEvents: "none",
          zIndex: 5,
        }}
      />
      <canvas
        ref={leftRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          pointerEvents: "none",
          zIndex: 5,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: RULER_SIZE,
          height: RULER_SIZE,
          background: BG,
          borderRight: "1px solid rgba(255,255,255,0.08)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          pointerEvents: "none",
          zIndex: 6,
        }}
      />
    </>
  );
}

export const RULER_INSET = RULER_SIZE;
