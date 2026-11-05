"use client";

import { useEffect, useState } from "react";
import { HotkeyRecorder } from "@/components/settings/HotkeyRecorder";
import { SectionCard } from "@/components/settings/SectionCard";
import { SettingRow } from "@/components/settings/SettingRow";
import { SettingToggle } from "@/components/settings/SettingToggle";
import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { RingModesField } from "@/components/settings/cards/RingModesField";
import { applyHotkey } from "@/components/settings/applyHotkey";
import { useSettings } from "@/stores/settings";
import { currentPlatform } from "@/lib/shortcuts";
import { useT } from "@/i18n/useT";
import { SHORTCUTS_GROUP } from "@/components/settings/registry";
import { isTauriRuntime } from "@/lib/platform";

/**
 * Wayland (CP-0094): the desktop owns global shortcuts — capz only proposes
 * them once, and the desktop keeps whatever the user confirmed. So on Wayland
 * the rows show the desktop's actual bindings (read-only) and changes go
 * through the desktop's own settings. `null` = not Wayland.
 */
function useWaylandTriggers(): Record<string, string> | null {
  const [triggers, setTriggers] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let off: (() => void) | undefined;
    let alive = true;
    void (async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");
      const wayland = await invoke<boolean>("is_wayland_session").catch(
        () => false,
      );
      if (!wayland || !alive) return;
      const load = () =>
        invoke<Record<string, string>>("wayland_shortcut_triggers")
          .then((t) => alive && setTriggers(t))
          .catch(() => alive && setTriggers({}));
      await load();
      // Fires when the bind finishes and when the user re-binds in the desktop.
      const un = await listen("wayland:shortcuts-changed", () => void load());
      if (alive) off = un;
      else un();
    })();
    return () => {
      alive = false;
      off?.();
    };
  }, []);
  return triggers;
}

function WaylandShortcutsNote() {
  const { t } = useT();
  const [failed, setFailed] = useState(false);
  const configure = async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    setFailed(false);
    await invoke("configure_wayland_shortcuts").catch(() => setFailed(true));
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {t("settings.capture.wayland.note")}
        </p>
        <button
          type="button"
          className="btn btn--secondary shrink-0"
          onClick={() => void configure()}
        >
          {t("settings.capture.wayland.configure")}
        </button>
      </div>
      {failed && (
        <span className="text-xs text-destructive">
          {t("settings.capture.wayland.configureFailed")}
        </span>
      )}
    </div>
  );
}

/** The desktop's own label for a bound shortcut, e.g. "Shift+Ctrl+1". */
function WaylandTrigger({ label }: { label: string | undefined }) {
  const { t } = useT();
  const keys = label ? label.split("+").filter(Boolean) : [];
  return (
    <div className="field flex h-9 w-60 items-center gap-1 overflow-hidden py-0">
      {keys.length ? (
        keys.map((k, i) => (
          <kbd
            key={i}
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-foreground/[0.06] px-1.5 font-sans text-xs font-medium text-foreground shadow-[inset_0_-1px_0_var(--border)]"
          >
            {k}
          </kbd>
        ))
      ) : (
        <span className="truncate italic text-muted-foreground">
          {t("settings.hotkey.notSet")}
        </span>
      )}
    </div>
  );
}

/** Shortcuts, and what happens at the moment of capture. */
export function CapturePage() {
  const { t } = useT();
  const { config, update } = useSettings();
  const isMac = currentPlatform() === "mac";

  const wayland = useWaylandTriggers();

  const hotkey = (key: keyof typeof config.hotkeys) =>
    wayland ? (
      <WaylandTrigger label={wayland[key]} />
    ) : (
      <HotkeyRecorder
        value={config.hotkeys[key]}
        onChange={(v) => applyHotkey(useSettings.getState, update, { [key]: v })}
      />
    );

  return (
    <div className="grid gap-4">
      <SectionCard title={t(SHORTCUTS_GROUP)}>
        {wayland && <WaylandShortcutsNote />}
        <SettingRow aligned id="capture.full">{hotkey("captureFull")}</SettingRow>
        <SettingRow aligned id="capture.area">{hotkey("captureArea")}</SettingRow>
        {isMac && (
          <SettingRow aligned id="capture.sysArea" hint={t("settings.capture.sysArea.hint")}>
            {hotkey("captureSystemArea")}
          </SettingRow>
        )}
        <SettingRow aligned id="capture.window">{hotkey("captureWindow")}</SettingRow>
        <SettingRow aligned id="capture.scroll">{hotkey("captureScroll")}</SettingRow>
        <SettingRow
          aligned
          id="capture.ring"
          hint={t("settings.capture.ring.hint")}
        >
          {hotkey("commandRing")}
        </SettingRow>
      </SectionCard>

      <SectionCard>
        <SettingToggle
          id="capture.sound"
          checked={config.general.playSoundOnCapture}
          onChange={(v) => update("general", { playSoundOnCapture: v })}
        />
      </SectionCard>

      <AdvancedSection page="capture">
        <SettingRow aligned id="capture.showEditor">{hotkey("showEditor")}</SettingRow>
        <SettingRow
          aligned
          id="capture.ringHold"
          hint={t("settings.capture.ringHold.hint")}
        >
          {hotkey("commandRingV2")}
        </SettingRow>
        <SettingRow
          id="capture.ringModes"
          hint={t("settings.capture.ringModes.hint")}
        >
          <RingModesField />
        </SettingRow>
        <SettingRow
          id="capture.backdrop"
          hint={t("settings.capture.backdrop.hint")}
        >
          <div className="flex flex-col gap-1.5">
            {(
              [
                // Same words as the shortcut rows above.
                ["autoForFull", "settings.capture.full"],
                ["autoForArea", "settings.capture.area"],
                ["autoForWindow", "settings.capture.window"],
                // Non-capture opens onto an empty canvas.
                ["autoForPaste", "settings.capture.backdrop.paste"],
                ["autoForImport", "settings.capture.backdrop.import"],
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
                      backdrop: { ...config.general.backdrop, [key]: e.target.checked },
                    })
                  }
                />
                {t(label)}
              </label>
            ))}
          </div>
        </SettingRow>
      </AdvancedSection>
    </div>
  );
}
