"use client";

import { invoke } from "@tauri-apps/api/core";
import { SectionCard } from "@/components/settings/SectionCard";
import { SettingRow } from "@/components/settings/SettingRow";
import { SettingToggle } from "@/components/settings/SettingToggle";
import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { ToggleRow } from "@/components/settings/ToggleRow";
import { STICKY_TOOLS } from "@/lib/stickyTools";
import { useSettings } from "@/stores/settings";

/** How the annotation editor looks and behaves. */
export function EditorPage() {
  const { config, update } = useSettings();
  const g = config.general;

  return (
    <div className="grid gap-4">
      <SectionCard>
        <SettingRow id="editor.theme" hint="System follows your operating system.">
          <select
            className="field"
            value={g.theme}
            onChange={(e) =>
              update("general", {
                theme: e.target.value as "light" | "dark" | "system",
              })
            }
            aria-label="Appearance"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">System</option>
          </select>
        </SettingRow>
        <SettingToggle
          id="editor.remember"
          checked={g.rememberLastTool}
          onChange={(v) => update("general", { rememberLastTool: v })}
        />
        <SettingToggle
          id="editor.snap"
          hint="Hold Alt to bypass."
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
          hint="Off returns to Select after one use. Also on the editor sidebar, or press K."
        >
          <div className="grid gap-2">
            {STICKY_TOOLS.map((t) => (
              <ToggleRow
                key={t.id}
                label={t.label}
                checked={g.keepToolActive[t.id] !== false}
                onChange={(v) =>
                  update("general", {
                    keepToolActive: { ...g.keepToolActive, [t.id]: v },
                  })
                }
              />
            ))}
          </div>
        </SettingRow>

        <SettingRow
          id="editor.canvas"
          hint="Shows through transparent images, on screen and in exports."
        >
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Canvas background color"
              value={g.canvasBackground}
              onChange={(e) => update("general", { canvasBackground: e.target.value })}
              className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-white/[0.06] p-0.5"
            />
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => update("general", { canvasBackground: "#ffffff" })}
            >
              Reset
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
          hint="Applies the next time the editor opens. Minimum 1024 × 680."
        >
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1024}
              step={8}
              aria-label="Editor width"
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
              aria-label="Editor height"
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
