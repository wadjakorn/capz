"use client";

import { useEffect, useRef, useState } from "react";

const RULER_SIZE = 20;

type RulerColors = {
  bg: string;
  tickMinor: string;
  tickMajor: string;
  text: string;
  cross: string;
  corner: string;
};

const FALLBACK_COLORS: RulerColors = {
  bg: "#161619",
  tickMinor: "rgba(255,255,255,0.10)",
  tickMajor: "rgba(245,243,255,0.45)",
  text: "rgba(245,243,255,0.55)",
  cross: "#6d7cff",
  corner: "rgba(255,255,255,0.08)",
};

/** Canvas can't consume CSS variables, so resolve the themed values off
 *  <html> at draw time and re-read whenever ThemeManager flips the class. */
function readRulerColors(): RulerColors {
  if (typeof window === "undefined") return FALLBACK_COLORS;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) =>
    cs.getPropertyValue(name).trim() || fallback;
  return {
    bg: v("--surface", FALLBACK_COLORS.bg),
    tickMinor: v("--border-strong", FALLBACK_COLORS.tickMinor),
    tickMajor: v("--fg-3", FALLBACK_COLORS.tickMajor),
    text: v("--fg-3", FALLBACK_COLORS.text),
    cross: v("--accent", FALLBACK_COLORS.cross),
    corner: v("--border", FALLBACK_COLORS.corner),
  };
}

function useRulerColors(): RulerColors {
  const [colors, setColors] = useState<RulerColors>(FALLBACK_COLORS);
  useEffect(() => {
    const read = () => setColors(readRulerColors());
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);
  return colors;
}

type Props = {
  containerEl: HTMLDivElement | null;
  containerW: number;
  containerH: number;
  padX: number;
  padY: number;
  scale: number;
  // Image coord that sits at the stage's top-left. Non-zero (negative) when an
  // element overflows the image's top/left edge and the canvas expands.
  originX?: number;
  originY?: number;
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
  originX = 0,
  originY = 0,
}: Props) {
  const topRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const colors = useRulerColors();

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
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.font = "9px ui-sans-serif, system-ui, -apple-system";
    ctx.textBaseline = "top";

    const step = niceStep(50 / scale);
    const minor = Math.max(1, step / 5);
    const imgAtLeft = originX + (scroll.left - padX) / scale;
    const imgAtRight = imgAtLeft + w / scale;

    ctx.strokeStyle = colors.tickMinor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const firstMinor = Math.ceil(imgAtLeft / minor) * minor;
    for (let v = firstMinor; v <= imgAtRight; v += minor) {
      const sx = Math.round(padX + (v - originX) * scale - scroll.left) + 0.5;
      ctx.moveTo(sx, h - 3);
      ctx.lineTo(sx, h);
    }
    ctx.stroke();

    ctx.strokeStyle = colors.tickMajor;
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    const firstMajor = Math.ceil(imgAtLeft / step) * step;
    for (let v = firstMajor; v <= imgAtRight; v += step) {
      const sx = Math.round(padX + (v - originX) * scale - scroll.left) + 0.5;
      ctx.moveTo(sx, h - 7);
      ctx.lineTo(sx, h);
      ctx.fillText(String(Math.round(v)), sx + 2, 1);
    }
    ctx.stroke();

    if (cursor && cursor.x >= RULER_SIZE && cursor.y >= 0) {
      ctx.strokeStyle = colors.cross;
      ctx.beginPath();
      const cx = Math.round(cursor.x) + 0.5;
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();
    }
  }, [containerW, padX, scale, scroll.left, cursor, colors, originX]);

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
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.font = "9px ui-sans-serif, system-ui, -apple-system";
    ctx.textBaseline = "top";

    const step = niceStep(50 / scale);
    const minor = Math.max(1, step / 5);
    const imgAtTop = originY + (scroll.top - padY) / scale;
    const imgAtBottom = imgAtTop + h / scale;

    ctx.strokeStyle = colors.tickMinor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const firstMinor = Math.ceil(imgAtTop / minor) * minor;
    for (let v = firstMinor; v <= imgAtBottom; v += minor) {
      const sy = Math.round(padY + (v - originY) * scale - scroll.top) + 0.5;
      ctx.moveTo(w - 3, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();

    ctx.strokeStyle = colors.tickMajor;
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    const firstMajor = Math.ceil(imgAtTop / step) * step;
    for (let v = firstMajor; v <= imgAtBottom; v += step) {
      const sy = Math.round(padY + (v - originY) * scale - scroll.top) + 0.5;
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
      ctx.strokeStyle = colors.cross;
      ctx.beginPath();
      const cy = Math.round(cursor.y) + 0.5;
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.stroke();
    }
  }, [containerH, padY, scale, scroll.top, cursor, colors, originY]);

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
          background: colors.bg,
          borderRight: `1px solid ${colors.corner}`,
          borderBottom: `1px solid ${colors.corner}`,
          pointerEvents: "none",
          zIndex: 6,
        }}
      />
    </>
  );
}

export const RULER_INSET = RULER_SIZE;
