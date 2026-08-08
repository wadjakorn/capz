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

export type CanvasGestures = {
  /** True while two or more contacts are driving a pinch/pan. */
  gestureActive: RefObject<boolean>;
  /**
   * Number of contacts the hook has already recorded.
   *
   * Konva's content div is a *descendant* of this container, so for any press
   * Konva dispatches its Stage `pointerdown` before the container listener
   * below runs — `gestureActive` is still false when the second finger's
   * Stage handler executes, and a guard on it alone cannot stop that handler
   * committing a pin/sticker/text annotation. But the *first* finger has
   * already been recorded by then, so "a contact is live at pointerdown time"
   * is the signal that identifies a gesture's second finger, one dispatch
   * earlier than `gestureActive` can. Stage and shape `pointerdown` handlers
   * read this to refuse a press that is really the start of a gesture.
   */
  contactCount: RefObject<number>;
};

/**
 * Two-finger pinch-zoom and pan on the canvas container.
 *
 * Contacts are tracked with pointer events, the same input model the Konva
 * handlers use. One extra `touchmove` listener exists solely to stop Konva's
 * drag module: it binds `DD._drag` to `window` in the bubble phase
 * (konva/lib/DragAndDrop.js:109), and preventDefault does not stop it —
 * only stopPropagation from an element earlier in the path does.
 */
export function useCanvasGestures({
  containerRef,
  stageRef,
  onGestureStart,
}: Options): CanvasGestures {
  const gestureActive = useRef(false);
  const contactCount = useRef(0);
  // Kept in a ref so the effect below never re-subscribes on re-render.
  const onGestureStartRef = useRef(onGestureStart);
  // Assigning during render is unsafe under StrictMode double-render /
  // concurrent rendering; keep the ref in sync via an effect instead.
  useEffect(() => {
    onGestureStartRef.current = onGestureStart;
  }, [onGestureStart]);

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
    let anchorFrame = 0;

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

      // No scale change — a pure two-finger drag, or a pinch already clamped at
      // ZOOM_MIN/ZOOM_MAX — means no reflow, so there is no post-reflow rect to
      // wait for: `anchoredScrollOffset` is the identity when the ratio is 1 and
      // the rect has not moved. Writing scroll here instead of a frame later
      // takes ~16ms of lag off the most common gesture. Only safe while no
      // anchor correction from an earlier scale change is still pending —
      // otherwise this write would land before it and be overwritten, breaking
      // the one-scroll-write-per-frame ordering.
      if (newScale === oldScale && anchorFrame === 0) {
        el.scrollLeft -= panDx;
        el.scrollTop -= panDy;
        return;
      }

      if (newScale !== oldScale) {
        useEditor.getState().setDisplayScale(newScale);
      }

      // The container rect moves when the scale reflows the sizer, so the
      // anchor correction has to read it after that paint.
      anchorFrame = requestAnimationFrame(() => {
        anchorFrame = 0;
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
      contactCount.current = contacts.size;
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

    // Recovery net: if a pointerup/pointercancel is ever missed on `el`
    // (mixed touch+mouse input, an odd browser cancellation, a mouse button
    // released outside the window, ...), a leaked contact would leave
    // `gestureActive` stuck `true` forever — drawing and selection would be
    // permanently dead with no user-visible symptom. A capturing window
    // listener sees pointerup/pointercancel even when some element between
    // `el` and `window` stops the event's bubble phase, since capture runs
    // top-down before that. `blur` covers the remaining case where the OS
    // switches focus away mid-touch and no pointer event fires at all — that
    // one can't identify which pointerId leaked, so it clears every contact.
    const onWindowPointerEnd = (e: PointerEvent) => {
      if (!contacts.has(e.pointerId)) return;
      contacts.delete(e.pointerId);
      apply();
    };
    const onWindowBlur = () => {
      if (contacts.size === 0) return;
      contacts.clear();
      contactCount.current = 0;
      endGesture();
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("pointerup", onWindowPointerEnd, true);
    window.addEventListener("pointercancel", onWindowPointerEnd, true);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      if (anchorFrame !== 0) cancelAnimationFrame(anchorFrame);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("pointerup", onWindowPointerEnd, true);
      window.removeEventListener("pointercancel", onWindowPointerEnd, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [containerRef, stageRef]);

  return { gestureActive, contactCount };
}
