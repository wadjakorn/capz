"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Toaster, toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Toolbar } from "@/components/editor/Toolbar";
import { SettingsView } from "@/components/settings/SettingsView";
import { OnboardingView } from "@/components/onboarding/OnboardingView";
import { InertGrantRecoveryDialog } from "@/components/onboarding/InertGrantRecoveryDialog";
import { useEditorShortcuts } from "@/hooks/useEditorShortcuts";
import { useEditor, type CaptureSource } from "@/stores/editor";
import { useOcr } from "@/stores/ocr";
import { useSettings } from "@/stores/settings";
import {
  useNoticeListener,
  usePermissionRevokedListener,
  useStalePermissionAfterUpdateListener,
  useInertGrantAfterUpdateListener,
  useScreenRecordingHealthCheck,
} from "@/lib/notice";
import { useUpdateCheckListener } from "@/lib/updater";

const EditorStage = dynamic(
  () => import("@/components/editor/EditorStage").then((m) => m.EditorStage),
  { ssr: false },
);

type View = "editor" | "settings" | "onboarding";

export default function EditorPage() {
  const [file, setFile] = useState<string | null>(null);
  const [src, setSrc] = useState("");
  const [view, setView] = useState<View>("editor");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const resetEditor = useEditor((s) => s.reset);
  const setHasImage = useEditor((s) => s.setHasImage);
  const openRecovery = useCallback(() => setRecoveryOpen(true), []);

  const configIssues = useSettings((s) => s.issues);
  const configReady = useSettings((s) => s.ready);
  const resetSettings = useSettings((s) => s.reset);
  const issueToastShown = useRef(false);

  useEditorShortcuts();
  useNoticeListener();
  usePermissionRevokedListener();
  useStalePermissionAfterUpdateListener();
  useInertGrantAfterUpdateListener(openRecovery);
  useScreenRecordingHealthCheck(openRecovery);
  useUpdateCheckListener();

  const applyFile = useCallback(async (
    path: string | null,
    source: CaptureSource = "other",
  ) => {
    if (!path) {
      setFile(null);
      setSrc("");
      resetEditor();
      useOcr.getState().reset();
      setHasImage(false);
      return;
    }
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    setFile(path);
    setSrc(`${convertFileSrc(path)}?t=${Date.now()}`);
    resetEditor();
    useOcr.getState().reset();
    useOcr.getState().setKey(path);
    setHasImage(true);
    await useSettings.getState().init();
    const config = useSettings.getState().config;
    // Seed the padded backdrop per capture kind (per config), off for anything
    // else. Runs after resetEditor so it isn't clobbered.
    useEditor.getState().setCaptureSource(source);
    const bd = config.general.backdrop;
    const autoBackdrop =
      source === "full"
        ? bd.autoForFull
        : source === "area"
          ? bd.autoForArea
          : source === "window"
            ? bd.autoForWindow
            : false;
    useEditor.getState().setBackdropOn(autoBackdrop);
    const pins = config.pins;
    const start =
      pins.continuityMode === "continue"
        ? Math.max(pins.lastUsedNumber + 1, pins.defaultStartNumber)
        : pins.defaultStartNumber;
    useEditor.getState().setNextPinNumber(start);
  }, [resetEditor, setHasImage]);

  useEffect(() => {
    (async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string | null>("editor_current_image");
      if (path) await applyFile(path);
    })();
  }, [applyFile]);

  // Load settings on mount (even before an image) so config-validation issues
  // surface immediately. init() is idempotent.
  useEffect(() => {
    void useSettings.getState().init();
  }, []);

  // If the persisted config had invalid/unknown entries, tell the user and
  // offer a one-click reset instead of only logging to the console.
  useEffect(() => {
    if (!configReady || issueToastShown.current || configIssues.length === 0) {
      return;
    }
    issueToastShown.current = true;
    const n = configIssues.length;
    const shown = configIssues.slice(0, 6).join(" · ");
    const more = n > 6 ? ` · …and ${n - 6} more` : "";
    toast.error(`${n} invalid setting${n === 1 ? "" : "s"} ignored`, {
      description: `${shown}${more}. Reset to defaults to clean it up — your valid settings are kept.`,
      duration: Infinity,
      action: {
        label: "Reset settings",
        onClick: () => {
          void resetSettings()
            .then(() => toast.success("Settings reset to defaults"))
            .catch((e) => {
              console.error("settings reset failed", e);
              toast.error("Reset failed", { description: String(e) });
            });
        },
      },
    });
  }, [configReady, configIssues, resetSettings]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<string | { path: string; source?: CaptureSource }>(
        "editor:load-image",
        (e) => {
          // Payload is `{ path, source }`; tolerate a bare string (legacy).
          const p = e.payload;
          if (typeof p === "string") {
            void applyFile(p);
          } else {
            void applyFile(p.path, p.source ?? "other");
          }
          setView("editor");
        },
      );
    })();
    return () => unlisten?.();
  }, [applyFile]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen("editor:clear", () => {
        void applyFile(null);
      });
    })();
    return () => unlisten?.();
  }, [applyFile]);

  // Deep-link from tray/Rust/toast: open settings view, optionally focus a tab.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen, emit } = await import("@tauri-apps/api/event");
      unlisten = await listen<string | null>("editor:show-settings", (e) => {
        setView("settings");
        const tab = e.payload;
        if (typeof tab === "string" && tab.length > 0) {
          void emit("settings:focus-tab", tab);
        }
      });
    })();
    return () => unlisten?.();
  }, []);

  // Deep-link: open onboarding view (first launch + Settings "Re-run").
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen("editor:show-onboarding", () => {
        setView("onboarding");
      });
    })();
    return () => unlisten?.();
  }, []);

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

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (!(e.key === "c" || e.key === "C")) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      if (!file) return;
      if (view !== "editor") return;
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
        const recoverable =
          title === "Permission denied" ||
          title === "Read-only volume" ||
          title === "Disk full";
        toast.error(title, {
          description: detail,
          action: recoverable
            ? {
                label: "Pick folder",
                onClick: () => {
                  setView("settings");
                  void (async () => {
                    const { emit } = await import("@tauri-apps/api/event");
                    await emit("settings:focus-tab", "output");
                  })();
                },
              }
            : undefined,
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, view]);

  useEffect(() => {
    const onPaste = async (ev: ClipboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      ev.preventDefault();
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        if (useEditor.getState().addImageMode) {
          // Add-image mode: layer the clipboard image as an overlay object.
          const dataUrl = await invoke<string>("read_clipboard_image_data_url");
          const { addOverlayImage } = await import("@/lib/addImage");
          const id = await addOverlayImage(dataUrl);
          if (!id) toast.error("Couldn't add clipboard image");
        } else {
          await invoke<string>("paste_into_editor");
        }
      } catch (err) {
        console.warn("clipboard paste failed", err);
        toast.error("Clipboard has no image");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // Desktop file drag-drop: dropping an image file onto the editor window
  // imports it, honoring Add-image mode (add overlay vs. replace). Non-image
  // drops are ignored with a toast. OS drops arrive as Tauri drag-drop events
  // because the editor window has drag_drop_enabled.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const paths = event.payload.paths ?? [];
        void (async () => {
          const { isImportableImagePath, importImagePathDesktop } = await import(
            "@/lib/importImage"
          );
          const imgPath = paths.find(isImportableImagePath);
          if (!imgPath) {
            if (paths.length > 0) toast.error("Not an image");
            return;
          }
          try {
            const ok = await importImagePathDesktop(imgPath);
            if (!ok) toast.error("Couldn't import image");
          } catch (err) {
            console.error("drop import failed", err);
            toast.error("Import failed", { description: String(err) });
          }
        })();
      });
    })();
    return () => unlisten?.();
  }, []);

  // Tag the document with the OS for OS-specific behaviour.
  useEffect(() => {
    const p = typeof navigator !== "undefined" ? navigator.platform : "";
    document.documentElement.dataset.os = /Win/i.test(p)
      ? "windows"
      : /Mac/i.test(p)
        ? "macos"
        : "other";
  }, []);

  return (
    <div className="flex h-screen flex-col text-foreground">
      {view === "settings" ? (
        <SubViewHeader title="Settings" onBack={() => setView("editor")} />
      ) : view === "onboarding" ? (
        <SubViewHeader title="Welcome" onBack={() => setView("editor")} />
      ) : (
        <Toolbar onOpenSettings={() => setView("settings")} />
      )}
      <main
        className="relative min-h-0 flex-1 overflow-hidden"
        style={view === "editor" ? { backgroundColor: "var(--bg-canvas)" } : undefined}
      >
        <div
          id="tool-options-slot"
          className="pointer-events-none absolute inset-x-0 top-0 z-40"
          aria-hidden
        />
        <div
          className="absolute inset-0"
          style={{
            visibility: view === "editor" ? "visible" : "hidden",
            pointerEvents: view === "editor" ? "auto" : "none",
          }}
          aria-hidden={view !== "editor"}
        >
          {file ? <EditorStage src={src} /> : <EmptyState />}
        </div>
        {view === "settings" && (
          <div className="absolute inset-0 overflow-auto">
            <SettingsView onOpenInertRecovery={openRecovery} />
          </div>
        )}
        {view === "onboarding" && (
          <div className="absolute inset-0 overflow-auto">
            <OnboardingView
              onDone={() => setView("editor")}
              onOpenInertRecovery={openRecovery}
            />
          </div>
        )}
      </main>
      <Toaster theme="dark" position="top-right" richColors closeButton />
      <InertGrantRecoveryDialog
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
      />
    </div>
  );
}

function SubViewHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm text-foreground/85 transition-colors hover:bg-[var(--surface-raised)] hover:text-foreground"
        title="Back to editor"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Editor
      </button>
      <h1 className="text-sm font-semibold text-white">{title}</h1>
    </div>
  );
}

function EmptyState() {
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  const paste = isMac ? "⌘V" : "Ctrl+V";
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="surface flex flex-col items-center gap-4 px-10 py-8 text-center">
        <div className="tile-icon h-16 w-16">
          <span className="text-2xl">⌘</span>
        </div>
        <div className="text-sm text-foreground/80">
          Paste an image (<span className="font-mono text-foreground">{paste}</span>) or capture from the tray.
        </div>
      </div>
    </div>
  );
}
