/**
 * Procedural backdrop styles: the minimal and art presets that a two-stop
 * linear gradient can't express (grain, weaves, halftones, compositions).
 *
 * Everything is drawn with plain Canvas 2D from a seeded PRNG, so a given
 * preset renders the same pixels in the sidebar swatch, on the stage and in
 * the exported file. No image assets.
 *
 * Two render modes:
 *  - `tile` — a small seamless tile repeated by Konva's `fillPatternImage`.
 *    Used for weaves and textures; cheap at any box size.
 *  - `box` — one canvas sized to the whole backdrop box. Used for
 *    compositions anchored to the edges/corners (Bauhaus, Aura, Op Art…).
 *
 * Draw functions work in *design units*: one unit is one image pixel on a
 * ~1600px-wide capture. `unit` scales that up for large (Retina) captures so a
 * gingham check reads the same size relative to the screenshot either way.
 */

export type Rng = () => number;

/** Small, fast, seedable PRNG (mulberry32). Deterministic across platforms. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;
export type PatternDraw = (ctx: Ctx, w: number, h: number, rng: Rng) => void;

export type ProceduralPattern =
  | { mode: "tile"; tile: number; seed: number; draw: PatternDraw }
  | { mode: "box"; seed: number; draw: PatternDraw };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fill(ctx: Ctx, color: string, w: number, h: number) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Monochrome film grain over the whole backing canvas (device pixels, ignores
 * the current transform). `amount` is the peak deviation as a fraction of 255.
 * Per-pixel noise is inherently seamless, so it is safe on tiles.
 */
