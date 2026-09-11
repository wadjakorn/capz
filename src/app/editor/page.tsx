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
import { useWorkspaces } from "@/stores/workspaces";
import { useHistory } from "@/stores/history";
import { useWorkspaceSession } from "@/hooks/useWorkspaceSession";
import { WorkspaceBar } from "@/components/editor/WorkspaceBar";
import { CanvasDropHint } from "@/components/editor/CanvasDropHint";
import { SidebarTabs, type SidebarTab } from "@/components/editor/SidebarTabs";
import { CaptureHistorySection } from "@/components/editor/panels/CaptureHistorySection";
import { useSidebar } from "@/stores/sidebar";
import { routeIncomingCapture } from "@/lib/captureRouting";
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

  // Sidebar panel selection. `remembered` is the last panel the user chose on
  // purpose; the tool panel never becomes that, so deselecting a tool returns
  // to where they actually were rather than to wherever they started.
  const toolPanel = useSidebar((s) => s.toolPanel);
  const [rememberedTab, setRememberedTab] = useState<"canvas" | "history">("canvas");
  const [showingTool, setShowingTool] = useState(false);
  const hadToolPanel = useRef(false);
  useEffect(() => {
    const has = toolPanel !== null;
    // Auto-open a panel the moment it appears; forget it the moment it goes.
    if (has !== hadToolPanel.current) {
      hadToolPanel.current = has;
      setShowingTool(has);
    }
  }, [toolPanel]);
  const activeTab: SidebarTab = showingTool && toolPanel ? "tool" : rememberedTab;
  const onSelectTab = useCallback((tab: SidebarTab) => {
    if (tab === "tool") {
      setShowingTool(true);
      return;
    }
    // Leaving for a permanent panel does NOT drop the tool — you can adjust the
    // backdrop while still holding the pen.
    setShowingTool(false);
    setRememberedTab(tab);
  }, []);

  const wsConfig = useSettings((s) => s.config.workspaces);
  const historyConfig = useSettings((s) => s.config.history);
  const reopenLastClosed = useWorkspaces((s) => s.reopenLastClosed);
  useWorkspaceSession({ enabled: wsConfig.enabled, setFile, setSrc });

  useEffect(() => {
    void (async () => {
      await useHistory.getState().init(historyConfig.enabled);
      if (!historyConfig.enabled) return;
      const { resolveSaveDirPath } = await import("@/lib/exportImage");
      await useHistory.getState().refreshArchive(await resolveSaveDirPath());
    })();
  }, [historyConfig.enabled]);

  /**
   * Copy an arriving capture into the archive.
   *
   * Only real screen captures — a paste or an opened file is already a file the
   * user has, so archiving it would just duplicate their own data.
   */
  const archiveIncoming = useCallback(
    async (path: string, source: CaptureSource) => {
      const cfg = useSettings.getState().config.history;
      if (!cfg.enabled || !cfg.archiveCaptures) return;
      if (source === "other") return;
      const { archiveCapture } = await import("@/lib/captureArchive");
      const { resolveSaveDirPath } = await import("@/lib/exportImage");
      const dir = await resolveSaveDirPath();
      if (!dir) return;
      const res = await archiveCapture(path, dir, cfg.archiveBudgetMb);
      if (!res) return;
      await useHistory.getState().refreshArchive(dir);
      if (res.evicted.length > 0) {
        toast(
          `Archive full — removed ${res.evicted.length} older ${
            res.evicted.length === 1 ? "capture" : "captures"
          }`,
          { description: "Files you exported yourself are never removed." },
        );
      }
    },
    [],
  );

  /**
   * A capture-history file was dropped on the canvas: base image on an empty
   * canvas, overlay layer otherwise. Same split as paste and OS drag-drop, and
   * it reuses their helper rather than repeating the branch.
   */
  const onHistoryDrop = useCallback((path: string) => {
    void (async () => {
      try {
        const { importImagePathDesktop } = await import("@/lib/importImage");
        const ok = await importImagePathDesktop(path);
        if (!ok) toast.error("Couldn't add that image");
      } catch (err) {
        console.error("history drop failed", err);
        useHistory.getState().markMissing(
          useHistory.getState().items.find((i) => i.path === path)?.id ?? "",
        );
        toast.error("File no longer exists");
      }
    })();
  }, []);

  /** Toast with an Undo that survives being the only visible toast. */
  const undoToast = useCallback(
    (message: string) => {
      toast(message, {
        id: "workspace-undo",
        duration: 6000,
        action: { label: "Undo", onClick: () => reopenLastClosed() },
      });
    },
    [reopenLastClosed],
  );

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
        : source === "area" || source === "systemArea"
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

  // Layer path: keep the current canvas and layer the new capture as a movable
  // overlay object. We embed the capture as a data URL (mirroring paste and
  // desktop file-import) so the overlay is self-contained and does not depend
  // on the temp file — Rust deliberately leaves the base image as the active
  // workspace file for a layer capture, so nothing owns this one. Does NOT
  // reset the editor, so annotations/crop/zoom/base image are preserved.
  const addCaptureAsOverlay = useCallback(async (path: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      // consumeTemp: a layer capture's temp file has no owner in Rust (the base
      // image keeps the active-workspace slot), so Rust deletes it once we hold
      // the pixels. Ignored for non-`capz-temp-*` paths.
      const dataUrl = await invoke<string>("read_image_file_data_url", {
        path,
        consumeTemp: true,
      });
      const { addOverlayImage } = await import("@/lib/addImage");
      const id = await addOverlayImage(dataUrl);
      if (!id) toast.error("Couldn't add the new capture");
    } catch (err) {
      console.error("add capture as overlay failed", err);
      toast.error("Couldn't add the new capture", { description: String(err) });
    }
  }, []);

  // Route an incoming capture. A capture always replaces the workspace unless
  // it was explicitly requested as a layer (the editor's capture-as-layer
  // button) — intent is decided *before* capturing, never asked about after.
  const handleIncomingCapture = useCallback(
    (path: string | null, source: CaptureSource = "other", asLayer = false) => {
      if (path && asLayer && useEditor.getState().hasImage) {
        // Archive BEFORE the overlay path: it reads the file with
        // `consumeTemp: true`, after which Rust deletes the temp and there is
        // nothing left to copy.
        void archiveIncoming(path, source).finally(() => addCaptureAsOverlay(path));
        return;
      }
      if (path) void archiveIncoming(path, source);
      switch (routeIncomingCapture(path)) {
        case "clear":
          if (wsConfig.enabled) {
            useWorkspaces.getState().clearActive();
            return;
          }
          void applyFile(null);
          return;
        case "base":
          if (wsConfig.enabled && path) {
            void (async () => {
              const ws = useWorkspaces.getState();
              const wasFull = ws.order.length >= wsConfig.max;
              const hadActive = ws.activeId !== null;
              await ws.adoptCapture(path, source, wsConfig.onCapture, wsConfig.max);
              // Both paths discard a document; say so, with a way back. No
              // modal — a capture has to stay a single keystroke.
              if (wsConfig.onCapture === "replace" && hadActive) {
                undoToast("Workspace replaced");
              } else if (wasFull) {
                undoToast("Oldest workspace closed to make room");
              }
            })();
            return;
          }
          void applyFile(path, source);
          return;
      }
    },
    [applyFile, addCaptureAsOverlay, wsConfig, undoToast, archiveIncoming],
  );

  // Startup: two sources claim to know the current image — Rust's active temp
  // path and workspaces.json. When the feature is on and has any workspace,
  // the store wins and useWorkspaceSession does the loading; otherwise this is
  // unchanged from the single-workspace behaviour.
  const startupAdoptedRef = useRef(false);
  useEffect(() => {
    if (!configReady || startupAdoptedRef.current) return;
    startupAdoptedRef.current = true;
    (async () => {
      if (wsConfig.enabled) {
        await useWorkspaces.getState().init(true);
        if (useWorkspaces.getState().order.length > 0) return;
      }
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string | null>("editor_current_image");
      if (!path) return;
      if (wsConfig.enabled) {
        await useWorkspaces
          .getState()
          .adoptCapture(path, "other", "new", wsConfig.max);
        return;
      }
      await applyFile(path);
    })();
  }, [applyFile, configReady, wsConfig.enabled, wsConfig.max]);

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

  // Read through a ref so this subscribes exactly once. Depending on the
  // callback would re-run the effect whenever settings load (validateConfig
  // rebuilds every section, so `config.workspaces` gets a new identity) — and
  // re-running it while `listen()` is still pending leaks the old listener,
  // which is how one capture ended up creating two workspaces.
  const captureHandlerRef = useRef(handleIncomingCapture);
  useEffect(() => {
    captureHandlerRef.current = handleIncomingCapture;
  }, [handleIncomingCapture]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const stop = await listen<
        string | { path: string; source?: CaptureSource; asLayer?: boolean }
      >(
        "editor:load-image",
        (e) => {
          // Payload is `{ path, source, asLayer }`; tolerate a bare string (legacy).
          const p = e.payload;
          if (typeof p === "string") {
            captureHandlerRef.current(p);
          } else {
            captureHandlerRef.current(p.path, p.source ?? "other", p.asLayer ?? false);
          }
          setView("editor");
        },
      );
      // Unmounted while listen() was in flight: the cleanup below ran with
      // nothing to call, so retire the listener here instead of leaking it.
      if (cancelled) stop();
      else unlisten = stop;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const stop = await listen("editor:clear", () => {
        // "Clear workspace" empties the canvas but keeps the tile — closing a
        // workspace is the tile's ✕. See docs/design/MULTI-WORKSPACE.md §6.2.
        if (useSettings.getState().config.workspaces.enabled) {
          useWorkspaces.getState().clearActive();
          return;
        }
        void applyFile(null);
      });
      if (cancelled) stop();
      else unlisten = stop;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [applyFile]);

  // Deep-link from tray/Rust/toast: open settings view, optionally focus a tab.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const { listen, emit } = await import("@tauri-apps/api/event");
      const stop = await listen<string | null>("editor:show-settings", (e) => {
        setView("settings");
        const tab = e.payload;
        if (typeof tab === "string" && tab.length > 0) {
          void emit("settings:focus-tab", tab);
        }
      });
      if (cancelled) stop();
      else unlisten = stop;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Deep-link: open onboarding view (first launch + Settings "Re-run").
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const stop = await listen("editor:show-onboarding", () => {
        setView("onboarding");
      });
      if (cancelled) stop();
      else unlisten = stop;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const stop = await win.onCloseRequested((e) => {
        e.preventDefault();
        void (async () => {
          // Get the current workspace onto disk before anything else. The
          // periodic commit is debounced, so without this the last strokes
          // before a close can be lost.
          const ws = useWorkspaces.getState();
          ws.commitActive();
          await ws.flushPersist();
          const { runPreCloseAction } = await import("@/lib/preClose");
          await runPreCloseAction();
          await win.hide();
        })();
      });
      if (cancelled) stop();
      else unlisten = stop;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
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
        if (useEditor.getState().hasImage) {
          // Canvas already has a base image: layer the clipboard image as a
          // movable overlay object on top.
          const dataUrl = await invoke<string>("read_clipboard_image_data_url");
          const { addOverlayImage } = await import("@/lib/addImage");
          const id = await addOverlayImage(dataUrl);
          if (!id) toast.error("Couldn't add clipboard image");
        } else {
          // Empty canvas: the pasted image becomes the base.
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
  // imports it — base image on an empty canvas, overlay on a non-empty one.
  // Non-image drops are rejected with a toast. OS drops arrive as Tauri
  // drag-drop events because the editor window has drag_drop_enabled.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const stop = await getCurrentWebview().onDragDropEvent((event) => {
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
      if (cancelled) stop();
      else unlisten = stop;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
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
        <Toolbar
          onOpenSettings={() => setView("settings")}
          onNewWorkspace={
            wsConfig.enabled
              ? () => useWorkspaces.getState().createEmpty(wsConfig.max)
              : undefined
          }
        />
      )}
      <main
        className="relative flex min-h-0 flex-1 overflow-hidden"
        style={view === "editor" ? { backgroundColor: "var(--bg-canvas)" } : undefined}
      >
        <div id="canvas-area" className="relative min-w-0 flex-1">
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
          {view === "editor" && <CanvasDropHint />}
        </div>
        {/* Right sidebar. Three panels live here at once, each in its own
            container, and the tab bar decides which is on screen — they are
            hidden rather than unmounted so a half-dragged slider or a scrolled
            history list survives a trip to another tab. Toolbar and EditorStage
            portal into the canvas and tool containers respectively. */}
        <aside
          aria-label="Sidebar"
          className="flex h-full w-60 flex-none flex-col border-l border-[var(--border)] bg-[var(--surface-overlay)]"
        >
          {/* The hairline lives on this wrapper, not the tablist, so it spans
              the full sidebar width and reads as a divider rather than an
              underline that stops short at the padding. */}
          <div className="flex-none border-b border-[var(--border)] px-3 pt-1">
            <SidebarTabs
              active={activeTab}
              toolPanel={toolPanel}
              onSelect={onSelectTab}
            />
          </div>
          <div
            id="sidebar-panel-canvas"
            role="tabpanel"
            hidden={activeTab !== "canvas"}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
          >
            <div id="sidebar-canvas-slot" />
          </div>
          <div
            id="sidebar-panel-history"
            role="tabpanel"
            hidden={activeTab !== "history"}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
          >
            {historyConfig.enabled ? (
              <CaptureHistorySection
                hasImage={!!file}
                onDropFile={onHistoryDrop}
              />
            ) : (
              <HistoryOffNotice onOpenSettings={() => setView("settings")} />
            )}
          </div>
          <div
            id="sidebar-panel-tool"
            role="tabpanel"
            hidden={activeTab !== "tool"}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
          >
            <div id="tool-options-slot" />
          </div>
        </aside>
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
      {wsConfig.enabled && view === "editor" && (
        <WorkspaceBar
          max={wsConfig.max}
          onNew={() => useWorkspaces.getState().createEmpty(wsConfig.max)}
        />
      )}
      <Toaster
        theme="dark"
        position="bottom-center"
        closeButton
        visibleToasts={1}
      />
      <InertGrantRecoveryDialog
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
      />
    </div>
  );
}

/**
 * What the History tab shows when the feature is switched off.
 *
 * The tab is present either way on purpose: capture history ships off, and a
 * setting nobody can see is a setting nobody turns on. This is where they find
 * out it exists.
 */
function HistoryOffNotice({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="grid justify-items-center gap-2 px-2 py-6 text-center">
      <span className="text-xs text-[var(--fg-2)]">History is off</span>
      <span className="text-[11px] leading-relaxed text-[var(--fg-4)]">
        Turn it on to keep a list of the screenshots you export, and optionally a
        copy of every capture.
      </span>
      <button
        type="button"
        className="btn btn--secondary btn--sm mt-1"
        onClick={() => {
          onOpenSettings();
          void import("@tauri-apps/api/event").then(({ emit }) =>
            emit("settings:focus-tab", "general"),
          );
        }}
      >
        Open history settings
      </button>
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
