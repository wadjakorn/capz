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
import { useT } from "@/i18n/useT";

type Props = {
  value: string;
  onChange: (accel: string) => void;
};

export function HotkeyRecorder({ value, onChange }: Props) {
  const { t } = useT();
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
          ? t("settings.hotkey.winKey")
          : t("settings.hotkey.needModifier"),
      );
      return;
    }

    const accel = res.accel;
    const v = validateAccelerator(accel);
    if (!v.ok) {
      setError(
        v.reason === "win"
          ? t("settings.hotkey.winKey")
          : v.reason === "no-modifier"
            ? t("settings.hotkey.needModifier")
            : t("settings.hotkey.invalid"),
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
      setError(statusMessage(accel, status) ?? t("settings.hotkey.cantUse"));
      return;
    }

    setError(null);
    // CP-0037(a): OS-owned combos bind if the probe succeeded, but the system
    // can still swallow the keystroke before capz sees it, so say so.
    setWarning(
      v.warning === "os-owned"
        ? t("settings.hotkey.osOwned", { shortcut: formatShortcut(accel) })
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
              ? t("settings.hotkey.recordingAria")
              : t("settings.hotkey.idleAria", {
                  shortcut: formatShortcut(value) || t("settings.hotkey.none"),
                })
          }
          title={t("settings.hotkey.title")}
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
            <span className="whitespace-nowrap text-[var(--accent)]">{t("settings.hotkey.pressKeys")}</span>
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
            <span className="truncate italic text-muted-foreground">{t("settings.hotkey.notSet")}</span>
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
          title={t("settings.hotkey.remove")}
          aria-label={t("settings.hotkey.remove")}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
      {!error && warning && <span className="text-xs text-amber-600">{warning}</span>}
    </div>
  );
}
