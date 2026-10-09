"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard } from "@/components/settings/SectionCard";
import { SettingRow } from "@/components/settings/SettingRow";
import { SettingToggle } from "@/components/settings/SettingToggle";
import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { useSettings } from "@/stores/settings";
import { useT } from "@/i18n/useT";

async function pickDir(current: string | null): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({
    directory: true,
    multiple: false,
    defaultPath: current ?? undefined,
  });
  return typeof picked === "string" ? picked : null;
}

async function openFolder(path: string | null): Promise<void> {
  if (!path) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const { mkdir, exists } = await import("@tauri-apps/plugin-fs");
  if (!(await exists(path))) await mkdir(path, { recursive: true });
  await invoke("reveal_in_finder", { path });
}

/** What happens to a screenshot when you leave the editor, and where files go. */
export function AfterCapturePage() {
  const { t } = useT();
  const output = useSettings((s) => s.config.output);
  const capture = useSettings((s) => s.config.capture);
  const general = useSettings((s) => s.config.general);
  const update = useSettings((s) => s.update);

  const onChoose = async () => {
    const picked = await pickDir(output.defaultSavePath);
    if (picked) await update("output", { defaultSavePath: picked });
  };

  return (
    <div className="grid gap-4">
      <SectionCard>
        <SettingRow
          id="after.onClose"
          hint={t("settings.after.onClose.hint")}
        >
          <Select
            value={general.closeAction}
            onValueChange={(v) =>
              update("general", {
                closeAction: v as "none" | "copy" | "file" | "both",
              })
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("settings.after.onClose.none")}</SelectItem>
              <SelectItem value="copy">{t("settings.after.onClose.copy")}</SelectItem>
              <SelectItem value="file">{t("settings.after.onClose.file")}</SelectItem>
              <SelectItem value="both">{t("settings.after.onClose.both")}</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingToggle
          id="after.copyCloses"
          hint={t("settings.after.copyCloses.hint")}
          checked={general.copyClosesEditor}
          onChange={(v) => update("general", { copyClosesEditor: v })}
        />

        <SettingRow
          id="after.folder"
          hint={t("settings.after.folder.hint")}
        >
          <div className="flex items-center gap-2">
            <Input
              value={output.defaultSavePath ?? ""}
              readOnly
              placeholder={t("settings.after.folder.placeholder")}
              className="w-56 font-mono text-xs"
              aria-label={t("settings.after.folder")}
            />
            <button type="button" onClick={onChoose} className="btn btn--secondary">
              {t("settings.choose")}
            </button>
            <button
              type="button"
              onClick={() => openFolder(output.defaultSavePath)}
              disabled={!output.defaultSavePath}
              className="btn btn--secondary"
            >
              {t("settings.after.folder.open")}
            </button>
          </div>
        </SettingRow>

        <SettingRow id="after.format">
          <Select
            value={output.fileFormat}
            onValueChange={(v) =>
              update("output", { fileFormat: v as typeof output.fileFormat })
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="png">PNG</SelectItem>
              <SelectItem value="jpeg">JPEG</SelectItem>
              <SelectItem value="webp">WebP</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </SectionCard>

      <AdvancedSection page="after">
        <SettingRow
          id="after.filename"
          hint={t("settings.after.filename.hint", { tokens: "{yyyy} {MM} {dd} {HH} {mm} {ss}" })}
        >
          <Input
            value={output.filenameTemplate}
            onChange={(e) => update("output", { filenameTemplate: e.target.value })}
            className="w-56 font-mono"
            aria-label={t("settings.after.filename.aria")}
          />
        </SettingRow>

        {output.fileFormat === "jpeg" && (
          <SettingRow id="after.quality" hint={t("settings.currently", { value: output.jpegQuality })}>
            <Input
              type="number"
              min={1}
              max={100}
              value={output.jpegQuality}
              onChange={(e) =>
                update("output", {
                  jpegQuality: Math.max(1, Math.min(100, Number(e.target.value))),
                })
              }
              className="w-24"
              aria-label={t("settings.after.quality")}
            />
          </SettingRow>
        )}

        <SettingRow
          id="after.edge"
          hint={t("settings.after.edge.hint")}
        >
          <Input
            type="number"
            min={0}
            placeholder={t("settings.after.edge.placeholder")}
            value={capture.intermediateMaxEdge ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const next = raw === "" ? null : Math.max(0, Math.floor(Number(raw)));
              update("capture", { intermediateMaxEdge: next });
            }}
            className="w-28"
            aria-label={t("settings.after.edge.aria")}
          />
        </SettingRow>

        <SettingRow
          id="after.temp"
          hint={t("settings.after.temp.hint")}
        >
          <Select
            value={capture.intermediateFormat}
            onValueChange={(v) =>
              update("capture", {
                intermediateFormat: v as typeof capture.intermediateFormat,
              })
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="png">{t("settings.after.temp.png")}</SelectItem>
              <SelectItem value="jpeg">{t("settings.after.temp.jpeg")}</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        {capture.intermediateFormat === "jpeg" && (
          <SettingRow
            id="after.tempQuality"
            hint={t("settings.currently", { value: capture.tempJpegQuality })}
          >
            <Input
              type="number"
              min={1}
              max={100}
              value={capture.tempJpegQuality}
              onChange={(e) =>
                update("capture", {
                  tempJpegQuality: Math.max(1, Math.min(100, Number(e.target.value))),
                })
              }
              className="w-24"
              aria-label={t("settings.after.tempQuality")}
            />
          </SettingRow>
        )}
      </AdvancedSection>
    </div>
  );
}
