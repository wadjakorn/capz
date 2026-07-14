"use client";

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { TabsContent } from "@/components/ui/tabs";
import {
  Keyboard,
  Download,
  Settings as SettingsIcon,
  RefreshCw,
  Smile,
  type LucideIcon,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { HotkeyRecorder } from "@/components/settings/HotkeyRecorder";
import { statusMessage, type RegoResult, type HotkeyAction } from "@/lib/shortcuts";
import { OutputPrefsForm } from "@/components/settings/OutputPrefsForm";
import { StickersForm } from "@/components/settings/StickersForm";
import { useSettings } from "@/stores/settings";
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";

type HotkeyPatch = {
  captureFull?: string;
  captureArea?: string;
  captureWindow?: string;
  captureScroll?: string;
  showEditor?: string;
  commandRing?: string;
};

const HOTKEY_LABELS: Record<keyof HotkeyPatch, string> = {
  captureFull: "Capture full screen",
  captureArea: "Capture area",
  captureWindow: "Capture window",
  captureScroll: "Scrolling capture",
  showEditor: "Show editor",
  commandRing: "Command ring",
};

async function applyHotkey(
  getState: typeof useSettings.getState,
  update: ReturnType<typeof useSettings.getState>["update"],
  patch: HotkeyPatch,
) {
  const prev = { ...getState().config.hotkeys };
  const next = { ...prev, ...patch } as Record<keyof HotkeyPatch, string>;

  const changedKey = Object.keys(patch)[0] as keyof HotkeyPatch | undefined;
  const newAccel = changedKey ? patch[changedKey] : undefined;
  if (changedKey && newAccel) {
    const clash = (Object.keys(next) as (keyof HotkeyPatch)[]).find(
      (k) => k !== changedKey && next[k] === newAccel,
    );
    if (clash) {
      toast.error(`${newAccel} already used by "${HOTKEY_LABELS[clash]}"`, {
        id: "hotkey-clash",
      });
      return;
    }
  }

  await update("hotkeys", patch);
  let report: RegoResult[] = [];
  try {
    const res = await invoke<RegoResult[]>("reregister_shortcuts");
    if (Array.isArray(res)) report = res;
  } catch (e) {
    console.error("reregister_shortcuts failed", e);
  }
  const mine = report.find((r) => r.action === (changedKey as HotkeyAction));
  if (mine && mine.status !== "ok") {
    await update("hotkeys", prev);
    await invoke("reregister_shortcuts").catch((e) =>
      console.error("reregister_shortcuts (revert) failed", e),
    );
    toast.error(statusMessage(mine.requested, mine.status) ?? "Could not register shortcut", {
      id: "hotkey-register-failed",
    });
  }
}

const TAB_VALUES = ["shortcuts", "output", "stickers", "general", "updates"] as const;
type TabValue = (typeof TAB_VALUES)[number];

type TabDef = {
  value: TabValue;
  label: string;
  icon: LucideIcon;
  tone: "violet" | "emerald" | "rose" | "amber" | "sky" | "cyan" | "fuchsia";
};

const TABS: TabDef[] = [
  { value: "shortcuts", label: "Shortcuts", icon: Keyboard, tone: "violet" },
  { value: "output", label: "Output", icon: Download, tone: "emerald" },
  { value: "stickers", label: "Stickers", icon: Smile, tone: "amber" },
  { value: "general", label: "General", icon: SettingsIcon, tone: "sky" },
  { value: "updates", label: "Updates", icon: RefreshCw, tone: "cyan" },
];

type SettingsViewProps = {
  onOpenInertRecovery?: () => void;
};

const IS_MAC =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

export function SettingsView({ onOpenInertRecovery }: SettingsViewProps = {}) {
  const { config, ready, init, update, reset } = useSettings();
  const configSig = JSON.stringify(config);
  const firstSig = useRef<string | null>(null);
  const [tab, setTab] = useState<TabValue>("shortcuts");

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<string>("settings:focus-tab", (e) => {
        const v = e.payload as TabValue;
        if ((TAB_VALUES as readonly string[]).includes(v)) setTab(v);
      });
    })();
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const on = await isAutostartEnabled();
        if (on !== config.general.autostart) {
          await update("general", { autostart: on });
        }
      } catch (e) {
        console.warn("autostart isEnabled failed", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function applyAutostart(v: boolean) {
    try {
      if (v) await enableAutostart();
      else await disableAutostart();
      await update("general", { autostart: v });
    } catch (e) {
      console.error("autostart toggle failed", e);
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (firstSig.current === null) {
      firstSig.current = configSig;
      return;
    }
    if (configSig === firstSig.current) return;
    firstSig.current = configSig;
    const t = setTimeout(() => {
      toast.success("Saved", { id: "settings-saved", duration: 1400 });
    }, 400);
    return () => clearTimeout(t);
  }, [configSig, ready]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const activeTab = TABS.find((t) => t.value === tab) ?? TABS[0];

  return (
    <div className="min-h-full px-6 py-8 text-foreground">
      <TabsPrimitive.Root
        value={tab}
        onValueChange={(v) => setTab(v as TabValue)}
        orientation="vertical"
        className="mx-auto flex w-full max-w-5xl gap-6"
      >
        <TabsPrimitive.List className="flex shrink-0 flex-col gap-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsPrimitive.Tab
                key={t.value}
                value={t.value}
                className="btn-icon"
                title={t.label}
                aria-label={t.label}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </TabsPrimitive.Tab>
            );
          })}
        </TabsPrimitive.List>

        <main className="surface min-w-0 flex-1 p-8">
          <header className="mb-6 flex items-center gap-4">
            <div className="tile-icon h-14 w-14">
              <activeTab.icon className="h-6 w-6" aria-hidden />
            </div>
            <h1 className="headline">{activeTab.label}</h1>
          </header>

          <TabsContent value="shortcuts" className="grid gap-4">
            <SectionCard>
              <FieldRow label="Capture full screen">
                <HotkeyRecorder
                  value={config.hotkeys.captureFull}
                  onChange={(v) =>
                    applyHotkey(useSettings.getState, update, { captureFull: v })
                  }
                />
              </FieldRow>
              <FieldRow label="Capture area">
                <HotkeyRecorder
                  value={config.hotkeys.captureArea}
                  onChange={(v) =>
                    applyHotkey(useSettings.getState, update, { captureArea: v })
                  }
                />
              </FieldRow>
              <FieldRow label="Capture window">
                <HotkeyRecorder
                  value={config.hotkeys.captureWindow}
                  onChange={(v) =>
                    applyHotkey(useSettings.getState, update, { captureWindow: v })
                  }
                />
              </FieldRow>
              <FieldRow label="Scrolling capture">
                <HotkeyRecorder
                  value={config.hotkeys.captureScroll}
                  clearable
                  onChange={(v) =>
                    applyHotkey(useSettings.getState, update, { captureScroll: v })
                  }
                />
              </FieldRow>
              <FieldRow label="Show editor">
                <HotkeyRecorder
                  value={config.hotkeys.showEditor}
                  onChange={(v) =>
                    applyHotkey(useSettings.getState, update, { showEditor: v })
                  }
                />
              </FieldRow>
              <FieldRow label="Command ring">
                <HotkeyRecorder
                  value={config.hotkeys.commandRing}
                  onChange={(v) =>
                    applyHotkey(useSettings.getState, update, { commandRing: v })
                  }
                />
              </FieldRow>
            </SectionCard>
          </TabsContent>

          <TabsContent value="output">
            <SectionCard>
              <OutputPrefsForm />
            </SectionCard>
          </TabsContent>

          <TabsContent value="stickers">
            <SectionCard>
              <StickersForm />
            </SectionCard>
          </TabsContent>

          <TabsContent value="updates" className="grid gap-4">
            <SectionCard>
              <UpdatesTab />
            </SectionCard>
          </TabsContent>

          <TabsContent value="general" className="grid gap-4">
            <SectionCard>
              <FieldRow
                label="Appearance"
                hint="Color theme for all capz windows. System follows your OS setting."
              >
                <select
                  className="field"
                  value={config.general.theme}
                  onChange={(e) =>
                    update("general", {
                      theme: e.target.value as "light" | "dark" | "system",
                    })
                  }
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                </select>
              </FieldRow>
              <ToggleRow
                label="Launch at login"
                checked={config.general.autostart}
                onChange={applyAutostart}
              />
              <ToggleRow
                label="Play sound on capture"
                checked={config.general.playSoundOnCapture}
                onChange={(v) => update("general", { playSoundOnCapture: v })}
              />
              <ToggleRow
                label="Remember last tool/color/size between captures"
                checked={config.general.rememberLastTool}
                onChange={(v) => update("general", { rememberLastTool: v })}
              />
              <ToggleRow
                label="Show rulers in editor"
                checked={config.general.showRulers}
                onChange={(v) => update("general", { showRulers: v })}
              />
              <ToggleRow
                label="Snap to edges and other elements (hold Alt to bypass)"
                checked={config.general.snapEnabled}
                onChange={(v) => update("general", { snapEnabled: v })}
              />
              <FieldRow
                label="Canvas background"
                hint="Flush fill shown through transparent images. When elements overflow the image edges, the exposed area uses the backdrop gradient/solid instead. Applies on-screen and in exports."
              >
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Canvas background color"
                    value={config.general.canvasBackground}
                    onChange={(e) =>
                      update("general", { canvasBackground: e.target.value })
                    }
                    className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-white/[0.06] p-0.5"
                  />
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      update("general", { canvasBackground: "#ffffff" })
                    }
                  >
                    Reset
                  </button>
                </div>
              </FieldRow>
              <FieldRow
                label="Auto-add backdrop"
                hint="Start the padded gradient/solid backdrop on automatically for these capture types. You can still toggle it per image in the editor."
              >
                <div className="flex flex-col gap-1.5">
                  {(
                    [
                      ["autoForFull", "Full screen"],
                      ["autoForArea", "Area"],
                      ["autoForWindow", "Window"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-sm text-foreground"
                    >
                      <input
                        type="checkbox"
                        checked={config.general.backdrop[key]}
                        onChange={(e) =>
                          update("general", {
                            backdrop: {
                              ...config.general.backdrop,
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </FieldRow>
              <FieldRow
                label="On editor close/hide"
                hint="Run an export action when the editor window is closed or Esc-hidden."
              >
                <select
                  className="field"
                  value={config.general.closeAction}
                  onChange={(e) =>
                    update("general", {
                      closeAction: e.target.value as "none" | "copy" | "file" | "both",
                    })
                  }
                >
                  <option value="none">Nothing</option>
                  <option value="copy">Copy to clipboard</option>
                  <option value="file">Save to file</option>
                  <option value="both">Save & Copy</option>
                </select>
              </FieldRow>
              <ToggleRow
                label="Editor window always on top"
                checked={config.general.alwaysOnTopEditor}
                onChange={async (v) => {
                  await update("general", { alwaysOnTopEditor: v });
                  try {
                    await invoke("set_editor_always_on_top", { on: v });
                  } catch (e) {
                    console.error("set_editor_always_on_top failed", e);
                  }
                }}
              />
              <FieldRow
                label="Editor window default size"
                hint="Initial width × height (px). Applies the next time the editor opens. Min 1024 × 680."
              >
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1024}
                    step={8}
                    value={config.general.editorWindow.width}
                    onChange={(e) => {
                      const w = Math.max(1024, parseInt(e.target.value, 10) || 1024);
                      update("general", {
                        editorWindow: { width: w, height: config.general.editorWindow.height },
                      });
                    }}
                    className="field w-20 text-center"
                  />
                  <span className="text-xs text-muted-foreground">×</span>
                  <input
                    type="number"
                    min={680}
                    step={8}
                    value={config.general.editorWindow.height}
                    onChange={(e) => {
                      const h = Math.max(680, parseInt(e.target.value, 10) || 680);
                      update("general", {
                        editorWindow: { width: config.general.editorWindow.width, height: h },
                      });
                    }}
                    className="field w-20 text-center"
                  />
                </div>
              </FieldRow>
              <FieldRow
                label="Re-run onboarding"
                hint="Opens the welcome / permissions flow again."
              >
                <button
                  type="button"
                  onClick={async () => {
                    await update("general", { onboardingCompleted: false });
                    try {
                      await invoke("show_onboarding_window");
                    } catch (e) {
                      console.error("show_onboarding_window failed", e);
                    }
                  }}
                  className="btn btn--secondary"
                >
                  Re-run
                </button>
              </FieldRow>
              {IS_MAC && onOpenInertRecovery && (
                <FieldRow
                  label="Fix permission after macOS update"
                  hint="Walks through removing the stale TCC entry, relaunching, and re-granting."
                >
                  <button
                    type="button"
                    onClick={onOpenInertRecovery}
                    className="btn btn--secondary"
                  >
                    Fix…
                  </button>
                </FieldRow>
              )}
              <FieldRow
                label="Reset settings"
                hint="Restore every setting to its default. Cannot be undone."
              >
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm("Reset all settings to defaults?")) return;
                    await reset();
                    toast.success("Settings reset", { duration: 1600 });
                  }}
                  className="btn btn--secondary text-rose-300 hover:text-rose-200"
                >
                  Reset…
                </button>
              </FieldRow>
              <AboutRow />
            </SectionCard>
          </TabsContent>
        </main>
      </TabsPrimitive.Root>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 rounded-2xl border border-border bg-foreground/[0.03] p-5">
      {children}
    </div>
  );
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid max-w-md gap-0.5">
        <Label className="text-foreground">{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

function UpdatesTab() {
  const { config, update } = useSettings();
  const [checking, setChecking] = useState(false);
  const u = config.updates;

  const lastChecked = u.lastCheckedAt
    ? new Date(u.lastCheckedAt).toLocaleString()
    : "never";

  async function onCheckNow() {
    setChecking(true);
    try {
      const { checkForUpdates, promptAndInstall } = await import("@/lib/updater");
      const r = await checkForUpdates();
      if (r.kind === "none") toast("You are on the latest version.");
      else if (r.kind === "error") toast.error("Update check failed", { description: r.error });
      else await promptAndInstall(r);
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <ToggleRow
        label="Automatically check for updates"
        checked={u.autoCheck}
        onChange={(v) => update("updates", { autoCheck: v })}
      />
      <FieldRow label="Check interval">
        <select
          className="field"
          value={u.checkIntervalHours}
          onChange={(e) =>
            update("updates", { checkIntervalHours: Number(e.target.value) })
          }
        >
          <option value={6}>Every 6 hours</option>
          <option value={24}>Every 24 hours</option>
          <option value={168}>Every 7 days</option>
        </select>
      </FieldRow>
      <FieldRow label="Last checked" hint={lastChecked}>
        <button
          type="button"
          onClick={onCheckNow}
          disabled={checking}
          className="btn btn--secondary"
        >
          {checking ? "Checking…" : "Check now"}
        </button>
      </FieldRow>
      {u.skippedVersion && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Skipped version: {u.skippedVersion}</span>
          <button
            type="button"
            onClick={() => update("updates", { skippedVersion: null })}
            className="underline hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}
    </>
  );
}

function AboutRow() {
  const [info, setInfo] = useState<{ app: string; tauri: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { getVersion, getTauriVersion } = await import("@tauri-apps/api/app");
        const [app, tauri] = await Promise.all([getVersion(), getTauriVersion()]);
        setInfo({ app, tauri });
      } catch (e) {
        console.warn("about info failed", e);
      }
    })();
  }, []);

  return (
    <div className="flex items-center justify-between border-t border-border pt-4">
      <div className="grid gap-0.5">
        <Label>About capz</Label>
        <span className="text-xs text-muted-foreground">
          {info
            ? `v${info.app} · Tauri ${info.tauri} · ${navigator.platform}`
            : "loading…"}
        </span>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-foreground">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