function grain(ctx: Ctx, rng: Rng, amount: number) {
  const { width, height } = ctx.canvas;
  if (width === 0 || height === 0) return;
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  const k = amount * 255;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 2 * k;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function radial(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  stops: Array<[number, string]>,
  w: number,
  h: number,
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Plain weave over a square tile: warp colour by column, weft colour by row,
 * and a 2/2 twill decides which thread is on top. With a 4-dark/4-light sett
 * this *is* houndstooth; with a mirrored multi-colour sett it is tartan.
 */
function twill(ctx: Ctx, sett: string[], cell: number) {
  const n = sett.length;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const warpOnTop = (x + y) % 4 < 2;
      ctx.fillStyle = warpOnTop ? sett[x] : sett[y];
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}

/** Expand `[color, threads]` runs, then mirror (symmetric tartan sett). */
function sett(runs: Array<[string, number]>, mirror: boolean): string[] {
  const out: string[] = [];
  for (const [c, n] of runs) for (let i = 0; i < n; i++) out.push(c);
  return mirror ? out.concat([...out].reverse()) : out;
}

/** Halftone dot screen at `angle`, dot radius from `field(x, y)` in 0..1. */
function halftone(
  ctx: Ctx,
  w: number,
  h: number,
  color: string,
  angleDeg: number,
  pitch: number,
  maxR: number,
  field: (x: number, y: number) => number,
  dx = 0,
  dy = 0,
) {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const reach = Math.hypot(w, h);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let v = -reach; v <= reach; v += pitch) {
    for (let u = -reach; u <= reach; u += pitch) {
      const x = w / 2 + u * cos - v * sin + dx;
      const y = h / 2 + u * sin + v * cos + dy;
      if (x < -pitch || y < -pitch || x > w + pitch || y > h + pitch) continue;
      const r = maxR * field(x, y);
      if (r < 0.25) continue;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Minimal
// ---------------------------------------------------------------------------

const paper: ProceduralPattern = {
  mode: "tile",
  tile: 256,
  seed: 11,
  draw(ctx, w, h, rng) {
    fill(ctx, "#f3efe6", w, h);
    grain(ctx, rng, 0.035);
  },
};

const ink: ProceduralPattern = {
  mode: "box",
  seed: 12,
  draw(ctx, w, h, rng) {
    fill(ctx, "#0d0e11", w, h);
    radial(
      ctx,
      w / 2,
      h / 2,
      Math.hypot(w, h) / 2,
      [
        [0, "rgba(46, 52, 68, 0.55)"],
        [1, "rgba(46, 52, 68, 0)"],
      ],
      w,
      h,
    );
    grain(ctx, rng, 0.02);
  },
};

const fog: ProceduralPattern = {
  mode: "box",
  seed: 13,
  draw(ctx, w, h, rng) {
    fill(ctx, "#c5cad3", w, h);
    radial(
      ctx,
      w / 2,
      h * 0.42,
      Math.hypot(w, h) * 0.55,
      [
        [0, "#f0f2f5"],
        [0.55, "#dde1e6"],
        [1, "rgba(197, 202, 211, 0)"],
      ],
      w,
      h,
    );
    grain(ctx, rng, 0.012);
  },
};

const sand: ProceduralPattern = {
  mode: "box",
  seed: 14,
  draw(ctx, w, h, rng) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#ebe2d1");
    g.addColorStop(1, "#d4c5a9");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Linen: faint, irregular horizontal and vertical slubs.
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = `rgba(120, 96, 60, ${0.015 + rng() * 0.035})`;
      ctx.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 3) {
      ctx.fillStyle = `rgba(255, 250, 240, ${rng() * 0.05})`;
      ctx.fillRect(x, 0, 1, h);
    }
    grain(ctx, rng, 0.025);
  },
};

const hairline: ProceduralPattern = {
  mode: "tile",
  tile: 240,
  seed: 15,
  draw(ctx, w, h) {
    fill(ctx, "#f7f6f3", w, h);
    for (let i = 0; i < 10; i++) {
      const p = i * 24;
      ctx.fillStyle = i % 5 === 0 ? "rgba(24, 26, 34, 0.12)" : "rgba(24, 26, 34, 0.06)";
      ctx.fillRect(p, 0, 1, h);
      ctx.fillRect(0, p, w, 1);
    }
  },
};

const dotgrid: ProceduralPattern = {
  mode: "tile",
  tile: 20,
  seed: 16,
  draw(ctx, w, h) {
    fill(ctx, "#f4f4f2", w, h);
    ctx.fillStyle = "rgba(30, 30, 36, 0.24)";
    ctx.beginPath();
    ctx.arc(10, 10, 1.15, 0, Math.PI * 2);
    ctx.fill();
  },
};

// ---------------------------------------------------------------------------
// Art / indie / fashion
// ---------------------------------------------------------------------------

const riso: ProceduralPattern = {
  mode: "box",
  seed: 21,
  draw(ctx, w, h, rng) {
    fill(ctx, "#f6f1e7", w, h);
    ctx.globalCompositeOperation = "multiply";
    halftone(ctx, w, h, "rgba(255, 72, 176, 0.92)", 15, 9, 4.4, (x, y) =>
      Math.max(0, 0.5 + 0.5 * Math.sin(x / 170 + y / 250)),
    );
    // Second drum, slightly off register.
    halftone(
      ctx,
      w,
      h,
      "rgba(0, 120, 191, 0.88)",
      75,
      9,
      4.4,
      (x, y) => Math.max(0, 0.5 + 0.5 * Math.cos(x / 230 - y / 160 + 1.3)),
      2.5,
      1.5,
    );
    ctx.globalCompositeOperation = "source-over";
    grain(ctx, rng, 0.05);
  },
};

const gingham: ProceduralPattern = {
  mode: "tile",
  tile: 28,
  seed: 22,
  draw(ctx, w, h, rng) {
    fill(ctx, "#fbf7f1", w, h);
    ctx.fillStyle = "rgba(201, 34, 50, 0.48)";
    ctx.fillRect(0, 0, w / 2, h);
    ctx.fillRect(0, 0, w, h / 2);
    grain(ctx, rng, 0.03);
  },
};

const houndstooth: ProceduralPattern = {
  mode: "tile",
  tile: 24,
  seed: 23,
  draw(ctx) {
    const d = "#1b1a19";
    const l = "#efe7d6";
    twill(ctx, [d, d, d, d, l, l, l, l], 3);
  },
};

const TARTAN_SETT = sett(
  [
    ["#b3202a", 18],
    ["#141414", 4],
    ["#b3202a", 4],
    ["#1f4d34", 10],
    ["#141414", 2],
    ["#1a2440", 10],
    ["#e2b33a", 2],
  ],
  true,
);

const tartan: ProceduralPattern = {
  mode: "tile",
  tile: TARTAN_SETT.length * 2,
  seed: 24,
  draw(ctx) {
    twill(ctx, TARTAN_SETT, 2);
  },
};

const breton: ProceduralPattern = {
  mode: "tile",
  tile: 20,
  seed: 25,
  draw(ctx, w, h) {
    fill(ctx, "#f7f5ef", w, h);
    ctx.fillStyle = "#1d2a4d";
    ctx.fillRect(0, 13, w, 7);
  },
};

const bauhaus: ProceduralPattern = {
  mode: "box",
  seed: 26,
  draw(ctx, w, h, rng) {
    const m = Math.min(w, h);
    fill(ctx, "#efe8d8", w, h);
    const circle = (x: number, y: number, r: number, c: string, a0 = 0, a1 = Math.PI * 2) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r, a0, a1);
      ctx.closePath();
      ctx.fill();
    };
    circle(0, 0, m * 0.34, "#d63a2a");
    circle(w, h, m * 0.4, "#1f4fa3");
    circle(0, h * 0.64, m * 0.13, "#1f4fa3", -Math.PI / 2, Math.PI / 2);
    circle(w * 0.84, m * 0.075, m * 0.04, "#151515");
    ctx.fillStyle = "#f2b630";
    ctx.fillRect(w - m * 0.13, h * 0.16, m * 0.13, h * 0.3);
    ctx.fillStyle = "#151515";
    ctx.fillRect(w * 0.1, h - m * 0.055, w * 0.32, m * 0.055);
    ctx.strokeStyle = "#151515";
    ctx.lineWidth = Math.max(2, m * 0.008);
    ctx.beginPath();
    ctx.moveTo(w * 0.56, 0);
    ctx.lineTo(w, h * 0.36);
    ctx.stroke();
    grain(ctx, rng, 0.025);
  },
};

