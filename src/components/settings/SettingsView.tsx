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
import {
  statusMessage,
  currentPlatform,
  type RegoResult,
  type HotkeyAction,
} from "@/lib/shortcuts";
import { OutputPrefsForm } from "@/components/settings/OutputPrefsForm";
import { StickersForm } from "@/components/settings/StickersForm";
import { useSettings } from "@/stores/settings";
import { useHistory } from "@/stores/history";
import {
  ARCHIVE_BUDGET_OPTIONS_MB,
  HISTORY_MAX_OPTIONS,
  WORKSPACE_MAX_RANGE,
} from "@/lib/config";
import {
  MACOS_ONLY_RING_MODES,
  RING_MAX_MODES,
  RING_MIN_MODES,
  RING_MODE_IDS,
  RING_MODE_LABELS,
  type RingWedge,
} from "@/lib/commandRing";
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
  captureSystemArea?: string;
  showEditor?: string;
  commandRing?: string;
  commandRingV2?: string;
};

const HOTKEY_LABELS: Record<keyof HotkeyPatch, string> = {
  captureFull: "Capture full screen",
  captureArea: "Capture area",
  captureWindow: "Capture window",
  captureScroll: "Scrolling capture",
  captureSystemArea: "System area capture (macOS)",
  showEditor: "Show editor",
  commandRing: "Command ring",
  commandRingV2: "Command ring (hold)",
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

/** A specific setting to open on, rather than the default tab. */
export type SettingsFocus = "history";

type SettingsViewProps = {
  onOpenInertRecovery?: () => void;
  /**
   * Open straight at a particular setting.
   *
   * A prop rather than an event on purpose: the editor page renders this
   * component, so it can simply say where to open. Routing that through
   * `settings:focus-tab` meant emitting into a listener that had not been
   * registered yet — the view mounts and then awaits two dynamic imports before
   * it subscribes — so the message was dropped and the user landed on the
   * default tab. The event listener stays for the tray/Rust deep link, which is
   * genuinely cross-window.
   */
  focus?: SettingsFocus | null;
};

const IS_MAC = currentPlatform() === "mac";

/** Which tab holds a given focus target. */
const FOCUS_TAB: Record<SettingsFocus, TabValue> = { history: "general" };

export function SettingsView({ onOpenInertRecovery, focus }: SettingsViewProps = {}) {
  const { config, ready, init, update, reset } = useSettings();
  const configSig = JSON.stringify(config);
  const firstSig = useRef<string | null>(null);
  // Seeded from `focus` so the correct tab is on screen in the first render,
  // with no flash of the default.
  const [tab, setTab] = useState<TabValue>(() =>
    focus ? FOCUS_TAB[focus] : "shortcuts",
  );
  const historyCardRef = useRef<HTMLDivElement>(null);

  // Landing on the right tab is not enough: the history card is at the bottom
  // of a long General tab, so without this the user arrives above the fold and
  // has to go looking for what they asked for.
  useEffect(() => {
    if (focus !== "history" || !ready) return;
    const id = requestAnimationFrame(() =>
      historyCardRef.current?.scrollIntoView({ block: "center" }),
    );
    return () => cancelAnimationFrame(id);
  }, [focus, ready]);

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
              {IS_MAC && (
                <FieldRow label="System area capture (macOS)">
                  <HotkeyRecorder
                    value={config.hotkeys.captureSystemArea}
                    onChange={(v) =>
                      applyHotkey(useSettings.getState, update, {
                        captureSystemArea: v,
                      })
                    }
                  />
                </FieldRow>
              )}
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
              <FieldRow
                label="Command ring"
                hint="Press once — the ring opens and takes focus; click a mode."
              >
                <HotkeyRecorder
                  value={config.hotkeys.commandRing}
                  onChange={(v) =>
                    applyHotkey(useSettings.getState, update, { commandRing: v })
                  }
                />
              </FieldRow>
              <FieldRow
                label="Command ring (hold)"
                hint="Alt+tab style: hold the modifiers and tap to cycle, release to capture. Cycle to the cancel slot to back out. Needs at least one modifier; the app you are capturing keeps focus."
              >
                <HotkeyRecorder
                  value={config.hotkeys.commandRingV2}
                  onChange={(v) =>
                    applyHotkey(useSettings.getState, update, { commandRingV2: v })
                  }
                />
              </FieldRow>
            </SectionCard>

            <SectionCard>
              <RingModesField />
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

            <WorkspacesCard />
            <CaptureHistoryCard cardRef={historyCardRef} />
          </TabsContent>
        </main>
      </TabsPrimitive.Root>
    </div>
  );
}

