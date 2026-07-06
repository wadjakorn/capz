import type Konva from "konva";
import type { AppConfig } from "@/lib/config";
import { applyFilenameTemplate, extensionFor } from "@/lib/filename";
import { getStageExportBox, getStageImageSize } from "@/lib/stageBridge";
import { isTauriRuntime } from "@/lib/platform";
import { copyPngWithFallback, downloadPng } from "@/lib/webExport";

type ExportResult = {
  saved?: string;
  copied: boolean;
  /**
   * Set on the web build when the clipboard image write was unavailable (Linux
   * Firefox et al.) and the PNG was downloaded instead. Holds the filename.
   */
  downloaded?: string;
};

// Fallback download name when copy-to-clipboard degrades and there's no
// user-configured template in scope (matches the config default).
const FALLBACK_FILENAME_TEMPLATE = "capz-{yyyy}{MM}{dd}-{HHmmss}";

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Region-explicit export. The Stage's `offsetX/Y` pins the content box's
 * top-left to stage-local (0, 0) regardless of DOM position or scroll offset,
 * so the (x: 0, y: 0, width: w*scale, height: h*scale) rect with
 * `pixelRatio = 1/scale` yields a native-resolution snapshot of the whole
 * canvas — independent of viewport zoom and pan. The export box (published by
 * EditorStage) is the union of the image rect and any elements that overflow
 * its edges; with no overflow it equals the image rect, so output is unchanged.
 * The white/configured background is painted as a Rect inside the Stage, so it
 * is captured here without extra compositing.
 */
function exportRegion(
  stage: Konva.Stage,
  opts: { mimeType: string; quality?: number },
): string {
  const scale = stage.scaleX() || 1;
  const box = getStageExportBox();
  const size = getStageImageSize();
  const w = box?.w ?? size?.w ?? stage.width() / scale;
  const h = box?.h ?? size?.h ?? stage.height() / scale;
  return stage.toDataURL({
    x: 0,
    y: 0,
    width: w * scale,
    height: h * scale,
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

type CopyOutcome = { copied: boolean; downloaded?: string };

async function copyToClipboard(
  stage: Konva.Stage,
  allowDownloadFallback = true,
): Promise<CopyOutcome> {
  const dataUrl = exportRegion(stage, { mimeType: "image/png" });
  const bytes = dataUrlToBytes(dataUrl);
  if (!isTauriRuntime()) {
    // Keep everything up to clipboard.write() synchronous — Safari drops the
    // user activation across awaits (see webExport.copyPngToClipboard).
    const blob = new Blob([bytes as BlobPart], { type: "image/png" });
    const filename = `${applyFilenameTemplate(FALLBACK_FILENAME_TEMPLATE)}.png`;
    const res = await copyPngWithFallback(
      Promise.resolve(blob),
      // Only download-fallback when the caller hasn't already produced a file;
      // save-and-copy passes false so a clipboard miss doesn't double-download.
      allowDownloadFallback ? { blob, filename } : null,
    );
    if (res.via === "clipboard") return { copied: true };
    if (res.via === "download") return { copied: false, downloaded: res.filename };
    return { copied: false };
  }
  const { writeImage } = await import("@tauri-apps/plugin-clipboard-manager");
  await writeImage(bytes);
  return { copied: true };
}

export async function copyOnly(stage: Konva.Stage): Promise<ExportResult> {
  const { copied, downloaded } = await copyToClipboard(stage);
  return { copied, downloaded };
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
  // The file is already on disk / downloaded, so don't add a second download
  // when the clipboard is unavailable — just report copied:false.
  const { copied } = await copyToClipboard(stage, false);
  return { saved, copied };
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

