"use client";

import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import {
  eventToAccelerator,
  formatShortcut,
  shortcutKeys,
  validateAccelerator,
  statusMessage,
  type HotkeyProbe,
} from "@/lib/shortcuts";

type Props = {
  value: string;
  onChange: (accel: string) => void;
};

export function HotkeyRecorder({ value, onChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
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

  async function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
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
    // CP-0037(a): OS-owned combos bind if the probe succeeded, but the system
    // can still swallow the keystroke before capz sees it, so say so.
    setWarning(
      v.warning === "os-owned"
        ? `The system usually owns ${formatShortcut(accel)}. If it doesn't trigger capz, turn the system shortcut off first.`
        : null,
    );
    onChange(accel);
    setRecording(false);
    ref.current?.blur();
  }

  const keys = shortcutKeys(value);

  // Fixed width, and the clear button always takes its slot (hidden when there
  // is nothing to clear), so bound and unbound rows line up in one column.
  return (
    <div className="flex w-60 flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {/* A focusable div, not a <button>: WebKit does not focus buttons on
            click, and focus is what starts recording. */}
        <div
          ref={ref}
          role="button"
          tabIndex={0}
          data-hotkey-recorder
          aria-label={
            recording
              ? "Recording shortcut — press keys"
              : `${formatShortcut(value) || "No shortcut"} — click to record`
          }
          title="Click, then press the new shortcut"
          onFocus={() => {
            setRecording(true);
            setError(null);
            setWarning(null);
            void suspend();
          }}
          onBlur={() => {
            setRecording(false);
            void resume();
          }}
          onKeyDown={(e) => void handleKey(e)}
          // `.field:focus` supplies the accent ring while recording.
          className="field flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-1 overflow-hidden py-0 hover:border-[var(--fg-4)]"
        >
          {recording ? (
            <span className="text-[var(--accent)]">Press keys…</span>
          ) : keys.length > 0 ? (
            keys.map((k, i) => (
              <kbd
                key={i}
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-foreground/[0.06] px-1.5 font-sans text-xs font-medium text-foreground shadow-[inset_0_-1px_0_var(--border)]"
              >
                {k}
              </kbd>
            ))
          ) : (
            <span className="italic text-muted-foreground">Not set</span>
          )}
        </div>
        <button
          type="button"
          // Prevent the recorder's blur/record cycle from swallowing the click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setError(null);
            setWarning(null);
            onChange("");
          }}
          disabled={!value}
          aria-hidden={!value}
          tabIndex={value ? 0 : -1}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground ${
            value ? "" : "invisible"
          }`}
          title="Remove this shortcut"
          aria-label="Remove this shortcut"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
      {!error && warning && <span className="text-xs text-amber-600">{warning}</span>}
    </div>
  );
}
