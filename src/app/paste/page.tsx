"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Toaster, toast } from "sonner";
import { ImageUp, Monitor, SlidersHorizontal } from "lucide-react";
import { Toolbar } from "@/components/editor/Toolbar";
import { useEditorShortcuts } from "@/hooks/useEditorShortcuts";
import { useWorkspaceSession } from "@/hooks/useWorkspaceSession";
import { WorkspaceBar } from "@/components/editor/WorkspaceBar";
import { WorkspaceSwapOverlay } from "@/components/editor/WorkspaceSwapOverlay";
import { useWorkspaces } from "@/stores/workspaces";
import { useEditor } from "@/stores/editor";
import { extractImageBlob, readClipboardPng } from "@/lib/webExport";
import { getStage } from "@/lib/stageBridge";
import { copyOnly } from "@/lib/exportImage";
import { shortcutKey } from "@/lib/shortcutKey";
import {
  captureScreen,
  isWebCaptureSupported,
  WebCaptureError,
} from "@/lib/webCapture";
import { rich } from "@/lib/richText";
import { t as tNow, LANGS, type Lang } from "@/i18n/store";
import { useT } from "@/i18n/useT";

const EditorStage = dynamic(
  () => import("@/components/editor/EditorStage").then((m) => m.EditorStage),
  { ssr: false },
);

/**
 * Web-only capture / paste-to-edit route. The user grabs a screenshot with the
 * in-browser Screen Capture API (or the OS tool + paste), annotates, and
 * copies/downloads the result. No backend — the image never leaves the browser.
 */
/**
 * Web workspace cap — lower than the desktop's.
 *
 * Every workspace here pins a full-resolution Blob in the tab's memory (there
 * is no filesystem to spill to), and none of it survives a reload, so the
 * ceiling is deliberately modest.
 */
const WEB_WORKSPACE_MAX = 3;

