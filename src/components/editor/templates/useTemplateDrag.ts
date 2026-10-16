import { useCallback, useEffect, useRef } from "react";

import {
  ACTIVE,
  applyTemplateTo,
  prepareApply,
  showApplyToast,
} from "@/lib/applyTemplateTo";
import type { EditTemplate } from "@/lib/template";
import { useEditor } from "@/stores/editor";
import { useTemplateDrag as useDragStore } from "@/stores/templateDrag";
import { useWorkspaces } from "@/stores/workspaces";
import { t } from "@/i18n/store";
import { defaultSelection, itemsFromTemplate } from "./pickerItems";

const DRAG_THRESHOLD_PX = 4;
const NO_DRAG_SELECTOR =
  'button, input, textarea, select, label, [role="dialog"], [contenteditable]';

export type DropTarget = { kind: "canvas" } | { kind: "tile"; id: string } | null;

/** Tile wins over canvas: tiles live outside the canvas, but be explicit. */
export function resolveDropTarget(
  el: Element | null,
  overCanvas: boolean,
  tileHasImage: (id: string) => boolean,
): DropTarget {
  const id = el?.closest("[data-ws-tile]")?.getAttribute("data-ws-tile");
  if (id) return tileHasImage(id) ? { kind: "tile", id } : null;
  return overCanvas ? { kind: "canvas" } : null;
}

function tileHasImage(id: string): boolean {
  const ws = useWorkspaces.getState();
  if (id === ws.activeId) return useEditor.getState().hasImage;
  return !!ws.docs[id]?.image;
}

function locate(x: number, y: number): DropTarget {
  const r = document.getElementById("canvas-area")?.getBoundingClientRect();
  const over = !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  return resolveDropTarget(
    document.elementFromPoint(x, y),
    over && useEditor.getState().hasImage,
    tileHasImage,
  );
}

/**
 * Press-and-drag a template card onto the canvas or a workspace tile. Mirrors
 * History's pointer drag (not HTML5 DnD: Tauri's dragDropEnabled swallows it).
 */
export function useTemplateDrag(tpl: EditTemplate): {
  onPointerDown: (e: React.PointerEvent) => void;
} {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as Element;
      // React events bubble through portals (the Apply popover renders inside
      // the card's JSX); a portaled DOM node is not contained by the card.
      if (!(e.currentTarget as Element).contains(target)) return;
      if (target.closest(NO_DRAG_SELECTOR)) return;
      if (e.button !== 0) return;
      cleanupRef.current?.();
      const sx = e.clientX;
      const sy = e.clientY;
      let live = false;
      let ghost: HTMLDivElement | null = null;
      // Started now, awaited on drop: a fast pointer-up must not wait for it.
      const prepared = prepareApply();
      prepared.catch(() => {});

      const hint = () => document.getElementById("canvas-drop-hint");

      const teardown = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        ghost?.remove();
        ghost = null;
        hint()?.setAttribute("data-on", "false");
        document.body.style.removeProperty("user-select");
        document.body.style.removeProperty("-webkit-user-select");
        useDragStore.getState().setDropTarget(null);
        cleanupRef.current = null;
      };

      function move(ev: PointerEvent) {
        if (!live) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD_PX) return;
          live = true;
          document.body.style.setProperty("user-select", "none");
          document.body.style.setProperty("-webkit-user-select", "none");
          window.getSelection()?.removeAllRanges();
          ghost = document.createElement("div");
          ghost.style.cssText =
            "position:fixed;z-index:9999;pointer-events:none;width:96px;height:60px;border-radius:8px;overflow:hidden;border:1px solid var(--accent);box-shadow:var(--elev-3);opacity:.9;background:var(--bg-canvas)";
          if (tpl.thumb) {
            const img = document.createElement("img");
            img.src = tpl.thumb;
            img.draggable = false;
            img.style.cssText = "width:100%;height:100%;object-fit:contain";
            ghost.appendChild(img);
          }
          document.body.appendChild(ghost);
          const h = hint();
          if (h && useEditor.getState().hasImage) {
            h.dataset.on = "true";
            h.dataset.mode = "template";
          }
        }
        if (ghost) {
          ghost.style.left = `${ev.clientX - 48}px`;
          ghost.style.top = `${ev.clientY - 30}px`;
        }
        const dt = locate(ev.clientX, ev.clientY);
        useDragStore.getState().setDropTarget(dt?.kind === "tile" ? dt.id : null);
      }

      function cancel() {
        teardown();
      }

      function up(ev: PointerEvent) {
        const wasLive = live;
        const dt = wasLive ? locate(ev.clientX, ev.clientY) : null;
        teardown();
        if (!dt) return;
        void prepared.then((cfs) => {
          const ws = useWorkspaces.getState();
          const target = dt.kind === "canvas" ? (ws.activeId ?? ACTIVE) : dt.id;
          // State may have moved while sizes decoded.
          if (dt.kind === "canvas" && !useEditor.getState().hasImage) return;
          if (dt.kind === "tile" && !tileHasImage(dt.id)) return;
          const summary = applyTemplateTo(
            [target],
            tpl,
            defaultSelection(itemsFromTemplate(tpl)),
            cfs,
          );
          showApplyToast(summary, t);
          if (dt.kind === "tile") useDragStore.getState().flash(dt.id);
        });
      }

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      cleanupRef.current = teardown;
    },
    [tpl],
  );

  return { onPointerDown };
}
