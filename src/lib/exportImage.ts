import type Konva from "konva";
import type { AppConfig } from "@/lib/config";
import { applyFilenameTemplate, extensionFor } from "@/lib/filename";
import { getStageImageSize } from "@/lib/stageBridge";
import { isTauriRuntime } from "@/lib/platform";
import { copyPngToClipboard, downloadPng } from "@/lib/webExport";

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

/**
 * Region-explicit export. Image always renders at (0, 0) in stage-local coords
 * regardless of the Stage's DOM position or the scroll-container's scroll
 * offset, so the (x: 0, y: 0, width: iw*scale, height: ih*scale) rect with
 * `pixelRatio = 1/scale` yields a native-resolution snapshot of the image
 * region — independent of viewport zoom and pan.
 */
function exportRegion(
  stage: Konva.Stage,
  opts: { mimeType: string; quality?: number },
): string {
  const scale = stage.scaleX() || 1;
  const size = getStageImageSize();
  const iw = size?.w ?? stage.width() / scale;
  const ih = size?.h ?? stage.height() / scale;
  return stage.toDataURL({
    x: 0,
    y: 0,
    width: iw * scale,
    height: ih * scale,
    pixelRatio: 1 / scale,
    mimeType: opts.mimeType,
    quality: opts.quality,
  });
}

function stageBytes(stage: Konva.Stage, output: AppConfig["output"]): Uint8Array {
  const mimeType =
    output.fileFormat === "jpeg"
      ? "image/jpeg"
      : output.fileFormat === "webp"
        ? "image/webp"
        : "image/png";
  const quality = output.fileFormat === "png" ? undefined : output.jpegQuality / 100;
  const dataUrl = exportRegion(stage, { mimeType, quality });
  return dataUrlToBytes(dataUrl);
}

async function copyToClipboard(stage: Konva.Stage): Promise<void> {
  const dataUrl = exportRegion(stage, { mimeType: "image/png" });
  const bytes = dataUrlToBytes(dataUrl);
  if (!isTauriRuntime()) {
    // Keep everything up to clipboard.write() synchronous — Safari drops the
    // user activation across awaits (see webExport.copyPngToClipboard).
    const blob = new Blob([bytes as BlobPart], { type: "image/png" });
    await copyPngToClipboard(Promise.resolve(blob));
    return;
  }
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

  if (!isTauriRuntime()) {
    // Web build: "save" is a browser download; there is no writable
    // filesystem path, so report the filename as the saved location.
    const mime =
      output.fileFormat === "jpeg"
        ? "image/jpeg"
        : output.fileFormat === "webp"
          ? "image/webp"
          : "image/png";
    const filename = `${baseName}.${ext}`;
    downloadPng(new Blob([bytes as BlobPart], { type: mime }), filename);
    return filename;
  }

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

