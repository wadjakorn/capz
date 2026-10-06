"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/store";

/** The specimen's three layers, moved at different rates by the hero scene. */
export type SpecimenLayers = { lv: SVGSVGElement; gl: SVGSVGElement; an: SVGSVGElement; pins: SVGGElement[] };

const NS = "http://www.w3.org/2000/svg";
// The app's annotation defaults (src/lib/config.ts): arrow/pen red, pin red, magnify/highlighter yellow.
const RED = "#ef4444";
const PIN = "#E5342B";
const YEL = "#facc15";

type Attrs = Record<string, string | number>;
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, String(attrs[k]));
  parent?.appendChild(n);
  return n;
}

/**
 * Builds the specimen: a Thai line measured live from the display font at its
 * four vertical levels, then marked up with capz's own default tools. Three
 * tiers are rethought rather than scaled — phone shows one word, tablet the
 * full line filling the width, desktop the line plus a magnifier column.
 */
function build(host: HTMLElement, t: (k: TKey) => string, reduced: boolean): SpecimenLayers | null {
  const family = getComputedStyle(host).getPropertyValue("--font-display").trim() || "serif";
  const iw = window.innerWidth;
  const tier = iw <= 600 ? "phone" : iw <= 1024 ? "tablet" : "desk";
  const mobile = tier !== "desk";
  const line = tier === "phone" ? "ผู้ใหญ่" : "ผู้ใหญ่ปั้นน้ำเป็นตัว";
  const FS = 200;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  ctx.font = `${FS}px ${family}`;
  const m = (s: string) => ctx.measureText(s);
  const lvTone = m("ปั้").actualBoundingBoxAscent;
  const lvUpper = m("นั").actualBoundingBoxAscent;
  const lvX = m("น").actualBoundingBoxAscent;
  const lvLower = m("ผู").actualBoundingBoxDescent;
  const lineW = m(line).width;
  const LABEL = mobile ? 0 : 230;
  const srcR = Math.max(m("น้ำ").width * 0.62, (lvTone + 24) * 0.56);
  const zoom = 2;
  const tR = srcR * zoom;
  const RIGHT = tier === "desk" ? tR * 2 + 70 : tier === "tablet" ? 210 : 230;
  const W = LABEL + lineW + RIGHT;
  const u = W / (host.clientWidth || iw); // specimen units per CSS px
  const k = mobile ? Math.max(1.2, (16 / 18) * u) : 1.5; // units per app px: pins stay ~16px on screen
  const pr = 18 * k;
  const top = tier === "desk" ? Math.max(lvTone + 96, tR + lvTone / 2 - 20 + 14) : lvTone + pr * 2 + 24;
  const by = top;
  const bandTop = by + lvLower + (tier === "desk" ? 110 : pr * 2 + 40);
  const noteStep = 34 * u;
  const H = tier === "desk" ? Math.max(bandTop + 90, top - lvTone / 2 + 20 + tR + 14)
    : tier === "tablet" ? bandTop + Math.max(3 * noteStep + 20 * u, tR * 1.4)
    : bandTop + 3 * noteStep + 16 * u;

  const vb = `0 0 ${W} ${H}`;
  const stack = document.createElement("div");
  stack.className = "spec-stack";
  stack.setAttribute("role", "img");
  stack.setAttribute("aria-label", t("site.spec.aria"));
  const svgL = el("svg", { viewBox: vb, "aria-hidden": "true" });
  const svgG = el("svg", { viewBox: vb, "aria-hidden": "true" });
  const svg = el("svg", { viewBox: vb, "aria-hidden": "true" });
  stack.append(svgL, svgG, svg);
  host.replaceChildren(stack); // attached early so getBBox works
  const defs = el("defs", {}, svg);
  const lv = el("g", { class: "lvl" }, svgL);
  const gl = el("g", {}, svgG);
  const an = el("g", {}, svg);
  const pins: SVGGElement[] = [];

  const levels = [
    { y: -lvTone, key: "site.spec.tone" as const },
    { y: -lvUpper, key: "site.spec.upper" as const },
    { y: -lvX, key: "site.spec.xline" as const },
    { y: 0, key: "site.spec.base" as const, base: true },
    { y: lvLower, key: "site.spec.lower" as const },
  ];
  for (const L of levels) {
    el("line", { x1: 0, x2: mobile ? W : LABEL + lineW + 20, y1: by + L.y, y2: by + L.y, class: L.base ? "base" : "", "stroke-dasharray": L.base ? "" : "6 6" }, lv);
    const v = Math.round(-L.y);
    const tx = el("text", { x: mobile ? W : 0, y: by + L.y - 4 * (mobile ? u : 1), "font-size": mobile ? 12 * u : 22, class: L.base ? "base" : "", "text-anchor": mobile ? "end" : "start" }, lv);
    tx.textContent = mobile ? t(L.key) : `${t(L.key)}  ${v > 0 ? "+" : ""}${v}px`;
  }
  const glyph = el("text", { x: LABEL, y: by, "font-size": FS, class: "spec-glyph" }, gl);
  glyph.textContent = line;

  const locate = (cl: string) => {
    const at = line.indexOf(cl);
    const x0 = m(line.slice(0, Math.max(0, at))).width;
    const w = m(cl).width;
    return { x: LABEL + x0 + w / 2, w };
  };
  let d = 120;
  const later = () => (d += 150);

  // app arrow: #ef4444, width 4, filled triangular head (pointer = 4 × stroke)
  const arrow = (pathD: string) => {
    const sw = 4 * k;
    const ph = sw * 4;
    const probe = el("path", { d: pathD }, defs);
    const len = probe.getTotalLength();
    const pts: string[] = [];
    for (let i = 0; i <= 40; i++) {
      const q = probe.getPointAtLength(((len - ph * 0.9) * i) / 40);
      pts.push(`${q.x.toFixed(1)} ${q.y.toFixed(1)}`);
    }
    const shaft = el("path", { d: "M" + pts.join(" L"), fill: "none", stroke: RED, "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round", class: "a-stroke", style: `--d:${later()}ms` }, an);
    shaft.style.setProperty("--len", String(shaft.getTotalLength()));
    const a = probe.getPointAtLength(len);
    const b = probe.getPointAtLength(len - ph);
    const ang = (Math.atan2(a.y - b.y, a.x - b.x) * 180) / Math.PI;
    // placement on a wrapper: the pop animation owns the inner element's transform
    const hg = el("g", { transform: `translate(${a.x} ${a.y}) rotate(${ang})` }, an);
    el("path", { d: `M0 0 L${-ph} ${-ph / 2} L${-ph} ${ph / 2} Z`, fill: RED, class: "a-pop", style: `--d:${d + 450}ms` }, hg);
    const mid = probe.getPointAtLength(len / 2);
    el("circle", { cx: mid.x, cy: mid.y, r: 5 * k, fill: "#fff", stroke: "#6d7cff", "stroke-width": 1.5 * k, class: "a-pop", style: `--d:${d + 300}ms` }, an);
  };
  // app pin: #E5342B circle, size 36, 2px white border, white bold numeral
  const pin = (n: string, x: number, y: number) => {
    const pw = el("g", { class: "pw" }, an);
    pins.push(pw);
    const g = el("g", { class: "a-pop", style: `--d:${later()}ms` }, pw);
    el("circle", { cx: x, cy: y, r: pr, fill: PIN, stroke: "#fff", "stroke-width": 2 * k }, g);
    const tx = el("text", { x, y: y + 1, fill: "#fff", "font-size": 19 * k, "font-weight": 700, "font-family": "var(--font-sans), sans-serif", "text-anchor": "middle", "dominant-baseline": "central" }, g);
    tx.textContent = n;
  };
  // app text tool: #000 on a #fff box, 14px padding
  const label = (txt: string, x: number, y: number) => {
    const fs = mobile ? 16 * u : 24 * k * 0.78;
    const pad = mobile ? 9 * u : 14 * k * 0.78;
    const g = el("g", { class: "a-pop", style: `--d:${later()}ms` }, an);
    const rect = el("rect", { fill: "#fff", rx: 2 }, g);
    const tx = el("text", { x: x + pad, y, "font-size": fs, "font-family": "var(--font-sans), sans-serif", "font-weight": 500, fill: "#000", "dominant-baseline": "central" }, g);
    tx.textContent = txt;
    const bb = tx.getBBox();
    const box = { x: bb.x - pad, y: bb.y - pad * 0.6, w: bb.width + pad * 2, h: bb.height + pad * 1.2 };
    rect.setAttribute("x", String(box.x));
    rect.setAttribute("y", String(box.y));
    rect.setAttribute("width", String(box.w));
    rect.setAttribute("height", String(box.h));
    rect.style.filter = "drop-shadow(0 1px 1px rgba(0,0,0,.18))";
    return box;
  };

  const phu = locate("ผู้");
  const yo = locate("ญ");
  if (tier === "phone") {
    // one word carries all four levels: ้ on top, ู below, ญ's tail below
    pin("1", phu.x + phu.w * 0.22, by - lvTone - pr - 8);
    pin("2", phu.x - phu.w * 0.18, by + lvLower + pr + 8);
    pin("3", yo.x + yo.w * 0.05, by + lvLower + pr + 8);
    let ly = bandTop + noteStep * 0.5;
    const boxes = (["site.spec.n1", "site.spec.n2", "site.spec.n3"] as const).map((key) => {
      const b = label(t(key), 0, ly);
      ly += noteStep;
      return b;
    });
    const b = boxes[2];
    const ex = yo.x + yo.w * 0.3;
    const ey = by + lvLower * 0.7;
    arrow(`M${b.x + b.w + 10 * u} ${b.y + b.h / 2} Q${ex + 40 * u} ${b.y + b.h / 2} ${ex + 6 * u} ${ey + pr * 2 + 14 * u}`);
  } else {
    const pan = locate("ปั้");
    const num = locate("น้ำ");
    pin("1", pan.x + 2, by - lvTone - pr - 6);
    pin("2", yo.x + 6, by + lvLower + pr + 6);
    pin("3", num.x + num.w * 0.2, by - lvTone - pr - 6);

    // magnify (app defaults): 2px dashed source with 15% fill, dashed link, 3px target, zoom 2
    const scx = num.x;
    const scy = by - lvTone / 2 + 8;
    const tcx = W - tR - (mobile ? 6 : 20);
    const tcy = mobile ? H - tR - 8 : top - lvTone / 2 + 20;
    const gm = el("g", { class: "a-pop", style: `--d:${later()}ms` }, an);
    const dash = `${6 * k} ${4 * k}`;
    el("circle", { cx: scx, cy: scy, r: srcR, fill: "rgba(250,204,21,.15)", stroke: YEL, "stroke-width": 2 * k, "stroke-dasharray": dash }, gm);
    const ang = Math.atan2(tcy - scy, tcx - scx);
    el("line", { x1: scx + Math.cos(ang) * srcR, y1: scy + Math.sin(ang) * srcR, x2: tcx - Math.cos(ang) * tR, y2: tcy - Math.sin(ang) * tR, stroke: YEL, "stroke-width": 2 * k, "stroke-dasharray": dash }, gm);
    const clipId = `lc-${Math.random().toString(36).slice(2, 8)}`;
    const cp = el("clipPath", { id: clipId }, defs);
    el("circle", { cx: tcx, cy: tcy, r: tR }, cp);
    el("circle", { cx: tcx, cy: tcy, r: tR, fill: "#fff" }, gm);
    const zg = el("g", { "clip-path": `url(#${clipId})` }, gm);
    const inner = el("g", { transform: `translate(${tcx - scx * zoom} ${tcy - scy * zoom}) scale(${zoom})` }, zg);
    for (const L of levels) el("line", { x1: 0, x2: W, y1: by + L.y, y2: by + L.y, stroke: L.base ? "#0c0c10" : "#c9ccd4", "stroke-width": 1, "stroke-dasharray": L.base ? "" : "6 6" }, inner);
    const zt = el("text", { x: LABEL, y: by, "font-size": FS, class: "spec-glyph" }, inner);
    zt.textContent = line;
    el("circle", { cx: tcx, cy: tcy, r: tR, fill: "none", stroke: YEL, "stroke-width": 3 * k }, gm);

    if (tier === "desk") {
      const y0 = bandTop + 30;
      const b4 = label(t("site.spec.l4"), 0, y0);
      const b1 = label(t("site.spec.l1"), b4.x + b4.w + 36, y0);
      const b2 = label(t("site.spec.l2"), b1.x + b1.w + 36, y0);
      label(t("site.spec.l3"), b2.x + b2.w + 36, y0);
      const sx = b4.x + b4.w * 0.62;
      const sy = b4.y - 6;
      const ex = phu.x - 10;
      const ey = by + lvLower * 0.86;
      arrow(`M${sx} ${sy} Q${sx + 30} ${(sy + ey) / 2 + 10} ${ex} ${ey}`);
    } else {
      let ly = bandTop + noteStep * 0.5;
      const boxes = (["site.spec.l1", "site.spec.l2", "site.spec.l3"] as const).map((key) => {
        const b = label(t(key), 0, ly);
        ly += noteStep;
        return b;
      });
      const b = boxes[1];
      arrow(`M${b.x + b.w + 10 * u} ${b.y + b.h / 2} Q${yo.x + 20 * u} ${b.y + b.h / 2} ${yo.x + 4} ${by + lvLower + pr * 2 + 10}`);
    }
  }
  if (!reduced) requestAnimationFrame(() => svg.classList.add("draw"));
  return { lv: svgL, gl: svgG, an: svg, pins };
}

export function SpecimenHero({ onLayers }: { onLayers?: (l: SpecimenLayers | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t, lang } = useT();
  const cb = useRef(onLayers);
  cb.current = onLayers;

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let alive = true;
    let lastW = window.innerWidth;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const run = () => {
      const family = getComputedStyle(host).getPropertyValue("--font-display").trim();
      document.fonts.load(`200px ${family || "serif"}`, "ผู้ใหญ่ปั้นน้ำเป็นตัว").catch(() => {}).finally(() => {
        if (alive) cb.current?.(build(host, t, reduced));
      });
    };
    run();
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (window.innerWidth !== lastW) { lastW = window.innerWidth; run(); }
      }, 150);
    };
    window.addEventListener("resize", onResize);
    return () => { alive = false; window.removeEventListener("resize", onResize); window.clearTimeout(timer); };
  }, [t, lang]);

  return (
    <div className="specimen" ref={ref}>
      <div className="fallback" aria-hidden>ผู้ใหญ่ปั้นน้ำเป็นตัว</div>
    </div>
  );
}
