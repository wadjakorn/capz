"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useEditor, type Tool } from "@/stores/editor";
import {
  zoomAtViewportCenter,
  zoomToFit,
  zoomTo100,
} from "@/lib/zoom";
import { isTauriRuntime } from "@/lib/platform";
import { useSettings } from "@/stores/settings";
import { useWorkspaces } from "@/stores/workspaces";

const ESC_HIDE_WINDOW_MS = 2000;
const ESC_TOAST_ID = "editor-esc-hide-arm";

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  a: "arrow",
  r: "rect",
  t: "text",
  b: "blur",
  d: "pen",
  h: "highlighter",
  m: "magnify",
  s: "sticker",
  p: "pin",
  c: "crop",
};

/** Move `delta` workspaces along the bar, wrapping at both ends. */
function cycleWorkspace(delta: number) {
  const { order, activeId, switchTo } = useWorkspaces.getState();
  if (order.length < 2) return;
  const i = activeId ? order.indexOf(activeId) : -1;
  const next = order[(((i + delta) % order.length) + order.length) % order.length];
  if (next) switchTo(next);
}

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

      // --- workspace switching (CP-0045) -------------------------------
      // NOT Cmd+1..9: Cmd+0 / Cmd+1 are zoom-to-fit / zoom-100% below and have
      // been for far longer. Alt+digit is keyed off e.code because on macOS
      // Option+1 produces "¡", so e.key is useless here.
      if (useSettings.getState().config.workspaces.enabled) {
        if (key === "tab" && e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          cycleWorkspace(e.shiftKey ? -1 : 1);
          return;
        }
        if (e.altKey && !e.metaKey && !e.ctrlKey && /^Digit[1-9]$/.test(e.code)) {
          e.preventDefault();
          const { order, switchTo } = useWorkspaces.getState();
          const target = order[Number(e.code.slice(5)) - 1];
          if (target) switchTo(target);
          return;
        }
        if (mod && e.shiftKey && key === "n") {
          e.preventDefault();
          useWorkspaces
            .getState()
            .createEmpty(useSettings.getState().config.workspaces.max);
          return;
        }
      }

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
        // Crop mode: Esc cancels the crop and returns to Select.
        if (useEditor.getState().tool === "crop") {
          useEditor.getState().setTool("select");
          return;
        }
        const { selectedId } = useEditor.getState();
        if (selectedId) {
          escArmedAt.current = 0;
          toast.dismiss(ESC_TOAST_ID);
          select(null);
          const { tool, setTool } = useEditor.getState();
          if (tool !== "select" && tool !== "pin") setTool("select");
          return;
        }
        // No selection → double-Esc hides window (desktop only; a browser
        // tab has no window to hide).
        if (!isTauriRuntime()) return;
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
