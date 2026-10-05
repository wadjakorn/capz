"use client";

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

/** Shortcuts, and what happens at the moment of capture. */
export function CapturePage() {
  const { t } = useT();
  const { config, update } = useSettings();
  const isMac = currentPlatform() === "mac";

  const hotkey = (key: keyof typeof config.hotkeys) => (
    <HotkeyRecorder
      value={config.hotkeys[key]}
      onChange={(v) => applyHotkey(useSettings.getState, update, { [key]: v })}
    />
  );

  return (
    <div className="grid gap-4">
      <SectionCard title={t(SHORTCUTS_GROUP)}>
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