export default function PastePage() {
  const [src, setSrc] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [canCapture, setCanCapture] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const srcRef = useRef("");
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const resetEditor = useEditor((s) => s.reset);
  const setHasImage = useEditor((s) => s.setHasImage);
  const { t } = useT();

  useEditorShortcuts();
  // Workspaces are always on in the browser: there is no Settings view here,
  // and the bar stays hidden until a second workspace exists anyway.
  useWorkspaceSession({ enabled: true, setFile: () => {}, setSrc });
  const wsCount = useWorkspaces((s) => s.order.length);
  const tabOnlyNoticeShown = useRef(false);

  // Say it once, the first time the bar appears: on the web these are tab-local
  // and a reload loses them. The desktop build persists them, so the same UI
  // would otherwise imply a durability the browser cannot deliver.
  useEffect(() => {
    if (wsCount < 2 || tabOnlyNoticeShown.current) return;
    tabOnlyNoticeShown.current = true;
    toast(tNow("app.paste.tabOnly"), {
      description: tNow("app.paste.tabOnlyDesc"),
      duration: 6000,
    });
  }, [wsCount]);

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

  // Switching workspaces changes `src` behind acceptBlob's back; mirror it so
  // "is the canvas occupied?" stays true per workspace, not per session.
  useEffect(() => {
    srcRef.current = src;
  }, [src]);

  useEffect(() => () => { if (srcRef.current) URL.revokeObjectURL(srcRef.current); }, []);

  // The workspace store owns the image now, and useWorkspaceSession pushes it
  // into `src` — writing `src` here too would give the canvas two masters.
  // `srcRef` stays as the "is the canvas occupied?" flag acceptBlob branches on.
  const applyBlob = useCallback(
    (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      srcRef.current = url;
      // Object URLs of replaced images are revoked by the store when it lets
      // go of them, so the blob stays alive as long as a workspace points at it.
      useWorkspaces.getState().setActiveImage({ kind: "blob", url });
    },
    [],
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
          if (!id) toast.error(tNow("app.paste.addFailed"));
        })();
      };
      reader.onerror = () => toast.error(tNow("app.paste.readFailed"));
      reader.readAsDataURL(blob);
    },
    [applyBlob],
  );

  // Drop the current image and annotations, back to the empty state. The
  // workspace itself stays — closing one is the bar tile's ✕.
  const clearImage = useCallback(() => {
    srcRef.current = "";
    useWorkspaces.getState().clearActive();
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
        toast.error(tNow("app.paste.noImage"));
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
        else toast.error(tNow("app.paste.noImage"), {
          description: tNow("app.paste.noImageDesc"),
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
      if (!blob) { toast.error(tNow("app.paste.notImage")); return; }
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
      if (shortcutKey(e).toLowerCase() !== "c") return;
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
        if (r.copied) toast.success(tNow("app.paste.copied"));
        else if (r.downloaded)
          toast(tNow("app.paste.downloaded"), {
            description: tNow("app.paste.downloadedDesc"),
          });
        else
          toast.error(tNow("app.paste.copyFailed"), {
            description: tNow("app.paste.copyFailedDesc"),
          });
      } catch (err) {
        console.error("copy shortcut failed", err);
        toast.error(tNow("app.paste.copyFailed"), {
          description: tNow("app.paste.copyFailedDesc"),
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
        else toast.error(tNow("app.paste.notImage"));
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
        toast.error(tNow("app.paste.captureUnavailable"), {
          description: tNow("app.paste.captureUnavailableDesc"),
        });
      } else {
        toast.error(tNow("app.paste.captureFailed"), { description: String(err) });
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
        onNewWorkspace={() => useWorkspaces.getState().createEmpty(WEB_WORKSPACE_MAX)}
      />
      <main
        className="relative flex min-h-0 flex-1 overflow-hidden"
        style={{ backgroundColor: "var(--bg-canvas)" }}
      >
        <div id="canvas-area" className="relative min-w-0 flex-1">
          <LanguageSwitch />
          <div ref={canvasWrapRef} className="absolute inset-0">
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
          <WorkspaceSwapOverlay enabled canvasRef={canvasWrapRef} />
        </div>
        {/* Tool-options panel — always docked on the right; empty until the
            Toolbar portals contextual controls into it. See the editor page.
            Below `sm` it slides over the canvas instead of stealing 240px. */}
        <button
          type="button"
          aria-label={optionsOpen ? t("app.paste.closeOptions") : t("app.paste.openOptions")}
          aria-expanded={optionsOpen}
          aria-controls="tool-options-slot"
          onClick={() => setOptionsOpen((v) => !v)}
          className="absolute right-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-overlay)] sm:hidden"
        >
          <SlidersHorizontal className="h-5 w-5" aria-hidden />
        </button>
        <aside
          id="tool-options-slot"
          aria-label={t("app.paste.toolOptions")}
          className={`${
            optionsOpen ? "flex" : "hidden"
          } absolute right-0 top-0 z-10 h-full w-60 flex-none flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-3 sm:static sm:flex`}
        />
      </main>
      <WorkspaceBar
        max={WEB_WORKSPACE_MAX}
        onNew={() => useWorkspaces.getState().createEmpty(WEB_WORKSPACE_MAX)}
      />
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
  const { t } = useT();
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="surface flex flex-col items-center gap-4 px-10 py-8 text-center">
        <div className="tile-icon h-16 w-16">
          <ImageUp className="h-7 w-7" aria-hidden />
        </div>
        <div className="flex flex-col gap-1 text-sm text-foreground/80">
          <div>
            {rich(t("app.paste.emptyLead"), {
              paste: <span className="font-mono text-foreground">{paste}</span>,
            })}
          </div>
          <div className="text-xs text-foreground/60">{t("app.paste.emptyHint")}</div>
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
              {capturing ? t("app.paste.capturing") : t("app.paste.captureScreen")}
            </button>
          )}
          <label className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-sm text-foreground/85 transition-colors hover:bg-[var(--surface-raised)]">
            {t("app.paste.chooseImage")}
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

/**
 * TH/EN switch for the web build. There is no persisted config here (the
 * project rule bans browser storage), so it only sets the in-memory i18n
 * language — a reload goes back to Thai. Floats over the canvas's top-right
 * corner, below the ruler band and clear of the mobile tool-options button.
 */
function LanguageSwitch() {
  const { t, lang, setLang } = useT();
  const label: Record<Lang, string> = { th: t("app.paste.langTh"), en: t("app.paste.langEn") };
  return (
    <div
      role="group"
      aria-label={t("app.paste.language")}
      className="absolute right-[3.75rem] top-2 z-20 flex items-center rounded-md border border-[var(--border)] bg-[var(--surface-overlay)] p-0.5 text-xs sm:right-3 sm:top-7"
    >
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded px-2 py-1 transition-colors ${
            lang === l
              ? "bg-[var(--accent)] text-[var(--accent-fg)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label[l]}
        </button>
      ))}
    </div>
  );
}
