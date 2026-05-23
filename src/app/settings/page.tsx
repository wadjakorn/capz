"use client";

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Toaster, toast } from "sonner";
import { useNoticeListener } from "@/lib/notice";
import { useUpdateCheckListener } from "@/lib/updater";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { HotkeyRecorder } from "@/components/settings/HotkeyRecorder";
import { OutputPrefsForm } from "@/components/settings/OutputPrefsForm";
import { useSettings } from "@/stores/settings";
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";

async function applyHotkey(
  update: ReturnType<typeof useSettings.getState>["update"],
  patch: { captureFull?: string; captureArea?: string; captureWindow?: string },
) {
  await update("hotkeys", patch);
  try {
    await invoke("reregister_shortcuts");
  } catch (e) {
    console.error("reregister_shortcuts failed", e);
  }
}

export default function SettingsPage() {
  const { config, ready, init, update } = useSettings();
  const configSig = JSON.stringify(config);
  const firstSig = useRef<string | null>(null);

  useNoticeListener();
  useUpdateCheckListener();

  useEffect(() => {
    init();
  }, [init]);

  // Sync autostart toggle from OS (source of truth) once settings are ready.
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
    // run only once after ready becomes true
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
    toast.success("Saved", { duration: 1400 });
  }, [configSig, ready]);

  if (!ready) {
    return (
      <main className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>
      <Toaster theme="dark" position="top-right" richColors closeButton />
      <Tabs defaultValue="shortcuts">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
          <TabsTrigger value="pins">Pins</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="updates">Updates</TabsTrigger>
          <TabsTrigger value="debug">Debug</TabsTrigger>
        </TabsList>

        <TabsContent value="shortcuts" className="grid gap-4 pt-4">
          <div className="grid gap-2">
            <Label>Capture full screen</Label>
            <HotkeyRecorder
              value={config.hotkeys.captureFull}
              onChange={(v) => applyHotkey(update, { captureFull: v })}
            />
          </div>
          <div className="grid gap-2">
            <Label>Capture area</Label>
            <HotkeyRecorder
              value={config.hotkeys.captureArea}
              onChange={(v) => applyHotkey(update, { captureArea: v })}
            />
          </div>
          <div className="grid gap-2">
            <Label>Capture window</Label>
            <HotkeyRecorder
              value={config.hotkeys.captureWindow}
              onChange={(v) => applyHotkey(update, { captureWindow: v })}
            />
          </div>
        </TabsContent>

        <TabsContent value="output" className="pt-4">
          <OutputPrefsForm />
        </TabsContent>

        <TabsContent value="pins" className="grid gap-4 pt-4">
          <div className="grid gap-2">
            <Label>Continuity</Label>
            <div className="flex items-center gap-2">
              <Switch
                checked={config.pins.continuityMode === "continue"}
                onCheckedChange={(v) =>
                  update("pins", { continuityMode: v ? "continue" : "reset" })
                }
              />
              <span className="text-sm">
                {config.pins.continuityMode === "continue"
                  ? "Continue numbering across captures"
                  : "Reset each capture"}
              </span>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Default start number</Label>
            <Input
              type="number"
              min={0}
              value={config.pins.defaultStartNumber}
              onChange={(e) =>
                update("pins", { defaultStartNumber: Number(e.target.value) })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Default color</Label>
            <Input
              type="color"
              value={config.pins.defaultColor}
              onChange={(e) => update("pins", { defaultColor: e.target.value })}
              className="h-10 w-20 p-1"
            />
          </div>
          <div className="grid gap-2">
            <Label>Default size (px)</Label>
            <Input
              type="number"
              min={12}
              max={128}
              value={config.pins.defaultSize}
              onChange={(e) => update("pins", { defaultSize: Number(e.target.value) })}
            />
          </div>
        </TabsContent>

        <TabsContent value="tools" className="grid gap-4 pt-4">
          <div className="grid gap-2">
            <Label>Rect stroke color</Label>
            <Input
              type="color"
              value={config.tools.rect.strokeColor}
              onChange={(e) =>
                update("tools", { rect: { strokeColor: e.target.value, strokeWidth: config.tools.rect.strokeWidth } })
              }
              className="h-10 w-20 p-1"
            />
          </div>
          <div className="grid gap-2">
            <Label>Rect stroke width (px)</Label>
            <Input
              type="number"
              min={1}
              max={32}
              value={config.tools.rect.strokeWidth}
              onChange={(e) =>
                update("tools", { rect: { strokeColor: config.tools.rect.strokeColor, strokeWidth: Number(e.target.value) } })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Arrow stroke color</Label>
            <Input
              type="color"
              value={config.tools.arrow.strokeColor}
              onChange={(e) =>
                update("tools", { arrow: { strokeColor: e.target.value, strokeWidth: config.tools.arrow.strokeWidth } })
              }
              className="h-10 w-20 p-1"
            />
          </div>
          <div className="grid gap-2">
            <Label>Arrow stroke width (px)</Label>
            <Input
              type="number"
              min={1}
              max={32}
              value={config.tools.arrow.strokeWidth}
              onChange={(e) =>
                update("tools", { arrow: { strokeColor: config.tools.arrow.strokeColor, strokeWidth: Number(e.target.value) } })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Text font size (px)</Label>
            <Input
              type="number"
              min={8}
              max={128}
              value={config.tools.text.fontSize}
              onChange={(e) =>
                update("tools", {
                  text: { fontSize: Number(e.target.value), color: config.tools.text.color },
                })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Text color</Label>
            <Input
              type="color"
              value={config.tools.text.color}
              onChange={(e) =>
                update("tools", {
                  text: { fontSize: config.tools.text.fontSize, color: e.target.value },
                })
              }
              className="h-10 w-20 p-1"
            />
          </div>
          <div className="grid gap-2">
            <Label>Blur radius (px)</Label>
            <Input
              type="number"
              min={2}
              max={64}
              value={config.tools.blur.blurRadius}
              onChange={(e) =>
                update("tools", { blur: { blurRadius: Number(e.target.value) } })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Sticker size (px)</Label>
            <Input
              type="number"
              min={12}
              max={256}
              value={config.tools.sticker.fontSize}
              onChange={(e) =>
                update("tools", { sticker: { fontSize: Number(e.target.value) } })
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="updates" className="grid gap-4 pt-4">
          <UpdatesTab />
        </TabsContent>

        <TabsContent value="debug" className="grid gap-3 pt-4">
          <CaptureDebug />
        </TabsContent>

        <TabsContent value="general" className="grid gap-4 pt-4">
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
            label="Copy to clipboard after save"
            checked={config.general.copyToClipboardAfterSave}
            onChange={(v) => update("general", { copyToClipboardAfterSave: v })}
          />
          <ToggleRow
            label="Remember last tool/color/size between captures"
            checked={config.general.rememberLastTool}
            onChange={(v) => update("general", { rememberLastTool: v })}
          />
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
          <div className="flex items-center justify-between border-t pt-4">
            <div className="grid gap-0.5">
              <Label>Re-run onboarding</Label>
              <span className="text-xs text-muted-foreground">
                Opens the welcome / permissions flow again.
              </span>
            </div>
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
              className="rounded border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Re-run
            </button>
          </div>
          <AboutRow />
        </TabsContent>
      </Tabs>
    </main>
  );
}

type MonitorInfo = {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale_factor: number;
  is_primary: boolean;
};

function CaptureDebug() {
  const [out, setOut] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(true);
    try {
      const r = await fn();
      setOut(`${label} →\n${typeof r === "string" ? r : JSON.stringify(r, null, 2)}`);
    } catch (e) {
      setOut(`${label} ERROR: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded border px-3 py-1.5 text-sm hover:bg-muted"
          disabled={busy}
          onClick={() => run("list_monitors", () => invoke<MonitorInfo[]>("list_monitors_command"))}
        >
          list_monitors
        </button>
        <button
          className="rounded border px-3 py-1.5 text-sm hover:bg-muted"
          disabled={busy}
          onClick={() => run("capture_full", () => invoke<string>("capture_full_command"))}
        >
          capture_full
        </button>
        <button
          className="rounded border px-3 py-1.5 text-sm hover:bg-muted"
          disabled={busy}
          onClick={async () => {
            const mons = await invoke<MonitorInfo[]>("list_monitors_command");
            const id = mons[0]?.id;
            if (id == null) return setOut("no monitors");
            await run("capture_region", () =>
              invoke<string>("capture_region_command", {
                monitorId: id,
                x: 0,
                y: 0,
                w: 400,
                h: 300,
              }),
            );
          }}
        >
          capture_region (0,0 400x300)
        </button>
      </div>
      <pre className="rounded bg-muted p-2 text-xs whitespace-pre-wrap break-all min-h-[6rem]">
        {out || "click a button…"}
      </pre>
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
      <div className="grid gap-2">
        <Label>Check interval</Label>
        <select
          className="rounded border bg-background px-2 py-1.5 text-sm"
          value={u.checkIntervalHours}
          onChange={(e) =>
            update("updates", { checkIntervalHours: Number(e.target.value) })
          }
        >
          <option value={6}>Every 6 hours</option>
          <option value={24}>Every 24 hours</option>
          <option value={168}>Every 7 days</option>
        </select>
      </div>
      <div className="flex items-center justify-between border-t pt-4">
        <div className="grid gap-0.5">
          <Label>Last checked</Label>
          <span className="text-xs text-muted-foreground">{lastChecked}</span>
        </div>
        <button
          type="button"
          onClick={onCheckNow}
          disabled={checking}
          className="rounded border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          {checking ? "Checking…" : "Check now"}
        </button>
      </div>
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
    <div className="flex items-center justify-between border-t pt-4">
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
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
