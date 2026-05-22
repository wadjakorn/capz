"use client";

import { useEffect } from "react";
import { useEditor, type Tool } from "@/stores/editor";

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

      if (mod) return;

      if (key === "escape") {
        e.preventDefault();
        select(null);
        setTool("select");
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
