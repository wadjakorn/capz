"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function OutputPrefsForm() {
  const config = useSettings((s) => s.config.output);
  const capture = useSettings((s) => s.config.capture);
  const update = useSettings((s) => s.update);

  const onChoose = async () => {
    const picked = await pickDir(config.defaultSavePath);
    if (picked) await update("output", { defaultSavePath: picked });
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>Capture intermediate</Label>
        <Select
          value={capture.intermediateFormat}
          onValueChange={(v) =>
            update("capture", { intermediateFormat: v as typeof capture.intermediateFormat })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="png">PNG (lossless, recommended)</SelectItem>
            <SelectItem value="jpeg">JPEG (smaller / faster)</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          Intermediate buffer the editor loads from. PNG preserves every pixel; JPEG re-encodes lossily and caps final-export quality regardless of File format below.
        </span>
      </div>

      {capture.intermediateFormat === "jpeg" && (
        <div className="grid gap-2">
          <Label>Intermediate JPEG quality ({capture.tempJpegQuality})</Label>
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
          />
        </div>
      )}

      <div className="grid gap-2">
        <Label>Limit longest edge (px)</Label>
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
        />
        <span className="text-xs text-muted-foreground">
          Downscale captures whose longest side exceeds this. Blank or 0 = native resolution. Use only if huge captures feel slow.
        </span>
      </div>
      <div className="grid gap-2">
        <Label>Default output</Label>
        <Select
          value={config.defaultMode}
          onValueChange={(v) => update("output", { defaultMode: v as typeof config.defaultMode })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="clipboard">Copy to clipboard</SelectItem>
            <SelectItem value="file">Save to file</SelectItem>
            <SelectItem value="both">Both (file + clipboard)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label>File format</Label>
        <Select
          value={config.fileFormat}
          onValueChange={(v) => update("output", { fileFormat: v as typeof config.fileFormat })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="png">PNG</SelectItem>
            <SelectItem value="jpeg">JPEG</SelectItem>
            <SelectItem value="webp">WebP</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {config.fileFormat === "jpeg" && (
        <div className="grid gap-2">
          <Label>JPEG quality ({config.jpegQuality})</Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={config.jpegQuality}
            onChange={(e) =>
              update("output", { jpegQuality: Math.max(1, Math.min(100, Number(e.target.value))) })
            }
          />
        </div>
      )}

      <div className="grid gap-2">
        <Label>Save destination</Label>
        <div className="flex gap-2">
          <Input
            value={config.defaultSavePath ?? ""}
            readOnly
            placeholder="Resolving default…"
            className="flex-1 font-mono text-xs"
          />
          <button
            type="button"
            onClick={onChoose}
            className="btn btn--secondary"
          >
            Choose…
          </button>
          <button
            type="button"
            onClick={() => openFolder(config.defaultSavePath)}
            disabled={!config.defaultSavePath}
            className="btn btn--secondary"
          >
            Open folder
          </button>
        </div>
        <span className="text-xs text-muted-foreground">
          Files save here directly — no dialog. Filename collisions get `-1`, `-2` suffixes.
        </span>
      </div>

      <div className="grid gap-2">
        <Label>Filename template</Label>
        <Input
          value={config.filenameTemplate}
          onChange={(e) => update("output", { filenameTemplate: e.target.value })}
          className="font-mono"
        />
        <span className="text-xs text-muted-foreground">
          Tokens: {"{yyyy} {MM} {dd} {HH} {mm} {ss}"}
        </span>
      </div>
    </div>
  );
}
