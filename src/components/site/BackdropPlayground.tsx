"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Hash, SunMedium } from "lucide-react";
import { paintSwatch, type ProceduralPattern } from "@/lib/backdropPatterns";
import { BACKDROP_PRESETS, colorStops, gradientPoints, patternUnit, type BackdropCategory, type BackdropPreset } from "@/lib/backdrop";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/store";
import { ThaiText } from "./ThaiText";
import { SLOTS } from "./shots";

type Tab = BackdropCategory | "solid";
const TABS: Array<[Tab, TKey]> = [
  ["gradient", "site.bd.tab.gradient"], ["minimal", "site.bd.tab.minimal"], ["art", "site.bd.tab.art"], ["solid", "site.bd.tab.solid"],
];
/** Quick picks beside the colour input on the Solid tab (the app itself shows the input only). */
const SOLIDS = ["#1b1f2a", "#0f0f12", "#ffffff", "#e5e7eb", "#6d7cff", "#ef4444", "#facc15", "#10b981", "#0ea5e9", "#f97316", "#7a2228", "#d9cdf2"];
// Defaults from DEFAULT_CONFIG.general.backdrop (src/lib/config.ts).
const DEFAULT_PADDING = 64;
const DEFAULT_RADIUS = 12;
// Stand-in capture size in image px.
const CAP_W = 1600;
const CAP_H = 1000;

function fillPreset(ctx: CanvasRenderingContext2D, p: BackdropPreset, w: number, h: number, unit: number) {
  if (p.kind === "linear") {
    const { start, end } = gradientPoints(w, h, p.angle);
    const g = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    const stops = colorStops(p.colors);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i] as number, stops[i + 1] as string);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, w, h);
  paintSwatch(p.pattern, ctx, w, h, unit);
}
const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

