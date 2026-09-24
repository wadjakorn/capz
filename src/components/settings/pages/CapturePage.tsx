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

/** Shortcuts, and what happens at the moment of capture. */
export function CapturePage() {
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
      <SectionCard title="Shortcuts">
        <SettingRow id="capture.full">{hotkey("captureFull")}</SettingRow>
        <SettingRow id="capture.area">{hotkey("captureArea")}</SettingRow>
        {isMac && (
          <SettingRow id="capture.sysArea" hint="Hands off to the macOS screenshot tool.">
            {hotkey("captureSystemArea")}
          </SettingRow>
        )}
        <SettingRow id="capture.window">{hotkey("captureWindow")}</SettingRow>
        <SettingRow id="capture.scroll">{hotkey("captureScroll")}</SettingRow>
        <SettingRow
          id="capture.ring"
          hint="Press once — the ring opens and takes focus; click a mode."
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
        <SettingRow id="capture.showEditor">{hotkey("showEditor")}</SettingRow>
        <SettingRow
          id="capture.ringHold"
          hint="Hold the modifiers and tap to cycle, release to capture."
        >
          {hotkey("commandRingV2")}
        </SettingRow>
        <SettingRow
          id="capture.ringModes"
          hint="Which modes sit on the hold ring, clockwise from the top."
        >
          <RingModesField />
        </SettingRow>
        <SettingRow
          id="capture.backdrop"
          hint="Starts the padded backdrop on for these captures; still togglable per image."
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
                      backdrop: { ...config.general.backdrop, [key]: e.target.checked },
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </SettingRow>
      </AdvancedSection>
    </div>
  );
}