const memphis: ProceduralPattern = {
  mode: "box",
  seed: 27,
  draw(ctx, w, h, rng) {
    fill(ctx, "#bfe8da", w, h);
    const ink = "#1b1b1b";
    const colors = ["#ff6f91", "#ffd23f", "#4d7cfe", "#ffffff"];
    const cell = 84;
    for (let gy = 0; gy < h + cell; gy += cell) {
      for (let gx = 0; gx < w + cell; gx += cell) {
        const x = gx + rng() * cell * 0.7;
        const y = gy + rng() * cell * 0.7;
        const s = 14 + rng() * 18;
        const c = colors[Math.floor(rng() * colors.length)];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rng() * Math.PI * 2);
        const kind = Math.floor(rng() * 5);
        if (kind === 0) {
          // Squiggle
          ctx.strokeStyle = ink;
          ctx.lineWidth = 3;
          ctx.lineJoin = "round";
          ctx.beginPath();
          for (let i = 0; i <= 6; i++) ctx.lineTo(i * s * 0.32 - s, (i % 2 ? -1 : 1) * s * 0.22);
          ctx.stroke();
        } else if (kind === 1) {
          ctx.fillStyle = c;
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(0, -s * 0.6);
          ctx.lineTo(s * 0.55, s * 0.4);
          ctx.lineTo(-s * 0.55, s * 0.4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (kind === 2) {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(0, 0, s * 0.32, 0, Math.PI * 2);
          ctx.fill();
        } else if (kind === 3) {
          ctx.fillStyle = c === "#ffffff" ? "#4d7cfe" : c;
          ctx.fillRect(-s * 0.5, -3, s, 6);
        } else {
          ctx.fillStyle = ink;
          for (let i = 0; i < 3; i++)
            for (let j = 0; j < 3; j++) {
              ctx.beginPath();
              ctx.arc(i * 7 - 7, j * 7 - 7, 1.6, 0, Math.PI * 2);
              ctx.fill();
            }
        }
        ctx.restore();
      }
    }
  },
};

const aura: ProceduralPattern = {
  mode: "box",
  seed: 28,
  draw(ctx, w, h, rng) {
    const m = Math.max(w, h);
    fill(ctx, "#ebe7f3", w, h);
    const blob = (x: number, y: number, r: number, rgb: string, a: number) =>
      radial(
        ctx,
        x,
        y,
        r,
        [
          [0, `rgba(${rgb}, ${a})`],
          [1, `rgba(${rgb}, 0)`],
        ],
        w,
        h,
      );
    blob(w * 0.18, h * 0.22, m * 0.62, "190, 150, 255", 0.95);
    blob(w * 0.88, h * 0.82, m * 0.55, "214, 255, 96", 0.9);
    blob(w * 0.92, h * 0.08, m * 0.42, "255, 170, 214", 0.8);
    blob(w * 0.06, h * 0.95, m * 0.4, "150, 205, 255", 0.85);
    blob(w * 0.5, h * 0.5, m * 0.35, "255, 255, 255", 0.7);
    grain(ctx, rng, 0.022);
  },
};

const klein: ProceduralPattern = {
  mode: "tile",
  tile: 256,
  seed: 29,
  draw(ctx, w, h, rng) {
    fill(ctx, "#002fa7", w, h);
    // Pigment: a few loose bright specks over fine grain.
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(70, 110, 255, ${0.25 + rng() * 0.35})`;
      ctx.fillRect(rng() * w, rng() * h, 1, 1);
    }
    grain(ctx, rng, 0.055);
  },
};

const terrazzo: ProceduralPattern = {
  mode: "tile",
  tile: 360,
  seed: 30,
  draw(ctx, w, h, rng) {
    fill(ctx, "#ede4d6", w, h);
    const palette = ["#c8613f", "#c8613f", "#8fa58a", "#8fa58a", "#262422", "#d9a441", "#fbf8f2"];
    for (let i = 0; i < 80; i++) {
      const cx = rng() * w;
      const cy = rng() * h;
      const r = 3 + rng() * rng() * 13;
      const sides = 5 + Math.floor(rng() * 3);
      const rot = rng() * Math.PI;
      const pts: Array<[number, number]> = [];
      for (let k = 0; k < sides; k++) {
        const a = rot + (k / sides) * Math.PI * 2;
        const rr = r * (0.6 + rng() * 0.5);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
      // Draw the 3×3 wrap copies so chips crossing an edge stay seamless.
      for (const ox of [-w, 0, w])
        for (const oy of [-h, 0, h]) {
          ctx.beginPath();
          pts.forEach(([px, py], k) =>
            k ? ctx.lineTo(cx + ox + px, cy + oy + py) : ctx.moveTo(cx + ox + px, cy + oy + py),
          );
          ctx.closePath();
          ctx.fill();
        }
    }
    grain(ctx, rng, 0.02);
  },
};

const opart: ProceduralPattern = {
  mode: "box",
  seed: 31,
  draw(ctx, w, h) {
    fill(ctx, "#f5f4f0", w, h);
    ctx.fillStyle = "#141414";
    const pitch = 12;
    const period = 220;
    const step = 4;
    for (let y0 = -40; y0 < h + 40; y0 += pitch) {
      const amp = 10 + 12 * Math.sin((y0 / h) * Math.PI);
      const phase = y0 * 0.018;
      const wave = (x: number) => y0 + amp * Math.sin((2 * Math.PI * x) / period + phase);
      const thick = (x: number) => 2.5 + 4.5 * (0.5 + 0.5 * Math.cos((Math.PI * x) / period));
      ctx.beginPath();
      ctx.moveTo(0, wave(0));
      for (let x = step; x <= w + step; x += step) ctx.lineTo(x, wave(x));
      for (let x = w + step; x >= 0; x -= step) ctx.lineTo(x, wave(x) + thick(x));
      ctx.closePath();
      ctx.fill();
    }
  },
};

const xerox: ProceduralPattern = {
  mode: "box",
  seed: 32,
  draw(ctx, w, h, rng) {
    fill(ctx, "#d9d8d4", w, h);
    // Drum streaks.
    const streaks = 6 + Math.floor(rng() * 5);
    for (let i = 0; i < streaks; i++) {
      ctx.fillStyle = `rgba(20, 20, 20, ${0.04 + rng() * 0.08})`;
      ctx.fillRect(rng() * w, 0, 1 + rng() * 3, h);
    }
    // Toner specks.
    const specks = Math.floor((w * h) / 700);
    for (let i = 0; i < specks; i++) {
      ctx.fillStyle = `rgba(12, 12, 12, ${0.45 + rng() * 0.5})`;
      const r = 0.4 + rng() * rng() * 1.6;
      ctx.beginPath();
      ctx.arc(rng() * w, rng() * h, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Edge falloff from an uneven platen.
    radial(
      ctx,
      w / 2,
      h / 2,
      Math.hypot(w, h) / 2,
      [
        [0.55, "rgba(0, 0, 0, 0)"],
        [1, "rgba(0, 0, 0, 0.32)"],
      ],
      w,
      h,
    );
    grain(ctx, rng, 0.09);
  },
};

export const PATTERNS = {
  paper,
  ink,
  fog,
  sand,
  hairline,
  dotgrid,
  riso,
  gingham,
  houndstooth,
  tartan,
  breton,
  bauhaus,
  memphis,
  aura,
  klein,
  terrazzo,
  opart,
  xerox,
} satisfies Record<string, ProceduralPattern>;

export type PatternId = keyof typeof PATTERNS;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Box-mode canvases are capped here and upscaled by Konva past it. */
export const MAX_BOX_CANVAS = 2048;

export type RenderedPattern = {
  canvas: HTMLCanvasElement;
  repeat: "repeat" | "no-repeat";
  /** Konva `fillPatternScale` (uniform). */
  scale: number;
};

/**
 * Render a pattern for a backdrop box of `boxW × boxH` image pixels. `unit`
 * is design-units → image-pixels (see file header). `make` creates a canvas;
 * injectable for tests.
 */
export function renderPattern(
  p: ProceduralPattern,
  boxW: number,
  boxH: number,
  unit: number,
  make: (w: number, h: number) => HTMLCanvasElement = defaultCanvas,
): RenderedPattern {
  const u = Number.isFinite(unit) && unit > 0 ? unit : 1;
  if (p.mode === "tile") {
    const size = Math.max(1, Math.round(p.tile * u));
    const canvas = make(size, size);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(size / p.tile, size / p.tile);
    p.draw(ctx, p.tile, p.tile, mulberry32(p.seed));
    return { canvas, repeat: "repeat", scale: 1 };
  }
  const bw = Math.max(1, boxW);
  const bh = Math.max(1, boxH);
  const k = Math.min(1, MAX_BOX_CANVAS / Math.max(bw, bh));
  const canvas = make(Math.max(1, Math.ceil(bw * k)), Math.max(1, Math.ceil(bh * k)));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(k * u, k * u);
  p.draw(ctx, bw / u, bh / u, mulberry32(p.seed));
  return { canvas, repeat: "no-repeat", scale: 1 / k };
}

/**
 * Paint a pattern into an existing canvas of `w × h` device pixels, e.g. a
 * picker swatch. Tiles are repeated; box compositions are drawn to fit.
 */
export function paintSwatch(
  p: ProceduralPattern,
  ctx: Ctx,
  w: number,
  h: number,
  unit: number,
  make: (w: number, h: number) => HTMLCanvasElement = defaultCanvas,
) {
  if (p.mode === "tile") {
    const r = renderPattern(p, w, h, unit, make);
    const pat = ctx.createPattern(r.canvas, "repeat");
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w, h);
    }
    return;
  }
  ctx.save();
  ctx.scale(unit, unit);
  p.draw(ctx, w / unit, h / unit, mulberry32(p.seed));
  ctx.restore();
}

function defaultCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