function SectionCard({
  children,
  ref,
}: {
  children: React.ReactNode;
  /** Lets a caller scroll a specific card into view. */
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className="grid gap-4 rounded-2xl border border-border bg-foreground/[0.03] p-5"
    >
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

/**
 * Which capture modes occupy the hold-ring's slots (CP-0038).
 *
 * Fixed 1-4 slots: the ring cycles through the checked modes in list order,
 * clockwise from the top. Min/max are enforced here by disabling the checkbox
 * that would break them — so the user cannot reach an invalid state rather than
 * being told off after the fact. `validateConfig` re-checks on read, because a
 * hand-edited store never passes through this UI.
 */
function RingModesField() {
  const config = useSettings((s) => s.config);
  const update = useSettings((s) => s.update);
  const selected = config.ring.modes;

  // A mode this platform can't run would be a slot that never fires.
  const available = RING_MODE_IDS.filter(
    (m) => IS_MAC || !MACOS_ONLY_RING_MODES.includes(m),
  );

  // A config synced from a Mac can list `systemArea` on Windows, where it has
  // no checkbox. Counting it toward the limits would show fewer ticks than the
  // slot count claims AND block a fourth visible mode with no way to free the
  // slot — the hidden entry can't be unchecked. So the limits apply to what
  // the user can actually see and act on.
  const hidden = selected.filter((m) => !available.includes(m));
  const visible = selected.filter((m) => available.includes(m));

  const toggle = async (mode: RingWedge, checked: boolean) => {
    const nextVisible = checked ? [...visible, mode] : visible.filter((m) => m !== mode);
    if (nextVisible.length < RING_MIN_MODES || nextVisible.length > RING_MAX_MODES) return;
    // Preserve platform-hidden modes so a round-trip through this machine
    // doesn't silently strip them from the Mac's ring — but only while they
    // fit. A choice the user just made on the machine in front of them beats
    // an entry they cannot see.
    const keptHidden = hidden.slice(0, RING_MAX_MODES - nextVisible.length);
    const next = [...nextVisible, ...keptHidden];
    // Keep slots in the canonical list order so the ring layout is a function
    // of *which* modes are on it, not the order they happened to be ticked.
    const ordered = RING_MODE_IDS.filter((m) => next.includes(m));
    await update("ring", { modes: ordered });
  };

  return (
    <div className="grid gap-3">
      <div className="grid max-w-md gap-0.5">
        <Label className="text-foreground">Ring slots</Label>
        <span className="text-xs text-muted-foreground">
          Modes on the hold ring, clockwise from the top. Choose {RING_MIN_MODES}–
          {RING_MAX_MODES}; a cancel slot is always added last.
        </span>
      </div>
      <div className="grid gap-2">
        {available.map((mode) => {
          const checked = visible.includes(mode);
          // Block the toggle that would empty the ring or overfill it.
          const disabled = checked
            ? visible.length <= RING_MIN_MODES
            : visible.length >= RING_MAX_MODES;
          return (
            <label
              key={mode}
              className={`flex items-center gap-2 text-sm ${
                disabled ? "opacity-50" : "cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={checked}
                disabled={disabled}
                onChange={(e) => void toggle(mode, e.target.checked)}
              />
              <span>{RING_MODE_LABELS[mode]}</span>
            </label>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground">
        {visible.length} of {RING_MAX_MODES} slots used
        {visible.length >= RING_MAX_MODES && " — uncheck one to swap in another"}
      </span>
    </div>
  );
}


/**
 * Multiple workspaces (CP-0045).
 *
 * The two detail rows stay visible but disabled while the feature is off:
 * hiding them would make the eviction rule — the one genuinely surprising part
 * — invisible until after the user has turned the feature on and lost a
 * workspace to it.
 */
function WorkspacesCard() {
  const { config, update } = useSettings();
  const w = config.workspaces;
  const sizes: number[] = [];
  for (let n = WORKSPACE_MAX_RANGE.min; n <= WORKSPACE_MAX_RANGE.max; n++) sizes.push(n);

  return (
    <SectionCard>
      <ToggleRow
        label="Multiple workspaces"
        checked={w.enabled}
        onChange={(enabled) => update("workspaces", { enabled })}
      />
      <span className="-mt-2 text-xs text-muted-foreground">
        Keep several captures open at once and switch between them from the bar
        at the bottom of the editor. Each keeps its own annotations, crop and
        zoom, and they survive a restart.
      </span>
      <div
        className={w.enabled ? "grid gap-4" : "grid gap-4 opacity-45"}
        aria-disabled={!w.enabled}
      >
        <FieldRow label="Maximum workspaces">
          <select
            className="field"
            disabled={!w.enabled}
            value={w.max}
            onChange={(e) => update("workspaces", { max: Number(e.target.value) })}
          >
            {sizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow
          label="When a new capture arrives"
          hint={
            w.onCapture === "new"
              ? `Once all ${w.max} are used, the oldest workspace is closed. You can undo that, or switch to "Replace the current workspace" so nothing is ever closed for you.`
              : "The capture overwrites the workspace you're in. The count never changes and nothing is closed behind your back."
          }
        >
          <select
            className="field"
            disabled={!w.enabled}
            value={w.onCapture}
            onChange={(e) =>
              update("workspaces", {
                onCapture: e.target.value as "new" | "replace",
              })
            }
          >
            <option value="new">Open in a new workspace</option>
            <option value="replace">Replace the current workspace</option>
          </select>
        </FieldRow>
      </div>
    </SectionCard>
  );
}

/** Capture history (CP-0045) — desktop only; the web build has no file paths. */
function CaptureHistoryCard({
  cardRef,
}: {
  cardRef?: React.Ref<HTMLDivElement>;
}) {
  const { config, update } = useSettings();
  const h = config.history;

  return (
    <SectionCard ref={cardRef}>
      <ToggleRow
        label="Remember saved files"
        checked={h.enabled}
        onChange={(enabled) => update("history", { enabled })}
      />
      <span className="-mt-2 text-xs text-muted-foreground">
        Keep a list of the screenshots you export, with a thumbnail, so you can
        find, reuse or delete them from the editor sidebar later.
      </span>
      <div
        className={h.enabled ? "grid gap-4" : "grid gap-4 opacity-45"}
        aria-disabled={!h.enabled}
      >
        <ArchiveRows enabled={h.enabled} />
        <div className="h-px bg-border" />
        <FieldRow
          label="Keep the last"
          hint="Older entries drop off the list. The files themselves stay on your disk."
        >
          <select
            className="field"
            disabled={!h.enabled}
            value={h.max}
            onChange={(e) => {
              const max = Number(e.target.value);
              void update("history", { max });
              const dropped = useHistory.getState().trim(max);
              if (dropped > 0) {
                toast(
                  `Removed ${dropped} older ${dropped === 1 ? "entry" : "entries"} from the list`,
                  { description: "The files were not deleted." },
                );
              }
            }}
          >
            {HISTORY_MAX_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Show as">
          <select
            className="field"
            disabled={!h.enabled}
            value={h.viewMode}
            onChange={(e) =>
              update("history", { viewMode: e.target.value as "list" | "grid" })
            }
          >
            <option value="list">List</option>
            <option value="grid">Thumbnails</option>
          </select>
        </FieldRow>
        <FieldRow label="Clear the list" hint="Removes every entry. No files are deleted.">
          <button
            type="button"
            disabled={!h.enabled}
            onClick={() => {
              useHistory.getState().clear();
              toast.success("History cleared", { duration: 1600 });
            }}
            className="btn btn--secondary text-rose-300 hover:text-rose-200"
          >
            Clear list
          </button>
        </FieldRow>
      </div>
    </SectionCard>
  );
}

/**
 * The capture archive (CP-0046).
 *
 * Reads the folder itself rather than trusting a stored number: the usage line
 * is the only place a user finds out how much disk this costs, and a stale
 * figure there would be worse than none.
 */
function ArchiveRows({ enabled }: { enabled: boolean }) {
  const { config, update } = useSettings();
  const h = config.history;
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null);
  const [wiping, setWiping] = useState(false);

  const refresh = async () => {
    const { resolveSaveDirPath } = await import("@/lib/exportImage");
    const { listArchive, totalBytes } = await import("@/lib/captureArchive");
    const dir = await resolveSaveDirPath();
    if (!dir) return setUsage(null);
    const files = await listArchive(dir);
    setUsage({ count: files.length, bytes: totalBytes(files) });
  };

  useEffect(() => {
    if (h.archiveCaptures) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h.archiveCaptures, h.archiveBudgetMb]);

  return (
    <>
      <ToggleRow
        label="Also keep every capture"
        checked={h.archiveCaptures}
        onChange={(archiveCaptures) => {
          void update("history", { archiveCaptures });
          if (archiveCaptures) void refresh();
        }}
      />
      <span className="-mt-2 text-xs text-muted-foreground">
        Copies each screen capture into a <code>Captures</code> folder next to
        your saved files, so one you forgot to export is still there. Pasted
        images and files you opened are not copied — you already have those.
      </span>
      <div
        className={h.archiveCaptures && enabled ? "grid gap-4" : "grid gap-4 opacity-45"}
        aria-disabled={!h.archiveCaptures || !enabled}
      >
        <FieldRow
          label="Archive limit"
          hint="Once the folder passes this, the oldest captures are deleted. Files you exported yourself are never touched."
        >
          <select
            className="field"
            disabled={!h.archiveCaptures || !enabled}
            value={h.archiveBudgetMb}
            onChange={(e) => {
              const mb = Number(e.target.value);
              void (async () => {
                await update("history", { archiveBudgetMb: mb });
                const { resolveSaveDirPath } = await import("@/lib/exportImage");
                const { enforceBudget } = await import("@/lib/captureArchive");
                const dir = await resolveSaveDirPath();
                if (!dir) return;
                const gone = await enforceBudget(dir, mb);
                if (gone.length > 0) {
                  toast(
                    `Removed ${gone.length} older ${gone.length === 1 ? "capture" : "captures"}`,
                  );
                }
                await refresh();
              })();
            }}
          >
            {ARCHIVE_BUDGET_OPTIONS_MB.map((mb) => (
              <option key={mb} value={mb}>
                {mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow
          label="Currently using"
          hint={
            usage
              ? `${usage.count} ${usage.count === 1 ? "capture" : "captures"} in the Captures folder.`
              : "Nothing archived yet."
          }
        >
          <button
            type="button"
            disabled={!usage?.count || wiping}
            onClick={() => {
              void (async () => {
                setWiping(true);
                try {
                  const { resolveSaveDirPath } = await import("@/lib/exportImage");
                  const { deleteArchive } = await import("@/lib/captureArchive");
                  const dir = await resolveSaveDirPath();
                  if (!dir) return;
                  const n = await deleteArchive(dir);
                  toast.success(`Deleted ${n} archived ${n === 1 ? "capture" : "captures"}`);
                  await refresh();
                } finally {
                  setWiping(false);
                }
              })();
            }}
            className="btn btn--secondary text-rose-300 hover:text-rose-200"
          >
            {usage ? formatArchiveSize(usage.bytes) : "0 MB"} — Delete…
          </button>
        </FieldRow>
      </div>
    </>
  );
}

function formatArchiveSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}
