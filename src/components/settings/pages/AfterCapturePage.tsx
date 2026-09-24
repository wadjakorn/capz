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
import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { useSettings } from "@/stores/settings";

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

/** Where a finished screenshot goes. */
export function AfterCapturePage() {
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
        <SettingRow id="after.output">
          <Select
            value={output.defaultMode}
            onValueChange={(v) =>
              update("output", { defaultMode: v as typeof output.defaultMode })
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clipboard">Copy to clipboard</SelectItem>
              <SelectItem value="file">Save to file</SelectItem>
              <SelectItem value="both">Save and copy</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          id="after.folder"
          hint="Files save here directly. Repeat names get -1, -2 added."
        >
          <div className="flex items-center gap-2">
            <Input
              value={output.defaultSavePath ?? ""}
              readOnly
              placeholder="Resolving default…"
              className="w-56 font-mono text-xs"
              aria-label="Save folder"
            />
            <button type="button" onClick={onChoose} className="btn btn--secondary">
              Choose…
            </button>
            <button
              type="button"
              onClick={() => openFolder(output.defaultSavePath)}
              disabled={!output.defaultSavePath}
              className="btn btn--secondary"
            >
              Open
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
          hint={`Tokens: ${"{yyyy} {MM} {dd} {HH} {mm} {ss}"}`}
        >
          <Input
            value={output.filenameTemplate}
            onChange={(e) => update("output", { filenameTemplate: e.target.value })}
            className="w-56 font-mono"
            aria-label="Filename template"
          />
        </SettingRow>

        {output.fileFormat === "jpeg" && (
          <SettingRow id="after.quality" hint={`Currently ${output.jpegQuality}`}>
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
              aria-label="JPEG quality"
            />
          </SettingRow>
        )}

        <SettingRow
          id="after.edge"
          hint="Downscales captures whose longest side is bigger. Blank keeps native resolution."
        >
          <Input
            type="number"
            min={0}
            placeholder="No limit"
            value={capture.intermediateMaxEdge ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const next = raw === "" ? null : Math.max(0, Math.floor(Number(raw)));
              update("capture", { intermediateMaxEdge: next });
            }}
            className="w-28"
            aria-label="Longest edge in pixels"
          />
        </SettingRow>

        <SettingRow
          id="after.onClose"
          hint="Exports once more when the editor is closed or hidden with Esc."
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
              <SelectItem value="none">Do nothing</SelectItem>
              <SelectItem value="copy">Copy to clipboard</SelectItem>
              <SelectItem value="file">Save to file</SelectItem>
              <SelectItem value="both">Save and copy</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          id="after.temp"
          hint="What the editor loads from. JPEG is faster but caps the quality of every export."
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
              <SelectItem value="png">PNG — every pixel kept</SelectItem>
              <SelectItem value="jpeg">JPEG — smaller and faster</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        {capture.intermediateFormat === "jpeg" && (
          <SettingRow
            id="after.tempQuality"
            hint={`Currently ${capture.tempJpegQuality}`}
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
              aria-label="Temporary JPEG quality"
            />
          </SettingRow>
        )}
      </AdvancedSection>
    </div>
  );
}
