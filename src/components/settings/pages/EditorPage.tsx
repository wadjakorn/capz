"use client";

import { invoke } from "@tauri-apps/api/core";
import { SectionCard } from "@/components/settings/SectionCard";
import { SettingRow } from "@/components/settings/SettingRow";
import { SettingToggle } from "@/components/settings/SettingToggle";
import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { ToggleRow } from "@/components/settings/ToggleRow";
import { STICKY_TOOLS } from "@/lib/stickyTools";
import { useSettings } from "@/stores/settings";
import { useT } from "@/i18n/useT";

/** How the annotation editor looks and behaves. */
export function EditorPage() {
  const { t } = useT();
  const { config, update } = useSettings();
  const g = config.general;

  return (
    <div className="grid gap-4">
      <SectionCard>
        <SettingRow id="editor.theme" hint={t("settings.editor.theme.hint")}>
          <select
            className="field"
            value={g.theme}
            onChange={(e) =>
              update("general", {
                theme: e.target.value as "light" | "dark" | "system",
              })
            }
            aria-label={t("settings.editor.theme")}
          >
            <option value="dark">{t("settings.editor.theme.dark")}</option>
            <option value="light">{t("settings.editor.theme.light")}</option>
            <option value="system">{t("settings.editor.theme.system")}</option>
          </select>
        </SettingRow>
        <SettingToggle
          id="editor.remember"
          checked={g.rememberLastTool}
          onChange={(v) => update("general", { rememberLastTool: v })}
        />
        <SettingToggle
          id="editor.snap"
          hint={t("settings.editor.snap.hint")}
          checked={g.snapEnabled}
          onChange={(v) => update("general", { snapEnabled: v })}
        />
      </SectionCard>

      <AdvancedSection page="editor">
        <SettingToggle
          id="editor.rulers"
          checked={g.showRulers}
          onChange={(v) => update("general", { showRulers: v })}
        />

        <SettingRow
          id="editor.keepToolActive"
          hint={t("settings.editor.keepToolActive.hint")}
        >
          <div className="grid gap-2">
            {STICKY_TOOLS.map((tool) => (
              <ToggleRow
                key={tool.id}
                label={tool.label}
                checked={g.keepToolActive[tool.id] !== false}
                onChange={(v) =>
                  update("general", {
                    keepToolActive: { ...g.keepToolActive, [tool.id]: v },
                  })
                }
              />
            ))}
          </div>
        </SettingRow>

        <SettingRow
          id="editor.canvas"
          hint={t("settings.editor.canvas.hint")}
        >
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={t("settings.editor.canvas.colorAria")}
              value={g.canvasBackground}
              onChange={(e) => update("general", { canvasBackground: e.target.value })}
              className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-white/[0.06] p-0.5"
            />
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => update("general", { canvasBackground: "#ffffff" })}
            >
              {t("settings.editor.canvas.reset")}
            </button>
          </div>
        </SettingRow>

        <SettingToggle
          id="editor.ontop"
          checked={g.alwaysOnTopEditor}
          onChange={async (v) => {
            await update("general", { alwaysOnTopEditor: v });
            try {
              await invoke("set_editor_always_on_top", { on: v });
            } catch (e) {
              console.error("set_editor_always_on_top failed", e);
            }
          }}
        />

        <SettingRow
          id="editor.size"
          hint={t("settings.editor.size.hint")}
        >
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1024}
              step={8}
              aria-label={t("settings.editor.size.width")}
              value={g.editorWindow.width}
              onChange={(e) => {
                const w = Math.max(1024, parseInt(e.target.value, 10) || 1024);
                update("general", {
                  editorWindow: { width: w, height: g.editorWindow.height },
                });
              }}
              className="field w-20 text-center"
            />
            <span className="text-xs text-muted-foreground">×</span>
            <input
              type="number"
              min={680}
              step={8}
              aria-label={t("settings.editor.size.height")}
              value={g.editorWindow.height}
              onChange={(e) => {
                const h = Math.max(680, parseInt(e.target.value, 10) || 680);
                update("general", {
                  editorWindow: { width: g.editorWindow.width, height: h },
                });
              }}
              className="field w-20 text-center"
            />
          </div>
        </SettingRow>
      </AdvancedSection>
    </div>
  );
}
