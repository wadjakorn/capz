"use client";

import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Input } from "@/components/ui/input";
import {
  eventToAccelerator,
  formatShortcut,
  validateAccelerator,
  statusMessage,
  type HotkeyProbe,
} from "@/lib/shortcuts";

type Props = {
  value: string;
  onChange: (accel: string) => void;
  /** Show a Clear button to unbind the shortcut (empty string). */
  clearable?: boolean;
};

export function HotkeyRecorder({ value, onChange, clearable = false }: Props) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const suspended = useRef(false);

  async function suspend() {
    if (suspended.current) return;
    suspended.current = true;
    try {
      await invoke("suspend_shortcuts");
    } catch (e) {
      console.warn("suspend_shortcuts failed", e);
    }
  }

  async function resume() {
    if (!suspended.current) return;
    suspended.current = false;
    try {
      await invoke("reregister_shortcuts");
    } catch (e) {
      console.warn("reregister_shortcuts failed", e);
    }
  }

  async function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();

    const res = eventToAccelerator(e.nativeEvent);
    if (!res) return; // modifier-only / no key yet — keep listening
    if (!res.ok) {
      setError(
        res.reason === "win"
          ? "Windows reserves the ⊞ key — use Ctrl, Alt or Shift"
          : "Add a modifier (Ctrl, Alt or Shift)",
      );
      return;
    }

    const accel = res.accel;
    const v = validateAccelerator(accel);
    if (!v.ok) {
      setError(
        v.reason === "win"
          ? "Windows reserves the ⊞ key — use Ctrl, Alt or Shift"
          : v.reason === "reserved"
            ? `${accel} is reserved by the OS`
            : v.reason === "no-modifier"
              ? "Add a modifier (Ctrl, Alt or Shift)"
              : "Not a valid shortcut",
      );
      return;
    }

    // Probe is advisory: only block on an explicit non-ok status. A missing or
    // malformed result (older backend, mocked IPC) must not prevent the rebind —
    // registration on save is the authoritative check.
    let status: HotkeyProbe["status"] = "ok";
    try {
      const probe = await invoke<HotkeyProbe>("probe_hotkey", { accel });
      if (probe && typeof probe.status === "string") status = probe.status;
    } catch (err) {
      console.warn("probe_hotkey failed", err);
    }
    if (status !== "ok") {
      setError(statusMessage(accel, status) ?? "Can't use this shortcut");
      return;
    }

    setError(null);
    onChange(accel);
    setRecording(false);
    ref.current?.blur();
  }

  const display = recording
    ? "Press keys…"
    : formatShortcut(value) || (clearable ? "Click to set" : "Click to record");

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          ref={ref}
          readOnly
          value={display}
          onFocus={() => {
            setRecording(true);
            setError(null);
            void suspend();
          }}
          onBlur={() => {
            setRecording(false);
            void resume();
          }}
          onKeyDown={(e) => void handleKey(e)}
          className="font-mono cursor-pointer"
        />
        {clearable && value && (
          <button
            type="button"
            // Prevent the input's blur/record cycle from swallowing the click.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setError(null);
              onChange("");
            }}
            className="shrink-0 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            title="Remove this shortcut"
          >
            Clear
          </button>
        )}
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
