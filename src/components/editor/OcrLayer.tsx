"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { useOcr, currentResult, visibleLines, type OcrScope } from "@/stores/ocr";
import { useT } from "@/i18n/useT";
import { ocrBoxStyle, computeFitScaleX, type OcrBox } from "@/lib/ocr";
import { isScopeTooSmall, pointInRect, rectFromPoints } from "@/lib/ocrScope";
import { shortcutKey } from "@/lib/shortcutKey";

const FONT_STACK = '"Noto Sans Thai", system-ui, -apple-system, sans-serif';
// Font size (image-pixel space) for measurement & rendering, as a fraction of
// line-box height so glyphs sit within the box before horizontal fit.
const FONT_FACTOR = 0.8;
// A press becomes a box drag once it travels this far (screen px).
const DRAG_THRESHOLD_PX = 4;
const SCOPE_BORDER = "1.5px dashed #6d7cff";

// Shared offscreen text measurer. Returns 0 when canvas/text metrics are
// unavailable (SSR / jsdom) so computeFitScaleX falls back to no-stretch.
let measureCanvas: HTMLCanvasElement | null = null;
function measureText(text: string, fontPx: number): number {
  if (typeof document === "undefined") return 0;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = `${fontPx}px ${FONT_STACK}`;
  return ctx.measureText(text).width;
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

type Point = { x: number; y: number };
type Drag = { start: Point; cx: number; cy: number; dragging: boolean };

/**
 * Visible OCR text overlay — one solid-white chip PER LINE, aligned to the
 * Konva image. Mounted as a sibling of <Stage> in the same positioned wrapper,
 * so an image-space box maps to screen by `* scale` (displayScale). Each line's
 * text is rendered near-black and horizontally scaled to fill its line box, so
 * native selection highlights what the user sees. ⌘/Ctrl+A selects the whole
 * overlay. Pure DOM — never appears in exported PNGs.
 *
 * CP-0099: dragging a box keeps only the words whose centre is inside it
 * (the store's `scope`), dims the rest of the image and pre-selects the kept
 * text, so ⌘A → ⌘C copies just that area. Double/triple-click stay native.
 */
export function OcrLayer({
  scale,
  originPxX = 0,
  originPxY = 0,
}: {
  scale: number;
  // Screen-px offset of image coord (0,0) from the wrapper's top-left. Non-zero
  // when the canvas expands past the image's top/left edge (element overflow).
  originPxX?: number;
  originPxY?: number;
}) {
  const mode = useOcr((s) => s.mode);
  const result = useOcr(currentResult);
  const shown = useOcr(visibleLines);
  const scope = useOcr((s) => s.scope);
  const layerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const endDragRef = useRef<() => void>(() => {});
  const [draft, setDraft] = useState<OcrBox | null>(null);
  const { t } = useT();
  // CP-0100: the text auto-selected for the current box, and whether the
  // selection still equals it when re-scanned lines arrive for that box.
  const autoTextRef = useRef<string | null>(null);
  const reselectRef = useRef(false);

  // One unit per non-empty line (line box + full line text), fitted once per
  // line set (image-space → zoom-invariant fitX).
  const lines = useMemo(() => {
    if (!shown) return [];
    return shown
      .map((line, li) => {
        const fontPxImg = line.bbox.h * FONT_FACTOR;
        return {
          key: String(li),
          text: line.text,
          bbox: line.bbox,
          fontPxImg,
          fitX: computeFitScaleX(line.text, fontPxImg, line.bbox.w, measureText),
        };
      })
      .filter((l) => l.text.length > 0);
  }, [shown]);

  // Select every chip — not the box/dim decorations after them.
  const selectLayer = useCallback(() => {
    const layer = layerRef.current;
    const sel = window.getSelection();
    if (!layer || !sel) return;
    const range = document.createRange();
    range.selectNodeContents(layer);
    const deco = layer.querySelector(":scope > [data-ocr-deco]");
    if (deco) range.setEndBefore(deco);
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  // Re-scanned lines replace a box's lines (CP-0100). Decide now, before React
  // re-renders the chips and the old selection's text nodes change, whether
  // the selection is still the automatic one; only then is it re-selected.
  useEffect(
    () =>
      useOcr.subscribe((s, prev) => {
        if (s.scope && prev.scope && s.scope !== prev.scope && s.scope.rect === prev.scope.rect) {
          const now = window.getSelection()?.toString() ?? "";
          reselectRef.current = autoTextRef.current !== null && now === autoTextRef.current;
        }
      }),
    [],
  );

  // A new scope arrives with its text already selected: ⌘C copies it at once.
  // Re-scanned lines for the same box are selected only if the user hasn't
  // made a selection of their own meanwhile.
  const prevScopeRef = useRef<OcrScope | null>(null);
  useEffect(() => {
    const prev = prevScopeRef.current;
    prevScopeRef.current = scope;
    if (!scope) {
      autoTextRef.current = null;
      return;
    }
    const refined = prev !== null && prev.rect === scope.rect;
    if (refined && !reselectRef.current) return;
    reselectRef.current = false;
    if (scope.lines.length === 0) {
      autoTextRef.current = ""; // nothing to select yet; a re-scan may fill it
      return;
    }
    selectLayer();
    autoTextRef.current = window.getSelection()?.toString() ?? null;
  }, [scope, selectLayer]);

  // ⌘/Ctrl+A selects the entire overlay, scoped to the OCR text. The selection,
  // highlight, and ⌘C copy that follow are all native OS behavior. Capture phase
  // so it pre-empts any other Cmd+A handling while OCR read mode is on.
  // ⌘/Ctrl+C while a scope is active never falls through to the editor's
  // whole-image copy (page.tsx), which runs whenever the selection is empty.
  useEffect(() => {
    if (!mode) return;
    function onKeyDown(e: KeyboardEvent) {
      const key = shortcutKey(e).toLowerCase();
      if (key !== "a" && key !== "c") return;
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (isTyping(e.target)) return;
      const layer = layerRef.current;
      // Settings view: the editor stays mounted, hidden — keys aren't ours.
      if (!layer || layer.closest('[aria-hidden="true"]')) return;
      if (key === "a") {
        e.preventDefault();
        selectLayer();
        return;
      }
      const { scope: active } = useOcr.getState();
      if (!active) return;
      const sel = window.getSelection();
      if (sel && sel.toString().trim().length > 0) return; // native copy
      if (active.lines.length > 0) {
        selectLayer(); // the native copy that follows sees the scope text
      } else {
        e.preventDefault(); // nothing to copy — and never the whole image
        e.stopPropagation();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mode, selectLayer]);

  // A drag in flight ends when OCR mode or the image goes away, and on unmount.
  useEffect(() => () => endDragRef.current(), [mode, result]);

  function toImage(ev: { clientX: number; clientY: number }): Point | null {
    const layer = layerRef.current;
    const r = currentResult(useOcr.getState());
    if (!layer || !r) return null;
    // Re-read every time: the canvas can scroll or zoom mid-drag.
    const b = layer.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return null;
    return {
      x: ((ev.clientX - b.left) * r.width) / b.width,
      y: ((ev.clientY - b.top) * r.height) / b.height,
    };
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    // Right-click, macOS ctrl-click (a right-click) and double/triple-click
    // stay native: context menu, word and line selection.
    if (e.button !== 0 || e.ctrlKey || e.detail > 1) return;
    const start = toImage(e);
    if (!start) return;
    // Text selection is mousedown's default action — the box replaces it.
    e.preventDefault();
    // A focused field would otherwise receive the ⌘A / ⌘C that follow.
    if (isTyping(document.activeElement)) (document.activeElement as HTMLElement).blur();
    endDragRef.current();
    const drag: Drag = { start, cx: e.clientX, cy: e.clientY, dragging: false };
    dragRef.current = drag;

    const end = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", end);
      if (dragRef.current === drag) dragRef.current = null;
      endDragRef.current = () => {};
      setDraft(null);
    };
    const finish = (ev: MouseEvent) => {
      end();
      const r = currentResult(useOcr.getState());
      const p = toImage(ev);
      if (drag.dragging && r && p) {
        const rect = rectFromPoints(drag.start, p, r.width, r.height);
        if (!isScopeTooSmall(rect)) {
          useOcr.getState().setScope(rect);
          return;
        }
      }
      // A click: clear the selection as a native click would; outside the
      // box it also returns to the whole-image text.
      window.getSelection()?.removeAllRanges();
      const { scope: active, clearScope } = useOcr.getState();
      if (active && !pointInRect(drag.start, active.rect)) clearScope();
    };
    function onMove(ev: MouseEvent) {
      // The mouseup went elsewhere (app switch, native menu): this is the release.
      if ((ev.buttons & 1) === 0) {
        finish(ev);
        return;
      }
      if (!drag.dragging) {
        if (Math.hypot(ev.clientX - drag.cx, ev.clientY - drag.cy) < DRAG_THRESHOLD_PX) return;
        drag.dragging = true;
        window.getSelection()?.removeAllRanges();
      }
      const r = currentResult(useOcr.getState());
      const p = toImage(ev);
      if (r && p) setDraft(rectFromPoints(drag.start, p, r.width, r.height));
    }
    function onUp(ev: MouseEvent) {
      if (ev.button === 0) finish(ev);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("blur", end); // cancel: nothing applied
    endDragRef.current = end;
  }

  if (!mode || !result) return null;

  const boxStyle = (r: OcrBox): React.CSSProperties => ({
    position: "absolute",
    left: r.x * scale,
    top: r.y * scale,
    width: r.w * scale,
    height: r.h * scale,
    boxSizing: "border-box",
    border: SCOPE_BORDER,
    pointerEvents: "none",
  });

  return (
    <div
      ref={layerRef}
      data-ocr-layer
      className="absolute select-text"
      onMouseDown={onMouseDown}
      style={{
        left: originPxX,
        top: originPxY,
        width: result.width * scale,
        height: result.height * scale,
        cursor: "crosshair",
        overflow: "hidden", // clips the scope's dimming to the image
        zIndex: 5,
      }}
    >
      {lines.map((l) => {
        const s = ocrBoxStyle(l.bbox, scale);
        return (
          <span
            key={l.key}
            style={{
              position: "absolute",
              left: s.left,
              top: s.top,
              width: s.width,
              height: s.height,
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              background: "#ffffff",
              borderRadius: 2,
              userSelect: "text",
            }}
          >
            <span
              style={{
                display: "inline-block",
                color: "#0b0b0b",
                fontFamily: FONT_STACK,
                fontSize: l.fontPxImg * scale,
                lineHeight: 1,
                whiteSpace: "pre",
                transform: `scaleX(${l.fitX})`,
                transformOrigin: "left center",
              }}
            >
              {l.text}
              {"\n"}
            </span>
          </span>
        );
      })}
      {/* Decorations come after the chips, so selectLayer can stop before
          them. The scope paints below the chips (z-index -1 inside the layer's
          stacking context) so a kept chip poking past the box edge is never
          dimmed; the draft outline paints on top while dragging. */}
      {scope && !draft && (
        <div
          data-ocr-deco
          data-ocr-scope
          aria-hidden
          style={{
            ...boxStyle(scope.rect),
            zIndex: -1,
            boxShadow: "0 0 0 100000px rgba(0, 0, 0, 0.35)",
          }}
        />
      )}
      {scope && !draft && scope.rescan === "scanning" && (
        <div
          data-ocr-deco
          data-ocr-scope-busy
          role="status"
          aria-label={t("app.ocr.scopeScanning")}
          title={t("app.ocr.scopeScanning")}
          className="motion-safe:animate-spin"
          style={{
            position: "absolute",
            left: (scope.rect.x + scope.rect.w) * scale - 20,
            top: scope.rect.y * scale + 6,
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: "2px solid rgba(109, 124, 255, 0.35)",
            borderTopColor: "#6d7cff",
            boxSizing: "border-box",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}
      {draft && (
        <div data-ocr-deco data-ocr-scope-draft aria-hidden style={boxStyle(draft)} />
      )}
    </div>
  );
}
