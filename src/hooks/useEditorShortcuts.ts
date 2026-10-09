"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
// Aliased: `t` is a local (the tool for a key) further down in onKey.
import { t as tr } from "@/i18n/store";
import { isStickyTool, useEditor, type Tool } from "@/stores/editor";
import {
  zoomAtViewportCenter,
  zoomToFit,
  zoomTo100,
} from "@/lib/zoom";
import { isTauriRuntime } from "@/lib/platform";
import { duplicateSelected } from "@/lib/duplicate";
import { stickyToolLabel } from "@/lib/stickyTools";
import { useSettings } from "@/stores/settings";
import { useWorkspaces } from "@/stores/workspaces";
import { nudgeDelta } from "@/lib/nudge";
import { currentPlatform } from "@/lib/shortcuts";
import { shortcutKey } from "@/lib/shortcutKey";

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
  const { order, activeId, pendingId, switchTo } = useWorkspaces.getState();
  if (order.length < 2) return;
  // Step from where the user is heading, not where the canvas still is: a
  // held ⌃Tab issues switches faster than images decode.
  const from = pendingId ?? activeId;
  const i = from ? order.indexOf(from) : -1;
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
      // CP-0061: physical key under non-Latin layouts (Thai Ctrl+Z is "ผ").
      const key = shortcutKey(e).toLowerCase();

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

      // CP-0059: Ctrl+Y is the Windows redo convention. macOS keeps Cmd+Y
      // unbound (it means "history" in Safari/Chrome there).
      if (
        key === "y" &&
        e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !e.altKey &&
        currentPlatform() !== "mac"
      ) {
        e.preventDefault();
        redo();
        return;
      }

      // CP-0057: duplicate the selection. Always swallowed so browsers don't
      // open "bookmark this page" on Ctrl+D; duplicateSelected() no-ops in
      // crop mode or with nothing selected.
      if (mod && key === "d" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        duplicateSelected();
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
          // CP-0069: one press also leaves any drawing tool, sticky or not.
          // Clicking empty canvas is the way to deselect and keep drawing.
          const { tool, setTool } = useEditor.getState();
          if (tool !== "select") setTool("select");
          return;
        }
        // No selection on a sticky tool → Esc drops back to Select.
        {
          const { tool, setTool } = useEditor.getState();
          const keep = useSettings.getState().config.general.keepToolActive;
          if (isStickyTool(tool, keep)) {
            setTool("select");
            return;
          }
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
        toast(tr("app.shortcuts.escAgain"), {
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

      // K flips the active tool's sticky flag (no-op for Select/Crop, which
      // can never stay active). Mirrors the sidebar's "Keep <tool> active" row.
      if (key === "k") {
        e.preventDefault();
        const { tool } = useEditor.getState();
        if (tool === "select" || tool === "crop") return;
        const { config, update } = useSettings.getState();
        const cur = config.general.keepToolActive;
        const next = cur[tool] === false;
        void update("general", { keepToolActive: { ...cur, [tool]: next } });
        const label = stickyToolLabel(tool);
        toast(tr(next ? "app.shortcuts.toolStays" : "app.shortcuts.toolReturns", { tool: label }), {
          id: "capz-keep-tool-active",
        });
        return;
      }

      // CP-0056: arrow keys nudge the selected element (Shift = 10px). Left
      // alone in crop mode, with Alt, or when a focused widget consumed it.
      const nudge = nudgeDelta(key, e.shiftKey);
      if (nudge) {
        const s = useEditor.getState();
        if (s.selectedId && s.tool !== "crop" && !e.altKey && !e.defaultPrevented) {
          e.preventDefault();
          s.nudge(s.selectedId, nudge.dx, nudge.dy);
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
