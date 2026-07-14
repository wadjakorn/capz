import { clampZoom, useEditor } from "@/stores/editor";
import {
  getScrollContainer,
  getStage,
  getStageImageSize,
} from "@/lib/stageBridge";

/**
 * Zoom-slider range. Narrower than the internal clamp (ZOOM_MIN..ZOOM_MAX) —
 * the slider covers the practical 10%..1600% band; smaller/larger zooms are
 * still reachable via +/- and pin the thumb to an end.
 */
export const SLIDER_SCALE_MIN = 0.1;
export const SLIDER_SCALE_MAX = 16;
const LN_MIN = Math.log(SLIDER_SCALE_MIN);
const LN_MAX = Math.log(SLIDER_SCALE_MAX);

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Map a display scale to a slider position in [0,1] on a log axis. */
export function scaleToSlider(scale: number): number {
  const s = Math.min(SLIDER_SCALE_MAX, Math.max(SLIDER_SCALE_MIN, scale));
  return clamp01((Math.log(s) - LN_MIN) / (LN_MAX - LN_MIN));
}

/** Inverse of {@link scaleToSlider}: slider position in [0,1] → display scale. */
export function sliderToScale(t: number): number {
  return Math.exp(LN_MIN + clamp01(t) * (LN_MAX - LN_MIN));
}

/** Track position (0..1) of the 100% landmark tick. */
export const SLIDER_TICK_100 = scaleToSlider(1);

/**
 * Zoom around a screen-space anchor (clientX/clientY in viewport coords). After
 * applying the new scale, adjusts scroll so the image pixel that was under the
 * anchor stays there.
 */
export function zoomAtClient(factor: number, clientX: number, clientY: number) {
  const el = getScrollContainer();
  const stage = getStage();
  if (!el || !stage) return;
  const oldScale = useEditor.getState().displayScale || 1;
  const newScale = clampZoom(oldScale * factor);
  if (newScale === oldScale) return;
  const r0 = stage.container().getBoundingClientRect();
  const imgX = (clientX - r0.left) / oldScale;
  const imgY = (clientY - r0.top) / oldScale;
  useEditor.getState().setDisplayScale(newScale);
  requestAnimationFrame(() => {
    const r1 = stage.container().getBoundingClientRect();
    const wantLeft = clientX - imgX * newScale;
    const wantTop = clientY - imgY * newScale;
    el.scrollLeft += r1.left - wantLeft;
    el.scrollTop += r1.top - wantTop;
  });
}

export function zoomAtViewportCenter(factor: number) {
  const el = getScrollContainer();
  if (!el) return;
  const r = el.getBoundingClientRect();
  zoomAtClient(factor, r.left + r.width / 2, r.top + r.height / 2);
}

function recenterScroll() {
  const el = getScrollContainer();
  const stage = getStage();
  if (!el || !stage) return;
  requestAnimationFrame(() => {
    const r = stage.container().getBoundingClientRect();
    const c = el.getBoundingClientRect();
    el.scrollLeft += r.left + r.width / 2 - (c.left + c.width / 2);
    el.scrollTop += r.top + r.height / 2 - (c.top + c.height / 2);
  });
}

export function zoomToFit() {
  const el = getScrollContainer();
  const size = getStageImageSize();
  if (!el || !size) return;
  useEditor.getState().zoomFit({
    vw: el.clientWidth,
    vh: el.clientHeight,
    iw: size.w,
    ih: size.h,
  });
  recenterScroll();
}

export function zoomTo100() {
  useEditor.getState().zoomReset100();
  recenterScroll();
}

/** Set absolute zoom, anchored at viewport center. */
export function setZoom(scale: number) {
  const cur = useEditor.getState().displayScale || 1;
  if (!Number.isFinite(scale) || scale <= 0) return;
  const factor = scale / cur;
  zoomAtViewportCenter(factor);
}
