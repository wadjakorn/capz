"use client";

import { useEffect, useRef, type RefObject } from "react";
import type Konva from "konva";
import { useEditor, clampZoom } from "@/stores/editor";
import { anchoredScrollOffset } from "@/lib/zoomAnchor";
import {
  initialGestureState,
  stepGesture,
  type Contact,
  type GestureState,
} from "@/lib/touchGestures";

type Options = {
  containerRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<Konva.Stage | null>;
  /** Called once when one contact becomes two: drop any in-progress draw. */
  onGestureStart: () => void;
};

/**
 * Two-finger pinch-zoom and pan on the canvas container.
 *
 * Contacts are tracked with pointer events, the same input model the Konva
 * handlers use. One extra `touchmove` listener exists solely to stop Konva's
 * drag module: it binds `DD._drag` to `window` in the bubble phase
 * (konva/lib/DragAndDrop.js:109), and preventDefault does not stop it —
 * only stopPropagation from an element earlier in the path does.
 *
 * Returns the `gestureActive` ref, which the Stage handlers read to bail out
 * while two fingers are down.
 */
export function useCanvasGestures({
  containerRef,
  stageRef,
  onGestureStart,
}: Options): RefObject<boolean> {
  const gestureActive = useRef(false);
  // Kept in a ref so the effect below never re-subscribes on re-render.
  const onGestureStartRef = useRef(onGestureStart);
  onGestureStartRef.current = onGestureStart;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const contacts = new Map<number, Contact>();
    let state: GestureState = initialGestureState();

    // Accumulated between frames; flushed once per rAF so a burst of
    // pointermove events produces exactly one scale change and one scroll
    // write, in a known order.
    let pendingZoom = 1;
    let pendingPanX = 0;
    let pendingPanY = 0;
    let pendingMidX = 0;
    let pendingMidY = 0;
    let frame = 0;

    const flush = () => {
      frame = 0;
      const stage = stageRef.current;
      if (!el || !stage) return;

      const zoomFactor = pendingZoom;
      const panDx = pendingPanX;
      const panDy = pendingPanY;
      const anchorX = pendingMidX;
      const anchorY = pendingMidY;
      pendingZoom = 1;
      pendingPanX = 0;
      pendingPanY = 0;

      const oldScale = useEditor.getState().displayScale || 1;
      const newScale = clampZoom(oldScale * zoomFactor);
      const r0 = stage.container().getBoundingClientRect();

      if (newScale !== oldScale) {
        useEditor.getState().setDisplayScale(newScale);
      }

      // The container rect moves when the scale reflows the sizer, so the
      // anchor correction has to read it after that paint.
      requestAnimationFrame(() => {
        const r1 = stage.container().getBoundingClientRect();
        el.scrollLeft =
          anchoredScrollOffset(
            el.scrollLeft,
            anchorX,
            r0.left,
            r1.left,
            oldScale,
            newScale,
          ) - panDx;
        el.scrollTop =
          anchoredScrollOffset(
            el.scrollTop,
            anchorY,
            r0.top,
            r1.top,
            oldScale,
            newScale,
          ) - panDy;
      });
    };

    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(flush);
    };

    const endGesture = () => {
      gestureActive.current = false;
      state = initialGestureState();
    };

    const apply = () => {
      const out = stepGesture(state, [...contacts.values()]);
      state = out.state;
      const r = out.result;

      if (r.kind === "idle" || r.kind === "single") {
        endGesture();
        return;
      }

      if (r.kind === "cancel") {
        gestureActive.current = true;
        onGestureStartRef.current();
        // Belt and braces: stopPropagation on touchmove is the primary defence
        // against DD._drag, this drops any drag Konva already started.
        stageRef.current?.stopDrag();
        return;
      }

      gestureActive.current = true;
      pendingZoom *= r.zoomFactor;
      pendingPanX += r.panDx;
      pendingPanY += r.panDy;
      pendingMidX = r.midX;
      pendingMidY = r.midY;
      schedule();
    };

    const onPointerDown = (e: PointerEvent) => {
      contacts.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
      apply();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!contacts.has(e.pointerId)) return;
      contacts.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
      apply();
    };

    const onPointerUp = (e: PointerEvent) => {
      contacts.delete(e.pointerId);
      apply();
    };

    // Only reason this exists: stop Konva's window-level DD._drag mid-pinch.
    const onTouchMove = (e: TouchEvent) => {
      if (!gestureActive.current) return;
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [containerRef, stageRef]);

  return gestureActive;
}
