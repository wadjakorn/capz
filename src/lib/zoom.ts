import { clampZoom, useEditor } from "@/stores/editor";
import {
  getScrollContainer,
  getStage,
  getStageImageSize,
} from "@/lib/stageBridge";

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
