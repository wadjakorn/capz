"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Toaster, toast } from "sonner";
import { Toolbar } from "@/components/editor/Toolbar";
import { useEditorShortcuts } from "@/hooks/useEditorShortcuts";
import { useEditor } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { useNoticeListener } from "@/lib/notice";
import { useUpdateCheckListener } from "@/lib/updater";

const EditorStage = dynamic(
  () => import("@/components/editor/EditorStage").then((m) => m.EditorStage),
  { ssr: false },
);

export default function EditorPage() {
  const [file, setFile] = useState<string | null>(null);
  const [src, setSrc] = useState("");
  const resetEditor = useEditor((s) => s.reset);

  useEditorShortcuts();
  useNoticeListener();
  useUpdateCheckListener();

  const applyFile = useCallback(async (path: string | null) => {
    if (!path) {
      setFile(null);
      setSrc("");
      return;
    }
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    setFile(path);
    setSrc(`${convertFileSrc(path)}?t=${Date.now()}`);
    resetEditor();
    await useSettings.getState().init();
    const pins = useSettings.getState().config.pins;
    const start =
      pins.continuityMode === "continue"
        ? Math.max(pins.lastUsedNumber + 1, pins.defaultStartNumber)
        : pins.defaultStartNumber;
    useEditor.getState().setNextPinNumber(start);
  }, [resetEditor]);

  // Initial load: pull whatever is in Rust state (covers cold-start with prior capture).
  useEffect(() => {
    (async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string | null>("editor_current_image");
      if (path) await applyFile(path);
    })();
  }, [applyFile]);

  // Subsequent loads (new captures / paste): event-driven.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<string>("editor:load-image", (e) => {
        void applyFile(e.payload);
      });
    })();
    return () => unlisten?.();
  }, [applyFile]);

  // Hide-on-close: workspace persists until app quit.
  // If general.closeAction is set, run the export action first, then hide.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      unlisten = await win.onCloseRequested((e) => {
        e.preventDefault();
        void (async () => {
          const { runPreCloseAction } = await import("@/lib/preClose");
          await runPreCloseAction();
          await win.hide();
        })();
      });
    })();
    return () => unlisten?.();
  }, []);

  // Dedicated Copy shortcut: CmdOrCtrl+C copies the full annotated stage.
  // Skips when typing, selecting text, or no image is loaded.
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (!(e.key === "c" || e.key === "C")) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      if (!file) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) return;
      e.preventDefault();
      try {
        const { getStage } = await import("@/lib/stageBridge");
        const { copyOnly } = await import("@/lib/exportImage");
        const stage = getStage();
        if (!stage) return;
        await copyOnly(stage);
        toast.success("Copied");
      } catch (err) {
        console.error("copy shortcut failed", err);
        const { describeExportError } = await import("@/lib/exportErrors");
        const { title, detail } = describeExportError(err);
        toast.error(title, { description: detail });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file]);

  // Paste handler: ask Rust to read clipboard image and load it.
  useEffect(() => {
    const onPaste = async (ev: ClipboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      ev.preventDefault();
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke<string>("paste_into_editor");
      } catch (err) {
        console.warn("paste_into_editor failed", err);
        toast.error("Clipboard has no image");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <Toolbar />
      <main className="relative min-h-0 flex-1">
        {file ? (
          <EditorStage src={src} />
        ) : (
          <EmptyState />
        )}
      </main>
      <Toaster theme="dark" position="top-right" richColors closeButton />
    </div>
  );
}

function EmptyState() {
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  const paste = isMac ? "⌘V" : "Ctrl+V";
  return (
    <div className="flex h-full w-full items-center justify-center bg-neutral-900">
      <div className="flex flex-col items-center gap-3 text-center text-neutral-400">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-neutral-700 text-3xl">
          ⌘
        </div>
        <div className="text-sm">
          Paste an image (<span className="font-mono">{paste}</span>) or capture from the tray.
        </div>
      </div>
    </div>
  );
}
