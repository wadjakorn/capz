"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Toaster, toast } from "sonner";
import { ImageUp, Monitor } from "lucide-react";
import { Toolbar } from "@/components/editor/Toolbar";
import { useEditorShortcuts } from "@/hooks/useEditorShortcuts";
import { useEditor } from "@/stores/editor";
import { extractImageBlob, readClipboardPng } from "@/lib/webExport";
import { getStage } from "@/lib/stageBridge";
import { copyOnly } from "@/lib/exportImage";
import {
  captureScreen,
  isWebCaptureSupported,
  WebCaptureError,
} from "@/lib/webCapture";

const EditorStage = dynamic(
  () => import("@/components/editor/EditorStage").then((m) => m.EditorStage),
  { ssr: false },
);

/**
 * Web-only capture / paste-to-edit route. The user grabs a screenshot with the
 * in-browser Screen Capture API (or the OS tool + paste), annotates, and
 * copies/downloads the result. No backend — the image never leaves the browser.
 */
export default function PastePage() {
  const [src, setSrc] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [canCapture, setCanCapture] = useState(false);
  const srcRef = useRef("");
  const resetEditor = useEditor((s) => s.reset);
  const setHasImage = useEditor((s) => s.setHasImage);

  useEditorShortcuts();

  // Guard against losing unsaved work: once an image is loaded (nothing on
  // /paste is persisted), a tab close / reload / back-navigation triggers the
  // browser's native "leave site?" confirmation. No prompt when the canvas is
  // empty, so a clean tab still closes without friction.
  useEffect(() => {
    if (!src) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers require returnValue to be set to show the dialog.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [src]);

  // Only offer in-browser capture where the Screen Capture API exists.
  useEffect(() => setCanCapture(isWebCaptureSupported()), []);

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

  // Base-vs-overlay router: an empty canvas takes the image as the base
  // (replace); once a base image exists, every further paste/drop/pick lands as
  // a movable overlay object (converted to a persistent data URL). To start
  // fresh, clear the canvas first.
  const acceptBlob = useCallback(
    (blob: Blob) => {
      if (!srcRef.current) {
        applyBlob(blob);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        void (async () => {
          const { addOverlayImage } = await import("@/lib/addImage");
          const id = await addOverlayImage(reader.result as string);
          if (!id) toast.error("Couldn't add image");
        })();
      };
      reader.onerror = () => toast.error("Couldn't read image");
      reader.readAsDataURL(blob);
    },
    [applyBlob],
  );

  // Drop the current image and annotations, back to the empty state.
  const clearImage = useCallback(() => {
    if (srcRef.current) URL.revokeObjectURL(srcRef.current);
    srcRef.current = "";
    setSrc("");
    resetEditor();
    setHasImage(false);
  }, [resetEditor, setHasImage]);

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
      acceptBlob(blob);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptBlob]);

  // Context-menu Paste inside the stage dispatches this (see EditorStage).
  useEffect(() => {
    const onWebPaste = () => {
      void readClipboardPng().then((blob) => {
        if (blob) acceptBlob(blob);
        else toast.error("Clipboard has no image", {
          description: "Copy a screenshot first, or press Ctrl+V / ⌘V.",
        });
      });
    };
    window.addEventListener("capz:web-paste", onWebPaste);
    return () => window.removeEventListener("capz:web-paste", onWebPaste);
  }, [acceptBlob]);

  // Drag & drop an image file.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const blob = extractImageBlob(e.dataTransfer?.items);
      if (!blob) { toast.error("Not an image"); return; }
      acceptBlob(blob);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [acceptBlob]);

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
        const r = await copyOnly(stage);
        if (r.copied) toast.success("Copied");
        else if (r.downloaded)
          toast("Downloaded instead", {
            description:
              "This browser can't copy images to the clipboard — saved the PNG to your downloads.",
          });
        else
          toast.error("Copy failed", {
            description: "Your browser blocked the clipboard — use Save to download instead.",
          });
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
      // Route through acceptBlob so a pick follows the base-vs-overlay rule
      // (first image is the base, later ones layer on top). The picker's
      // accept="image/*" pre-filters, but a drag into the dialog or an OS that
      // ignores the hint can still yield a non-image — reject it with a toast.
      if (file) {
        if (file.type.startsWith("image/")) acceptBlob(file);
        else toast.error("Not an image");
      }
      e.target.value = "";
    },
    [acceptBlob],
  );

  // Toolbar "Import image…" (web) opens this hidden picker via a custom event.
  const importInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onImport = () => importInputRef.current?.click();
    window.addEventListener("capz:web-import", onImport);
    return () => window.removeEventListener("capz:web-import", onImport);
  }, []);

  // Capture the screen in-browser (Screen Capture API) and load it into the
  // editor — no OS tool round-trip. A permission picker appears every time.
  const onCapture = useCallback(async () => {
    setCapturing(true);
    try {
      const { blob } = await captureScreen();
      applyBlob(blob);
    } catch (err) {
      if (err instanceof WebCaptureError && err.kind === "cancelled") {
        // User dismissed the picker — silent.
      } else if (err instanceof WebCaptureError && err.kind === "unsupported") {
        toast.error("Screen capture unavailable", {
          description: "This browser or context can't capture the screen — paste a screenshot instead.",
        });
      } else {
        toast.error("Capture failed", { description: String(err) });
      }
    } finally {
      setCapturing(false);
    }
  }, [applyBlob]);

  return (
    <div className="flex h-screen flex-col text-foreground">
      <Toolbar
        onWebCapture={canCapture ? onCapture : undefined}
        onWebClear={clearImage}
      />
      <main
        className="relative flex min-h-0 flex-1 overflow-hidden"
        style={{ backgroundColor: "var(--bg-canvas)" }}
      >
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0">
            {src ? (
              <EditorStage src={src} />
            ) : (
              <WebEmptyState
                onPickFile={onPickFile}
                onCapture={onCapture}
                capturing={capturing}
                canCapture={canCapture}
              />
            )}
          </div>
        </div>
        {/* Contextual tool-options panel docks here (right side); see the
            editor page for the reflow rationale. */}
        <div id="tool-options-slot" className="flex-none" aria-hidden />
      </main>
      <Toaster theme="dark" position="top-right" richColors closeButton />
      <input
        ref={importInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickFile}
      />
    </div>
  );
}

function WebEmptyState({
  onPickFile,
  onCapture,
  capturing,
  canCapture,
}: {
  onPickFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCapture: () => void;
  capturing: boolean;
  canCapture: boolean;
}) {
  // navigator is absent during prerender: default to the non-mac hint so the
  // server HTML and first client render match, then correct after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isMac =
    mounted && typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  const paste = isMac ? "⌘V" : "Ctrl+V";
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="surface flex flex-col items-center gap-4 px-10 py-8 text-center">
        <div className="tile-icon h-16 w-16">
          <ImageUp className="h-7 w-7" aria-hidden />
        </div>
        <div className="flex flex-col gap-1 text-sm text-foreground/80">
          <div>
            Capture your screen, paste a screenshot (
            <span className="font-mono text-foreground">{paste}</span>), or drop
            an image here.
          </div>
          <div className="text-xs text-foreground/60">
            Capture prompts you to pick a screen or window each time.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canCapture && (
            <button
              type="button"
              onClick={onCapture}
              disabled={capturing}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Monitor className="h-4 w-4" aria-hidden />
              {capturing ? "Capturing…" : "Capture screen"}
            </button>
          )}
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
    </div>
  );
}
