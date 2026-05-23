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

export async function copyOnly(stage: Konva.Stage): Promise<ExportResult> {
  await copyToClipboard(stage);
  return { copied: true };
}

export async function saveOnly(
  stage: Konva.Stage,
  config: AppConfig,
): Promise<ExportResult> {
  const { output } = config;
  const saved = await saveToFile(stage, output);
  return { saved, copied: false };
}

export async function saveAndCopy(
  stage: Konva.Stage,
  config: AppConfig,
): Promise<ExportResult> {
  const { output } = config;
  const saved = await saveToFile(stage, output);
  await copyToClipboard(stage);
  return { saved, copied: true };
}

async function resolveSaveDir(output: AppConfig["output"]): Promise<string> {
  if (output.defaultSavePath) return output.defaultSavePath;
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<string>("default_save_dir");
}

async function saveToFile(
  stage: Konva.Stage,
  output: AppConfig["output"],
): Promise<string | undefined> {
  const bytes = stageBytes(stage, output);
  const ext = extensionFor(output.fileFormat);
  const baseName = applyFilenameTemplate(output.filenameTemplate);

  const dir = await resolveSaveDir(output);
  const { join } = await import("@tauri-apps/api/path");
  const { writeFile, mkdir, exists } = await import("@tauri-apps/plugin-fs");

  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }

  let path = await join(dir, `${baseName}.${ext}`);
  let n = 1;
  while (await exists(path)) {
    path = await join(dir, `${baseName}-${n}.${ext}`);
    n++;
  }
  await writeFile(path, bytes);
  return path;
}

