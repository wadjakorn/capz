"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useEditor, type Tool } from "@/stores/editor";
import {
  zoomAtViewportCenter,
  zoomToFit,
  zoomTo100,
} from "@/lib/zoom";

const ESC_HIDE_WINDOW_MS = 2000;
const ESC_TOAST_ID = "editor-esc-hide-arm";

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  a: "arrow",
  r: "rect",
  t: "text",
  b: "blur",
  s: "sticker",
  p: "pin",
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export function useEditorShortcuts() {
  const setTool = useEditor((s) => s.setTool);
  const select = useEditor((s) => s.select);
  const remove = useEditor((s) => s.remove);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const escArmedAt = useRef<number>(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      if (mod && (key === "=" || key === "+")) {
        e.preventDefault();
        zoomAtViewportCenter(1.2);
        return;
      }
      if (mod && key === "-") {
        e.preventDefault();
        zoomAtViewportCenter(1 / 1.2);
        return;
      }
      if (mod && key === "0") {
        e.preventDefault();
        zoomToFit();
        return;
      }
      if (mod && key === "1") {
        e.preventDefault();
        zoomTo100();
        return;
      }

      if (mod) return;

      if (key === "escape") {
        e.preventDefault();
        const { selectedId } = useEditor.getState();
        if (selectedId) {
          escArmedAt.current = 0;
          toast.dismiss(ESC_TOAST_ID);
          select(null);
          return;
        }
        // No selection → double-Esc hides window.
        const now = Date.now();
        if (escArmedAt.current && now - escArmedAt.current <= ESC_HIDE_WINDOW_MS) {
          escArmedAt.current = 0;
          toast.dismiss(ESC_TOAST_ID);
          void (async () => {
            const { runPreCloseAction } = await import("@/lib/preClose");
            await runPreCloseAction();
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().hide();
          })();
          return;
        }
        escArmedAt.current = now;
        toast("Press Esc again to hide editor", {
          id: ESC_TOAST_ID,
          duration: ESC_HIDE_WINDOW_MS,
        });
        return;
      }

      if (key === "delete" || key === "backspace") {
        const id = useEditor.getState().selectedId;
        if (id) {
          e.preventDefault();
          remove(id);
        }
        return;
      }

      const t = TOOL_KEYS[key];
      if (t) {
        e.preventDefault();
        setTool(t);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTool, select, remove, undo, redo]);
}
