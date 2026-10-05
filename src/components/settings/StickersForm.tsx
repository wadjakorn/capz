"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useSettings } from "@/stores/settings";
import { useStickers } from "@/stores/stickers";
import { useT } from "@/i18n/useT";

async function pickDir(current: string | null): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({
    directory: true,
    multiple: false,
    defaultPath: current ?? undefined,
  });
  return typeof picked === "string" ? picked : null;
}

async function openFolder(path: string | null): Promise<void> {
  if (!path) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("reveal_in_finder", { path });
}

export function StickersForm() {
  const { t } = useT();
  const directory = useSettings((s) => s.config.stickers.directory);
  const update = useSettings((s) => s.update);
  const entries = useStickers((s) => s.entries);
  const loading = useStickers((s) => s.loading);
  const error = useStickers((s) => s.error);
  const load = useStickers((s) => s.load);

  const [synced, setSynced] = useState(false);

  // First-render snapshot: if directory set but store empty, surface count
  // after we trigger sync (don't auto-sync — user explicitly clicks).
  useEffect(() => {
    setSynced(false);
  }, [directory]);

  const onChoose = async () => {
    const picked = await pickDir(directory);
    if (picked) await update("stickers", { directory: picked });
  };

  const onClear = async () => {
    await update("stickers", { directory: null });
    useStickers.getState().clear();
  };

  const onSync = async () => {
    await load(directory);
    setSynced(true);
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>{t("settings.stickers.directory")}</Label>
        <div className="flex gap-2">
          <Input
            value={directory ?? ""}
            readOnly
            placeholder={t("settings.stickers.placeholder")}
            className="flex-1 font-mono text-xs"
          />
          <button
            type="button"
            onClick={onChoose}
            className="btn btn--secondary"
          >
            {t("settings.choose")}
          </button>
          <button
            type="button"
            onClick={() => openFolder(directory)}
            disabled={!directory}
            className="btn btn--secondary"
          >
            {t("settings.stickers.openFolder")}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!directory}
            className="btn btn--secondary"
          >
            {t("settings.clear")}
          </button>
        </div>
        <span className="text-xs text-muted-foreground">
          {t("settings.stickers.help")}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSync}
          disabled={!directory || loading}
          className="btn btn--secondary"
        >
          {loading ? t("settings.stickers.syncing") : t("settings.stickers.syncNow")}
        </button>
        <span className="text-xs text-muted-foreground">
          {synced || entries.length > 0
            ? t(
                entries.length === 1
                  ? "settings.stickers.loadedOne"
                  : "settings.stickers.loadedMany",
                { n: entries.length },
              )
            : directory
              ? t("settings.stickers.clickSync")
              : t("settings.stickers.chooseFirst")}
        </span>
      </div>

      {error && (
        <span className="text-xs text-destructive">{t("settings.stickers.failed", { error })}</span>
      )}
    </div>
  );
}
