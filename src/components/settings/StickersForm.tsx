"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, FolderOpen, RefreshCw, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/stores/settings";
import { useStickers } from "@/stores/stickers";
import { useT } from "@/i18n/useT";
import { isTauriRuntime } from "@/lib/platform";
import { folderBaseName, stickerFolderId, type StickerFolder } from "@/lib/config";
import { BUILTIN_STICKER_SETS } from "@/lib/stickers/builtin";
import { canDisableSet, isSetEnabled, moveSetId, orderedSetIds } from "@/lib/stickers/sets";

async function pickDir(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false });
  return typeof picked === "string" ? picked : null;
}

async function openFolder(path: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("reveal_in_finder", { path });
}

const iconBtn =
  "inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--fg-2)] transition-colors hover:bg-[var(--surface-raised)] disabled:opacity-40 disabled:hover:bg-transparent";

/** Settings → Library → Stickers: enable / disable / reorder sticker sets and
 * manage user folders (CP-0048). Each folder is one set in the picker. */
export function StickersForm() {
  const { t } = useT();
  const cfg = useSettings((s) => s.config.stickers);
  const update = useSettings((s) => s.update);
  const folderState = useStickers((s) => s.folders);
  const [notice, setNotice] = useState<string | null>(null);
  const desktop = isTauriRuntime();

  const ids = orderedSetIds(cfg).filter((id) => desktop || !cfg.folders.some((f) => f.id === id));

  const setEnabled = async (id: string, on: boolean) => {
    if (!on && !canDisableSet(cfg, id)) {
      setNotice(t("settings.stickers.lastOne"));
      return;
    }
    setNotice(null);
    if (cfg.folders.some((f) => f.id === id)) {
      await update("stickers", {
        folders: cfg.folders.map((f) => (f.id === id ? { ...f, enabled: on } : f)),
      });
    } else {
      const rest = cfg.disabledBuiltins.filter((x) => x !== id);
      await update("stickers", { disabledBuiltins: on ? rest : [...rest, id] });
    }
  };

  const move = (id: string, delta: -1 | 1) => update("stickers", { order: moveSetId(cfg, id, delta) });

  const addFolder = async () => {
    const dir = await pickDir();
    if (!dir) return;
    const id = stickerFolderId(dir);
    if (cfg.folders.some((f) => f.id === id)) {
      setNotice(t("settings.stickers.folderExists"));
      return;
    }
    setNotice(null);
    const folder: StickerFolder = { id, dir, name: folderBaseName(dir), enabled: true };
    await update("stickers", { folders: [...cfg.folders, folder] });
  };

  const removeFolder = async (id: string) => {
    if (!canDisableSet(cfg, id)) {
      setNotice(t("settings.stickers.lastOne"));
      return;
    }
    await update("stickers", {
      folders: cfg.folders.filter((f) => f.id !== id),
      order: cfg.order.filter((x) => x !== id),
    });
    useStickers.getState().forget(id);
  };

  const rename = (id: string, name: string) =>
    update("stickers", { folders: cfg.folders.map((f) => (f.id === id ? { ...f, name } : f)) });

  return (
    <div className="grid gap-3">
      <span className="text-xs text-muted-foreground">{t("settings.stickers.setsHelp")}</span>
      <ul className="grid gap-1">
        {ids.map((id, i) => {
          const builtin = BUILTIN_STICKER_SETS.find((s) => s.id === id);
          const folder = cfg.folders.find((f) => f.id === id);
          const name = builtin?.nameKey ? t(builtin.nameKey) : (folder?.name ?? id);
          const state = folder ? folderState[folder.id] : undefined;
          return (
            <li key={id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-[var(--surface-raised)]/50">
              <Switch
                size="sm"
                checked={isSetEnabled(cfg, id)}
                onCheckedChange={(on) => void setEnabled(id, on)}
                aria-label={t("settings.stickers.show", { name })}
              />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {folder ? (
                  <Input
                    defaultValue={folder.name}
                    aria-label={t("settings.stickers.rename")}
                    onBlur={(e) => {
                      const v = e.currentTarget.value.trim();
                      if (v && v !== folder.name) void rename(folder.id, v);
                    }}
                    className="h-7 max-w-[12rem] text-sm"
                  />
                ) : (
                  <span className="truncate text-sm">{name}</span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {folder
                    ? state?.error
                      ? t("stickers.picker.failed")
                      : state && !state.loading
                        ? t(state.entries.length === 1 ? "settings.stickers.loadedOne" : "settings.stickers.loadedMany", { n: state.entries.length })
                        : t("settings.stickers.folder")
                    : t("settings.stickers.builtin")}
                </span>
              </div>
              {folder && (
                <>
                  <button type="button" className={iconBtn} title={folder.dir} aria-label={t("settings.stickers.openFolder")} onClick={() => void openFolder(folder.dir)}>
                    <FolderOpen className="h-4 w-4" />
                  </button>
                  <button type="button" className={iconBtn} title={t("settings.stickers.syncNow")} aria-label={t("settings.stickers.syncNow")} disabled={state?.loading} onClick={() => void useStickers.getState().reload(folder)}>
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button type="button" className={iconBtn} title={t("settings.stickers.remove")} aria-label={t("settings.stickers.remove")} onClick={() => void removeFolder(folder.id)}>
                    <X className="h-4 w-4" />
                  </button>
                </>
              )}
              <button type="button" className={iconBtn} title={t("settings.stickers.moveUp")} aria-label={t("settings.stickers.moveUp")} disabled={i === 0} onClick={() => void move(id, -1)}>
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" className={iconBtn} title={t("settings.stickers.moveDown")} aria-label={t("settings.stickers.moveDown")} disabled={i === ids.length - 1} onClick={() => void move(id, 1)}>
                <ArrowDown className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      {desktop ? (
        <div className="grid gap-1">
          <div>
            <button type="button" onClick={() => void addFolder()} className="btn btn--secondary">
              {t("settings.stickers.addFolder")}
            </button>
          </div>
          <span className="text-xs text-muted-foreground">{t("settings.stickers.folderHelp")}</span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">{t("settings.stickers.desktopOnly")}</span>
      )}
      {notice && <span className="text-xs text-destructive">{notice}</span>}
    </div>
  );
}
