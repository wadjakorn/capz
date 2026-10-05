"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useT } from "@/i18n/useT";
import { dirName, formatBytes, useHistory, type HistoryItem } from "@/stores/history";

/**
 * Per-item history actions — Reveal, Copy, Move to Trash — shared by the
 * sidebar list and the preview overlay so both run exactly the same code.
 *
 * Trash goes through a confirmation; render `trashDialog` once wherever the
 * hook is used.
 */
export function useHistoryActions() {
  const forget = useHistory((s) => s.forget);
  const markMissing = useHistory((s) => s.markMissing);
  const [pendingTrash, setPendingTrash] = useState<HistoryItem | null>(null);
  const { t } = useT();

  const reveal = useCallback(async (item: HistoryItem) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      // reveal_file_in_finder, not reveal_in_finder: the latter OPENS its
      // argument, which for a file means handing it to Preview.
      await invoke("reveal_file_in_finder", { path: item.path });
    } catch (e) {
      console.error("reveal failed", e);
      toast.error(t("editor.history.revealFailed"));
    }
  }, [t]);

  const copy = useCallback(async (item: HistoryItem) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const dataUrl = await invoke<string>("read_image_file_data_url", {
        path: item.path,
        consumeTemp: false,
      });
      const { writeImage } = await import("@tauri-apps/plugin-clipboard-manager");
      const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await writeImage(bytes);
      toast.success(t("editor.history.copied"));
    } catch (e) {
      console.error("copy from history failed", e);
      markMissing(item.id);
      toast.error(t("editor.history.copyFailed"));
    }
  }, [markMissing, t]);

  const trash = useCallback(async (item: HistoryItem) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("trash_file", { path: item.path });
      forget(item.id);
      toast(t("editor.history.trashed"));
    } catch (e) {
      console.error("trash failed", e);
      toast.error(t("editor.history.trashFailed"));
    }
  }, [forget, t]);

  const trashDialog = (
    <ConfirmDialog
      open={pendingTrash !== null}
      title={t("editor.history.trashTitle")}
      preview={
        pendingTrash
          ? {
              thumb: pendingTrash.thumb || undefined,
              line1: pendingTrash.fileName,
              line2: `${dirName(pendingTrash.path)}${
                pendingTrash.bytes ? ` · ${formatBytes(pendingTrash.bytes)}` : ""
              }`,
            }
          : undefined
      }
      body={t("editor.history.trashBody")}
      confirmLabel={t("editor.history.moveToTrash")}
      destructive
      onCancel={() => setPendingTrash(null)}
      onConfirm={() => {
        const item = pendingTrash;
        setPendingTrash(null);
        if (item) void trash(item);
      }}
    />
  );

  return {
    reveal,
    copy,
    requestTrash: setPendingTrash,
    /** The trash confirmation is up — it owns Escape while it is. */
    trashPending: pendingTrash !== null,
    forget,
    trashDialog,
  };
}
