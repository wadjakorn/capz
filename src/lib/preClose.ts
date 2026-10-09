"use client";

import { toast } from "sonner";
import { t } from "@/i18n/store";
import { useSettings } from "@/stores/settings";
import { getStage } from "@/lib/stageBridge";
import { copyOnly, saveOnly, saveAndCopy } from "@/lib/exportImage";

/**
 * Run the configured pre-close action (Save/Copy/Both) if any.
 * Returns once the action completes (or no-op for "none").
 * Errors are surfaced via toast but never rethrown — caller proceeds to hide.
 *
 * `alreadyCopied`: the image was just copied (⌘C closing the editor, CP-0067),
 * so the copy half of "copy"/"both" is skipped; "both" still saves.
 */
export async function runPreCloseAction(
  opts: { alreadyCopied?: boolean } = {},
): Promise<void> {
  const cfg = useSettings.getState().config;
  let action = cfg.general.closeAction;
  if (opts.alreadyCopied) {
    if (action === "copy") action = "none";
    else if (action === "both") action = "file";
  }
  if (action === "none") return;
  const stage = getStage();
  if (!stage) return;
  try {
    if (action === "copy") {
      await copyOnly(stage);
      toast.success(t("app.export.copied"));
    } else if (action === "file") {
      const r = await saveOnly(stage, cfg);
      if (r.saved) toast.success(t("app.export.saved"));
    } else if (action === "both") {
      const r = await saveAndCopy(stage, cfg);
      if (r.saved && r.copied) toast.success(t("app.export.savedCopied"));
      else if (r.saved) toast.success(t("app.export.saved"));
      else if (r.copied) toast.success(t("app.export.copied"));
    }
  } catch (err) {
    console.error("pre-close action failed", err);
    const { describeExportError } = await import("@/lib/exportErrors");
    const { title, detail } = describeExportError(err);
    toast.error(title, { description: detail });
  }
}
