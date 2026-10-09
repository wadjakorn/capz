import type { TextAnnotation } from "@/stores/editor";
import { DEFAULT_TEXT_LINE_HEIGHT, THAI_SANS_STACK } from "@/lib/config";

// One layout for a text annotation, shared by the Konva `TextShape` and the
// HTML editing overlay so the two can never drift apart (CP-0065).

export type InkMetrics = {
  ascent: number;
  descent: number;
  width: number;
  fontAscent: number;
  fontDescent: number;
};

export type InkMeasure = (
  text: string,
  fontSize: number,
  fontStyle: string,
  fontFamily: string,
) => InkMetrics;

// Shared offscreen canvas for measuring real glyph ink bounds. Konva sizes
// text by font em-box (≈ fontSize per line), which clips scripts whose marks
// stack outside the em box — e.g. Thai upper vowels + tone marks. measureText's
// actualBoundingBox ascent/descent report the true ink extent.
const _inkCanvas: HTMLCanvasElement | null =
  typeof document !== "undefined" ? document.createElement("canvas") : null;

export const measureTextInk: InkMeasure = (
  text,
  fontSize,
  fontStyle,
  fontFamily,
) => {
  const ctx = _inkCanvas?.getContext("2d");
  const lines = (text || " ").split("\n");
  if (!ctx) {
    // SSR / no canvas: fall back to em-box estimate.
    return {
      ascent: fontSize * 0.8,
      descent: fontSize * 0.2,
      width: 0,
      fontAscent: fontSize * 0.8,
      fontDescent: fontSize * 0.2,
    };
  }
  const cssStyle = fontStyle && fontStyle !== "normal" ? `${fontStyle} ` : "";
  ctx.font = `${cssStyle}${fontSize}px ${fontFamily}`;
  let ascent = 0;
  let descent = 0;
  let width = 0;
  let fontAscent = 0;
  let fontDescent = 0;
  for (const ln of lines) {
    const m = ctx.measureText(ln || " ");
    ascent = Math.max(ascent, m.actualBoundingBoxAscent || fontSize * 0.8);
    descent = Math.max(descent, m.actualBoundingBoxDescent || fontSize * 0.2);
    width = Math.max(width, m.width);
    // Font-global metrics — Konva positions its alphabetic baseline from these.
    fontAscent = Math.max(fontAscent, m.fontBoundingBoxAscent || fontSize * 0.8);
    fontDescent = Math.max(
      fontDescent,
      m.fontBoundingBoxDescent || fontSize * 0.2,
    );
  }
  return { ascent, descent, width, fontAscent, fontDescent };
};

export type TextBoxLayout = {
  bg: string | null;
  padX: number;
  padY: number;
  innerW: number;
  innerH: number;
  w: number;
  h: number;
  cornerRadius: number;
  fontStyle: string;
  fontFamily: string;
  textDecoration: string;
  align: "left" | "center" | "right";
  lineHeight: number;
};

export function textBoxLayout(
  a: TextAnnotation,
  measure: InkMeasure = measureTextInk,
): TextBoxLayout {
  const bg = a.backgroundColor ?? null;
  // User-adjustable horizontal padding (px); vertical derived to keep the label
  // shape balanced. Falls back to a roomy default for pre-existing annotations.
  const padX = bg ? Math.max(0, a.bgPadding ?? 14) : 0;
  const padY = bg ? Math.round(padX * 0.66) : 0;
  const fontStyle = a.fontStyle ?? "normal";
  const textDecoration = a.textDecoration ?? "";
  const fontFamily = a.fontFamily ?? THAI_SANS_STACK;
  const align = a.align ?? "left";
  const lineHeight = a.lineHeight ?? DEFAULT_TEXT_LINE_HEIGHT;

  // Size the content box to Konva's own line-box height (lines × lineHeight ×
  // fontSize) — the Text node's intrinsic height. Matching it means the
  // background Rect, the Text node, and the selection/transformer all coincide
  // at any lineHeight, so the transformer hugs the visible background + padding.
  // (An ink-tight height made the transformer overshoot by the line leading; a
  // smaller explicit height on <Text> would make Konva truncate overflow lines.)
  // Width still comes from real glyph ink (max advance across lines) so it hugs
  // tall/stacked scripts like Thai and drives per-line alignment.
  const ink = measure(a.text, a.fontSize, fontStyle, fontFamily);
  const lines = (a.text || " ").split("\n").length;
  const innerW = Math.ceil(ink.width);
  const innerH = Math.ceil(lines * a.fontSize * lineHeight);
  const w = innerW + padX * 2;
  const h = innerH + padY * 2;
  const cornerRadius = bg
    ? Math.min(22, Math.max(6, Math.round(Math.min(w, h) * 0.18)))
    : 0;
  return {
    bg,
    padX,
    padY,
    innerW,
    innerH,
    w,
    h,
    cornerRadius,
    fontStyle,
    fontFamily,
    textDecoration,
    align,
    lineHeight,
  };
}

// A textarea exactly as wide as its text scrolls by a pixel when the caret
// sits at the end; widen it by this much and shift it so glyphs stay put.
export const CARET_SLACK = 2;

export type TextEditorOverlay = {
  box: { w: number; h: number; radius: number };
  text: {
    left: number;
    top: number;
    width: number;
    height: number;
    fontSize: number;
  };
};

// Maps a text layout (image px) to the editing overlay's CSS numbers (screen
// px) at the given stage scale. No minimums: at tiny zoom the overlay is tiny,
// like the committed result.
export function textEditorOverlay(
  l: TextBoxLayout,
  fontSize: number,
  scale: number,
): TextEditorOverlay {
  const shift =
    l.align === "center" ? CARET_SLACK / 2 : l.align === "right" ? CARET_SLACK : 0;
  return {
    box: { w: l.w * scale, h: l.h * scale, radius: l.cornerRadius * scale },
    text: {
      left: l.padX * scale - shift,
      top: l.padY * scale,
      width: l.innerW * scale + CARET_SLACK,
      height: l.innerH * scale,
      fontSize: fontSize * scale,
    },
  };
}
