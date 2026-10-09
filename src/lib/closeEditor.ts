"use client";

import { useWorkspaces } from "@/stores/workspaces";

/**
 * Hide the editor window the way closing it does: get the current workspace
 * onto disk, run the configured pre-close action, then hide. Desktop only.
 *
 * `alreadyCopied`: see `runPreCloseAction` (⌘C closing the editor, CP-0067).
 */
export async function closeEditor(opts: { alreadyCopied?: boolean } = {}): Promise<void> {
  // The periodic commit is debounced, so without this the last strokes
  // before a close can be lost.
  const ws = useWorkspaces.getState();
  ws.commitActive();
  await ws.flushPersist();
  const { runPreCloseAction } = await import("@/lib/preClose");
  await runPreCloseAction(opts);
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().hide();
}
