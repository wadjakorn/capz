import { useEditor } from "@/stores/editor";
import { addOverlayImage } from "@/lib/addImage";

/** Image file extensions accepted by drag-drop / file-pick import (desktop). */
export const IMPORT_IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];

/** True if `path` looks like a supported image file by extension. */
export function isImportableImagePath(path: string): boolean {
  return new RegExp(`\\.(${IMPORT_IMAGE_EXTS.join("|")})$`, "i").test(path);
}

/**
 * Desktop: bring an on-disk image file into the editor, honoring Add-image mode.
 * With mode ON (and a base image present) the file is layered as a movable
 * overlay object; otherwise it replaces the workspace like paste does. Rust
 * normalizes the file to an RGBA PNG (alpha preserved). Resolves true on
 * success, false if the image couldn't be decoded / added.
 */
export async function importImagePathDesktop(path: string): Promise<boolean> {
  const { invoke } = await import("@tauri-apps/api/core");
  const s = useEditor.getState();
  if (s.addImageMode && s.hasImage) {
    const dataUrl = await invoke<string>("read_image_file_data_url", { path });
    const id = await addOverlayImage(dataUrl);
    return !!id;
  }
  // Replace path: Rust loads the temp PNG and emits editor:load-image, which the
  // editor page's listener turns into applyFile (resets annotations/history).
  await invoke<string>("import_image_file", { path });
  return true;
}
