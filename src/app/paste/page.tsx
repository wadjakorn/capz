"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Toaster, toast } from "sonner";
import { ImageUp } from "lucide-react";
import { Toolbar } from "@/components/editor/Toolbar";
import { useEditorShortcuts } from "@/hooks/useEditorShortcuts";
import { useEditor } from "@/stores/editor";
import { extractImageBlob, readClipboardPng } from "@/lib/webExport";
import { getStage } from "@/lib/stageBridge";
import { copyOnly } from "@/lib/exportImage";

const EditorStage = dynamic(
  () => import("@/components/editor/EditorStage").then((m) => m.EditorStage),
  { ssr: false },
);

/**
 * Web-only paste-to-edit route. The user captures with the OS tool
 * (Win+Shift+S / ⌘⌃⇧4), pastes here, annotates, and copies/downloads the
 * result. No capture, no backend — the image never leaves the browser.
 */
export default function PastePage() {
  const [src, setSrc] = useState("");
  const srcRef = useRef("");
  const resetEditor = useEditor((s) => s.reset);
  const setHasImage = useEditor((s) => s.setHasImage);

  useEditorShortcuts();

  useEffect(() => () => { if (srcRef.current) URL.revokeObjectURL(srcRef.current); }, []);

  const applyBlob = useCallback(
    (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      if (srcRef.current) URL.revokeObjectURL(srcRef.current);
      srcRef.current = url;
      setSrc(url);
      resetEditor();
      setHasImage(true);
    },
    [resetEditor, setHasImage],
  );

  // Ctrl+V / Cmd+V anywhere on the page.
  useEffect(() => {
    const onPaste = (ev: ClipboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const blob = extractImageBlob(ev.clipboardData?.items);
      if (!blob) {
        toast.error("Clipboard has no image");
        return;
      }
      ev.preventDefault();
      applyBlob(blob);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [applyBlob]);

  // Context-menu Paste inside the stage dispatches this (see EditorStage).
  useEffect(() => {
    const onWebPaste = () => {
      void readClipboardPng().then((blob) => {
        if (blob) applyBlob(blob);
        else toast.error("Clipboard has no image", {
          description: "Copy a screenshot first, or press Ctrl+V / ⌘V.",
        });
      });
    };
    window.addEventListener("capz:web-paste", onWebPaste);
    return () => window.removeEventListener("capz:web-paste", onWebPaste);
  }, [applyBlob]);

  // Drag & drop an image file.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const blob = extractImageBlob(e.dataTransfer?.items);
      if (blob) applyBlob(blob);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [applyBlob]);

  // Cmd/Ctrl+C with no selection copies the flattened result.
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (!(e.key === "c" || e.key === "C")) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      if (!srcRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) return;
      e.preventDefault();
      try {
        const stage = getStage();
        if (!stage) return;
        await copyOnly(stage);
        toast.success("Copied");
      } catch (err) {
        console.error("copy shortcut failed", err);
        toast.error("Copy failed", {
          description: "Your browser blocked the clipboard — use Save to download instead.",
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tag the document with the OS for OS-specific behaviour (matches editor).
  useEffect(() => {
    const p = typeof navigator !== "undefined" ? navigator.platform : "";
    document.documentElement.dataset.os = /Win/i.test(p)
      ? "windows"
      : /Mac/i.test(p)
        ? "macos"
        : "other";
  }, []);

  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && file.type.startsWith("image/")) applyBlob(file);
      e.target.value = "";
    },
    [applyBlob],
  );

  return (
    <div className="flex h-screen flex-col text-foreground">
      <Toolbar />
      <main
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ backgroundColor: "var(--bg-canvas)" }}
      >
        <div
          id="tool-options-slot"
          className="pointer-events-none absolute inset-x-0 top-0 z-40"
          aria-hidden
        />
        <div className="absolute inset-0">
          {src ? <EditorStage src={src} /> : <WebEmptyState onPickFile={onPickFile} />}
        </div>
      </main>
      <Toaster theme="dark" position="top-right" richColors closeButton />
    </div>
  );
}

function WebEmptyState({
  onPickFile,
}: {
  onPickFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const isMac =
    typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  const paste = isMac ? "⌘V" : "Ctrl+V";
  const captureHint = isMac
    ? "⌘⌃⇧4 copies a screenshot to the clipboard"
    : "Win+Shift+S copies a screenshot to the clipboard";
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="surface flex flex-col items-center gap-4 px-10 py-8 text-center">
        <div className="tile-icon h-16 w-16">
          <ImageUp className="h-7 w-7" aria-hidden />
        </div>
        <div className="flex flex-col gap-1 text-sm text-foreground/80">
          <div>
            Paste a screenshot (
            <span className="font-mono text-foreground">{paste}</span>) or drop
            an image here.
          </div>
          <div className="text-xs text-foreground/60">{captureHint}</div>
        </div>
        <label className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-sm text-foreground/85 transition-colors hover:bg-[var(--surface-raised)]">
          Choose an image…
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickFile}
          />
        </label>
      </div>
    </div>
  );
}
