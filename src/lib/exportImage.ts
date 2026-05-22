import type Konva from "konva";
import type { AppConfig } from "@/lib/config";
import { applyFilenameTemplate, extensionFor } from "@/lib/filename";

type ExportResult = {
  saved?: string;
  copied: boolean;
};

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function stageBytes(stage: Konva.Stage, output: AppConfig["output"]): Uint8Array {
  const scale = stage.scaleX() || 1;
  const pixelRatio = 1 / scale;
  const mimeType =
    output.fileFormat === "jpeg"
      ? "image/jpeg"
      : output.fileFormat === "webp"
        ? "image/webp"
        : "image/png";
  const quality = output.fileFormat === "png" ? undefined : output.jpegQuality / 100;
  const dataUrl = stage.toDataURL({ mimeType, quality, pixelRatio });
  return dataUrlToBytes(dataUrl);
}

async function copyToClipboard(stage: Konva.Stage): Promise<void> {
  const pixelRatio = 1 / (stage.scaleX() || 1);
  const dataUrl = stage.toDataURL({ mimeType: "image/png", pixelRatio });
  const bytes = dataUrlToBytes(dataUrl);
  const { writeImage } = await import("@tauri-apps/plugin-clipboard-manager");
  await writeImage(bytes);
}

async function saveToFile(
  stage: Konva.Stage,
  output: AppConfig["output"],
): Promise<string | undefined> {
  const bytes = stageBytes(stage, output);
  const ext = extensionFor(output.fileFormat);
  const baseName = applyFilenameTemplate(output.filenameTemplate);
  const defaultName = `${baseName}.${ext}`;

  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({
    defaultPath: output.defaultSavePath ? `${output.defaultSavePath}/${defaultName}` : defaultName,
    filters: [{ name: output.fileFormat.toUpperCase(), extensions: [ext] }],
  });
  if (!path) return undefined;

  const { writeFile } = await import("@tauri-apps/plugin-fs");
  await writeFile(path, bytes);
  return path;
}

export async function exportAnnotated(
  stage: Konva.Stage,
  config: AppConfig,
): Promise<ExportResult> {
  const { output, general } = config;
  const mode = output.defaultMode;
  let saved: string | undefined;
  let copied = false;

  if (mode === "file" || mode === "both") {
    saved = await saveToFile(stage, output);
  }
  if (mode === "clipboard" || mode === "both") {
    await copyToClipboard(stage);
    copied = true;
  }
  if (mode === "file" && saved && general.copyToClipboardAfterSave) {
    await copyToClipboard(stage);
    copied = true;
  }
  return { saved, copied };
}
