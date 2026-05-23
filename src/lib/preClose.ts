"use client";

import { toast } from "sonner";
import { useSettings } from "@/stores/settings";
import { getStage } from "@/lib/stageBridge";
import { copyOnly, saveOnly, saveAndCopy } from "@/lib/exportImage";

/**
 * Run the configured pre-close action (Save/Copy/Both) if any.
 * Returns once the action completes (or no-op for "none").
 * Errors are surfaced via toast but never rethrown — caller proceeds to hide.
 */
export async function runPreCloseAction(): Promise<void> {
  const cfg = useSettings.getState().config;
  const action = cfg.general.closeAction;
  if (action === "none") return;
  const stage = getStage();
  if (!stage) return;
  try {
    if (action === "copy") {
      await copyOnly(stage);
      toast.success("Copied");
    } else if (action === "file") {
      const r = await saveOnly(stage, cfg);
      if (r.saved) toast.success("Saved");
    } else if (action === "both") {
      const r = await saveAndCopy(stage, cfg);
      if (r.saved && r.copied) toast.success("Saved & Copied");
      else if (r.saved) toast.success("Saved");
      else if (r.copied) toast.success("Copied");
    }
  } catch (err) {
    console.error("pre-close action failed", err);
    const { describeExportError } = await import("@/lib/exportErrors");
    const { title, detail } = describeExportError(err);
    toast.error(title, { description: detail });
  }
}
