"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { HotkeyRecorder } from "@/components/settings/HotkeyRecorder";
import { OutputPrefsForm } from "@/components/settings/OutputPrefsForm";
import { useSettings } from "@/stores/settings";

async function applyHotkey(
  update: ReturnType<typeof useSettings.getState>["update"],
  patch: { captureFull?: string; captureArea?: string },
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

  useEffect(() => {
    init();
  }, [init]);

  if (!ready) {
    return (
      <main className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold mb-4">Settings</h1>
      <Tabs defaultValue="shortcuts">
        <TabsList>
          <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
          <TabsTrigger value="pins">Pins</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
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

        <TabsContent value="debug" className="grid gap-3 pt-4">
          <CaptureDebug />
        </TabsContent>

        <TabsContent value="general" className="grid gap-4 pt-4">
          <ToggleRow
            label="Launch at login"
            checked={config.general.autostart}
            onChange={(v) => update("general", { autostart: v })}
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