/** A sample capture drawn on the canvas, carrying a pin and an arrow in the app's defaults. */
function drawCapture(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: number, label: string) {
  const w = CAP_W * s, h = CAP_H * s;
  const sans = getComputedStyle(ctx.canvas).getPropertyValue("--font-sans").trim() || "sans-serif";
  ctx.save(); rr(ctx, x, y, w, h, r * s); ctx.clip();
  ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#eef0f4"; ctx.fillRect(x, y, w, 64 * s);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => { ctx.beginPath(); ctx.arc(x + (36 + i * 30) * s, y + 32 * s, 9 * s, 0, 7); ctx.fillStyle = c; ctx.fill(); });
  rr(ctx, x + w * 0.3, y + 18 * s, w * 0.4, 28 * s, 8 * s); ctx.fillStyle = "#fff"; ctx.fill();
  const cx = x + 90 * s, cy = y + 150 * s;
  ctx.fillStyle = "#14161c"; ctx.font = `700 ${64 * s}px ${sans}`; ctx.textBaseline = "alphabetic"; ctx.textAlign = "start";
  ctx.fillText("วิธีตั้งค่า VPN สำหรับทีม", cx, cy + 40 * s);
  ctx.fillStyle = "#c9ced8";
  [0.82, 0.9, 0.76, 0.88, 0.64, 0, 0.86, 0.7, 0.9, 0.58, 0.8].forEach((b, i) => { if (b) { rr(ctx, cx, cy + (110 + i * 50) * s, (w - 180 * s) * b * 0.6, 18 * s, 9 * s); ctx.fill(); } });
  rr(ctx, x + w - 560 * s, cy + 100 * s, 440 * s, 320 * s, 14 * s); ctx.fillStyle = "#e9ecf3"; ctx.fill();
  const sw = 4 * s * 1.6, ph = sw * 4, ax0 = x + w - 760 * s, ay0 = cy + 600 * s, ax1 = x + w - 470 * s, ay1 = cy + 400 * s;
  const aa = Math.atan2(ay1 - ay0, ax1 - ax0);
  ctx.strokeStyle = "#ef4444"; ctx.lineWidth = sw; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(ax0, ay0); ctx.lineTo(ax1 - Math.cos(aa) * ph * 0.9, ay1 - Math.sin(aa) * ph * 0.9); ctx.stroke();
  ctx.save(); ctx.translate(ax1, ay1); ctx.rotate(aa); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-ph, -ph / 2); ctx.lineTo(-ph, ph / 2); ctx.closePath(); ctx.fillStyle = "#ef4444"; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.arc(x + w - 120 * s, cy + 100 * s, 28 * s, 0, 7); ctx.fillStyle = "#E5342B"; ctx.fill(); ctx.lineWidth = 3 * s; ctx.strokeStyle = "#fff"; ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = `700 ${30 * s}px ${sans}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("1", x + w - 120 * s, cy + 101 * s);
  ctx.textAlign = "start"; ctx.textBaseline = "alphabetic"; ctx.font = `500 ${28 * s}px ${sans}`;
  const tw = ctx.measureText(label).width;
  rr(ctx, x + w - tw - 74 * s, y + h - 88 * s, tw + 48 * s, 56 * s, 28 * s); ctx.fillStyle = "#0c0c10"; ctx.fill();
  ctx.fillStyle = "#fff"; ctx.fillText(label, x + w - tw - 50 * s, y + h - 50 * s);
  ctx.restore();
}

function Swatch({ preset, solid }: { preset?: BackdropPreset; solid?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    if (solid) { ctx.fillStyle = solid; ctx.fillRect(0, 0, 64, 64); return; }
    if (!preset) return;
    // same units as the app's picker (BackdropControl): tiles at 0.5, compositions scaled to the swatch
    const unit = preset.kind === "pattern" && (preset.pattern as ProceduralPattern).mode === "tile" ? 0.5 : 64 / 900;
    fillPreset(ctx, preset, 64, 64, unit);
  }, [preset, solid]);
  return <canvas ref={ref} width={64} height={64} aria-hidden />;
}

/** A replica of the app's backdrop panel driving the app's real renderer. */
export function BackdropPlayground() {
  const { t } = useT();
  const [on, setOn] = useState(true);
  const [tab, setTab] = useState<Tab>("art");
  const [presetId, setPresetId] = useState("riso");
  const [solid, setSolid] = useState("#1b1f2a");
  const [pad, setPad] = useState(DEFAULT_PADDING);
  const [rad, setRad] = useState(DEFAULT_RADIUS);
  const [shadow, setShadow] = useState(true);
  const [announce, setAnnounce] = useState("");
  const stage = useRef<HTMLCanvasElement>(null);
  // Real capture (shots.ts "backdrop-base") once it's in place; the drawn sample until then.
  const [capture, setCapture] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!SLOTS["backdrop-base"].ready) return;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => setCapture(img);
    img.src = "/landing/backdrop-base.webp";
  }, []);
  const preset = useMemo(() => BACKDROP_PRESETS.find((p) => p.id === presetId) ?? BACKDROP_PRESETS[0], [presetId]);
  const list = tab === "solid" ? [] : BACKDROP_PRESETS.filter((p) => p.category === tab);

  useEffect(() => {
    const cv = stage.current;
    if (!cv) return;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
      if (!W || !H) return;
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = getComputedStyle(cv).getPropertyValue("--app-bg").trim() || "#0f0f12";
      ctx.fillRect(0, 0, W, H);
      const p = on ? pad : 0;
      const boxW = CAP_W + p * 2, boxH = CAP_H + p * 2;
      const s = Math.min((W * 0.9) / boxW, (H * 0.9) / boxH);
      const bx = (W - boxW * s) / 2, by = (H - boxH * s) / 2;
      if (on) {
        ctx.save(); ctx.translate(bx, by);
        if (tab === "solid") { ctx.fillStyle = solid; ctx.fillRect(0, 0, boxW * s, boxH * s); }
        else fillPreset(ctx, preset, boxW * s, boxH * s, patternUnit(CAP_W) * s);
        ctx.restore();
      }
      const cx = bx + p * s, cy = by + p * s, r = on ? rad : 0;
      if (on && shadow) {
        ctx.save(); ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 64 * s; ctx.shadowOffsetY = 24 * s;
        rr(ctx, cx, cy, CAP_W * s, CAP_H * s, r * s); ctx.fillStyle = "#fff"; ctx.fill(); ctx.restore();
      }
      if (capture) {
        ctx.save(); rr(ctx, cx, cy, CAP_W * s, CAP_H * s, r * s); ctx.clip();
        ctx.drawImage(capture, cx, cy, CAP_W * s, CAP_H * s);
        ctx.restore();
      } else drawCapture(ctx, cx, cy, s, r, t("site.bd.sample"));
    };
    draw();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(draw);
    ro?.observe(cv);
    document.fonts?.ready.then(draw).catch(() => {});
    return () => ro?.disconnect();
  }, [on, tab, preset, solid, pad, rad, shadow, t, capture]);

  const pick = (id: string, name: string) => { setPresetId(id); setAnnounce(t("site.bd.announce", { name })); };
  const pickSolid = (c: string) => { setSolid(c); setAnnounce(t("site.bd.announce", { name: c })); };
  const swRef = useRef<HTMLDivElement>(null);
  const onSwKey = (e: KeyboardEvent) => {
    const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 6, ArrowUp: -6 } as Record<string, number>)[e.key];
    if (step == null) return;
    e.preventDefault();
    const bs = [...(swRef.current?.querySelectorAll("button") ?? [])];
    const i = Math.max(0, bs.findIndex((b) => b.getAttribute("aria-checked") === "true"));
    const nb = bs[(i + step + bs.length) % bs.length];
    nb?.click(); nb?.focus();
  };
  const onTabKey = (e: KeyboardEvent) => {
    const step = ({ ArrowRight: 1, ArrowLeft: -1 } as Record<string, number>)[e.key];
    if (step == null) return;
    e.preventDefault();
    const i = TABS.findIndex(([id]) => id === tab);
    const next = TABS[(i + step + TABS.length) % TABS.length][0];
    chooseTab(next);
    (e.currentTarget.querySelector(`[data-tab="${next}"]`) as HTMLButtonElement | null)?.focus();
  };
  const chooseTab = (next: Tab) => {
    setTab(next);
    if (next !== "solid" && preset.category !== next) setPresetId(BACKDROP_PRESETS.find((p) => p.category === next)!.id);
  };
  const range = (v: number, min: number, max: number) => ({ "--v": `${((v - min) / (max - min)) * 100}%` }) as CSSProperties;
  const curName = !on ? "—" : tab === "solid" ? solid.toUpperCase() : preset.name;

  return (
    <section className="screen bd" id="backdrops" aria-labelledby="bd-title">
      <div className="wrap">
        <div className="ch-head">
          <h2 id="bd-title"><ThaiText>{t("site.bd.title")}</ThaiText></h2>
          <p>{t("site.bd.desc")}</p>
        </div>
        <div className="bd-grid">
          <div className="bd-stage"><canvas ref={stage} role="img" aria-label={t("site.bd.stage")} /></div>
          <div className="panel">
            <div className="h">{t("site.bd.panel")}</div>
            <button className="action" type="button" aria-pressed={on} onClick={() => setOn(!on)}><Hash aria-hidden />{t("site.bd.show")}</button>
            {on && (
              <div>
                <div className="tabs" role="tablist" aria-label={t("site.bd.styleGroup")} onKeyDown={onTabKey}>
                  {TABS.map(([id, key]) => (
                    <button key={id} role="tab" type="button" data-tab={id} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => chooseTab(id)}>{t(key)}</button>
                  ))}
                </div>
                <div className="sw" role="radiogroup" aria-label={t("site.bd.styles")} ref={swRef} onKeyDown={onSwKey}>
                  {tab === "solid"
                    ? SOLIDS.map((c) => {
                        const sel = solid.toLowerCase() === c;
                        return <button key={c} type="button" role="radio" aria-checked={sel} aria-label={c} title={c} tabIndex={sel ? 0 : -1} onClick={() => pickSolid(c)}><Swatch solid={c} /></button>;
                      })
                    : list.map((p) => {
                        const sel = p.id === presetId;
                        return <button key={p.id} type="button" role="radio" aria-checked={sel} aria-label={p.name} title={p.name} tabIndex={sel ? 0 : -1} onClick={() => pick(p.id, p.name)}><Swatch preset={p} /></button>;
                      })}
                </div>
                {tab === "solid" && (
                  <label className="solid"><span>{t("site.bd.color")}</span><input type="color" value={solid} onChange={(e) => pickSolid(e.target.value)} /></label>
                )}
                <label className="slider"><span>{t("site.bd.padding")}</span><input type="range" min={0} max={256} value={pad} style={range(pad, 0, 256)} onChange={(e) => setPad(+e.target.value)} /><output>{pad}</output></label>
                <label className="slider"><span>{t("site.bd.corners")}</span><input type="range" min={0} max={48} value={rad} style={range(rad, 0, 48)} onChange={(e) => setRad(+e.target.value)} /><output>{rad}</output></label>
                <button className="action" type="button" aria-pressed={shadow} onClick={() => setShadow(!shadow)}><SunMedium aria-hidden />{t("site.bd.shadow")}</button>
              </div>
            )}
          </div>
        </div>
        <div className="bd-meta"><span><b>{curName}</b> · {t(TABS.find(([id]) => id === tab)![1])}</span><span>{t("site.bd.note")}</span></div>
        <p className="sr" aria-live="polite">{announce}</p>
      </div>
    </section>
  );
}
