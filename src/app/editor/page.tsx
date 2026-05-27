"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Toaster, toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Toolbar } from "@/components/editor/Toolbar";
import { SettingsView } from "@/components/settings/SettingsView";
import { OnboardingView } from "@/components/onboarding/OnboardingView";
import { InertGrantRecoveryDialog } from "@/components/onboarding/InertGrantRecoveryDialog";
import { useEditorShortcuts } from "@/hooks/useEditorShortcuts";
import { useEditor } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import {
  useNoticeListener,
  usePermissionRevokedListener,
  useStalePermissionAfterUpdateListener,
  useInertGrantAfterUpdateListener,
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

  useEditorShortcuts();
  useNoticeListener();
  usePermissionRevokedListener();
  useStalePermissionAfterUpdateListener();
  useInertGrantAfterUpdateListener(openRecovery);
  useUpdateCheckListener();

  const applyFile = useCallback(async (path: string | null) => {
    if (!path) {
      setFile(null);
      setSrc("");
      resetEditor();
      setHasImage(false);
      return;
    }
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    setFile(path);
    setSrc(`${convertFileSrc(path)}?t=${Date.now()}`);
    resetEditor();
    setHasImage(true);
    await useSettings.getState().init();
    const pins = useSettings.getState().config.pins;
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

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<string>("editor:load-image", (e) => {
        void applyFile(e.payload);
        setView("editor");
      });
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
        style={view === "editor" ? { backgroundColor: "#0d021f" } : undefined}
      >
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
            <OnboardingView onDone={() => setView("editor")} />
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
    <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2 backdrop-blur">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm text-foreground/85 transition-colors hover:bg-white/10 hover:text-foreground"
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
      <div className="glass-card flex flex-col items-center gap-4 px-10 py-8 text-center">
        <div className="glow-tile glow-tile-violet h-16 w-16">
          <span className="text-2xl">⌘</span>
        </div>
        <div className="text-sm text-foreground/80">
          Paste an image (<span className="font-mono text-foreground">{paste}</span>) or capture from the tray.
        </div>
      </div>
    </div>
  );
}
