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

export function OutputPrefsForm() {
  const config = useSettings((s) => s.config.output);
  const update = useSettings((s) => s.update);

  return (
    <div className="grid gap-4">
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
            <SelectItem value="ask">Ask each time</SelectItem>
            <SelectItem value="file">Save to file</SelectItem>
            <SelectItem value="clipboard">Copy to clipboard</SelectItem>
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
