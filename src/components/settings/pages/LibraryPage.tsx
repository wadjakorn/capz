"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/settings/SectionCard";
import { SettingRow } from "@/components/settings/SettingRow";
import { SettingToggle } from "@/components/settings/SettingToggle";
import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { StickersForm } from "@/components/settings/StickersForm";
import { useSettings } from "@/stores/settings";
import { useHistory } from "@/stores/history";
import { useT } from "@/i18n/useT";
import {
  ARCHIVE_BUDGET_OPTIONS_MB,
  HISTORY_MAX_OPTIONS,
  WORKSPACE_MAX_RANGE,
} from "@/lib/config";

function formatArchiveSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/** Workspaces, saved captures, the archive and the sticker library. */
export function LibraryPage() {
  const { t } = useT();
  const { config, update } = useSettings();
  const w = config.workspaces;
  const h = config.history;
  const [showStickers, setShowStickers] = useState(false);

  const sizes: number[] = [];
  for (let n = WORKSPACE_MAX_RANGE.min; n <= WORKSPACE_MAX_RANGE.max; n++) sizes.push(n);

  return (
    <div className="grid gap-4">
      <SectionCard>
        <SettingToggle
          id="library.workspaces"
          hint={t("settings.library.workspaces.hint")}
          checked={w.enabled}
          onChange={(enabled) => update("workspaces", { enabled })}
        />
        <SettingToggle
          id="library.history"
          hint={t("settings.library.history.hint")}
          checked={h.enabled}
          onChange={(enabled) => update("history", { enabled })}
        />
        <SettingRow id="library.stickers" hint={t("settings.library.stickers.hint")}>
          <button
            type="button"
            className="btn btn--secondary"
            aria-expanded={showStickers}
            onClick={() => setShowStickers((v) => !v)}
          >
            {showStickers ? t("settings.hide") : t("settings.library.manage")}
          </button>
        </SettingRow>
        {showStickers && (
          <div className="rounded-xl border border-border p-4">
            <StickersForm />
          </div>
        )}
      </SectionCard>

      <AdvancedSection page="library">
        <SettingRow id="library.max">
          <select
            className="field"
            disabled={!w.enabled}
            value={w.max}
            onChange={(e) => update("workspaces", { max: Number(e.target.value) })}
            aria-label={t("settings.library.max")}
          >
            {sizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </SettingRow>

        <SettingRow
          id="library.newCapture"
          hint={
            w.onCapture === "new"
              ? t("settings.library.newCapture.hintNew", { max: w.max })
              : t("settings.library.newCapture.hintReplace")
          }
        >
          <select
            className="field"
            disabled={!w.enabled}
            value={w.onCapture}
            onChange={(e) =>
              update("workspaces", { onCapture: e.target.value as "new" | "replace" })
            }
            aria-label={t("settings.library.newCapture")}
          >
            <option value="new">{t("settings.library.newCapture.new")}</option>
            <option value="replace">{t("settings.library.newCapture.replace")}</option>
          </select>
        </SettingRow>

        <SettingRow
          id="library.keep"
          hint={t("settings.library.keep.hint")}
        >
          <select
            className="field"
            disabled={!h.enabled}
            value={h.max}
            onChange={(e) => {
              const max = Number(e.target.value);
              void update("history", { max });
              const dropped = useHistory.getState().trim(max);
              if (dropped > 0) {
                toast(
                  t(
                    dropped === 1
                      ? "settings.library.keep.removedOne"
                      : "settings.library.keep.removedMany",
                    { n: dropped },
                  ),
                  { description: t("settings.library.keep.notDeleted") },
                );
              }
            }}
            aria-label={t("settings.library.keep")}
          >
            {HISTORY_MAX_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </SettingRow>

        <SettingRow id="library.showAs">
          <select
            className="field"
            disabled={!h.enabled}
            value={h.viewMode}
            onChange={(e) =>
              update("history", { viewMode: e.target.value as "list" | "grid" })
            }
            aria-label={t("settings.library.showAs")}
          >
            <option value="list">{t("settings.library.showAs.list")}</option>
            <option value="grid">{t("settings.library.showAs.grid")}</option>
          </select>
        </SettingRow>

        <SettingRow id="library.clear" hint={t("settings.library.clear.hint")}>
          <button
            type="button"
            disabled={!h.enabled}
            onClick={() => {
              useHistory.getState().clear();
              toast.success(t("settings.library.clear.done"), { duration: 1600 });
            }}
            className="btn btn--secondary text-rose-300 hover:text-rose-200"
          >
            {t("settings.library.clear.button")}
          </button>
        </SettingRow>

        <ArchiveRows />
      </AdvancedSection>
    </div>
  );
}

/**
 * The capture archive (CP-0046).
 *
 * Reads the folder itself rather than trusting a stored number: the usage line
 * is the only place a user finds out how much disk this costs, and a stale
 * figure there would be worse than none.
 */
function ArchiveRows() {
  const { t } = useT();
  const { config, update } = useSettings();
  const h = config.history;
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null);
  const [wiping, setWiping] = useState(false);

  const refresh = async () => {
    const { resolveSaveDirPath } = await import("@/lib/exportImage");
    const { listArchive, totalBytes } = await import("@/lib/captureArchive");
    const dir = await resolveSaveDirPath();
    if (!dir) return setUsage(null);
    const files = await listArchive(dir);
    setUsage({ count: files.length, bytes: totalBytes(files) });
  };

  useEffect(() => {
    if (h.archiveCaptures) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h.archiveCaptures, h.archiveBudgetMb]);

  return (
    <>
      <SettingToggle
        id="library.archive"
        hint={t("settings.library.archive.hint")}
        checked={h.archiveCaptures}
        onChange={(archiveCaptures) => {
          void update("history", { archiveCaptures });
          if (archiveCaptures) void refresh();
        }}
      />

      <SettingRow
        id="library.archiveLimit"
        hint={t("settings.library.archiveLimit.hint")}
      >
        <select
          className="field"
          disabled={!h.archiveCaptures}
          value={h.archiveBudgetMb}
          onChange={(e) => {
            const mb = Number(e.target.value);
            void (async () => {
              await update("history", { archiveBudgetMb: mb });
              const { resolveSaveDirPath } = await import("@/lib/exportImage");
              const { enforceBudget } = await import("@/lib/captureArchive");
              const dir = await resolveSaveDirPath();
              if (!dir) return;
              const gone = await enforceBudget(dir, mb);
              if (gone.length > 0) {
                toast(
                  t(
                    gone.length === 1
                      ? "settings.library.archiveLimit.removedOne"
                      : "settings.library.archiveLimit.removedMany",
                    { n: gone.length },
                  ),
                );
              }
              await refresh();
            })();
          }}
          aria-label={t("settings.library.archiveLimit")}
        >
          {ARCHIVE_BUDGET_OPTIONS_MB.map((mb) => (
            <option key={mb} value={mb}>
              {mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`}
            </option>
          ))}
        </select>
      </SettingRow>

      <SettingRow
        id="library.archiveUsage"
        hint={
          usage
            ? t(
                usage.count === 1
                  ? "settings.library.archiveUsage.one"
                  : "settings.library.archiveUsage.many",
                { n: usage.count },
              )
            : t("settings.library.archiveUsage.empty")
        }
      >
        <button
          type="button"
          disabled={!usage?.count || wiping}
          onClick={() => {
            void (async () => {
              setWiping(true);
              try {
                const { resolveSaveDirPath } = await import("@/lib/exportImage");
                const { deleteArchive } = await import("@/lib/captureArchive");
                const dir = await resolveSaveDirPath();
                if (!dir) return;
                const n = await deleteArchive(dir);
                toast.success(
                  t(
                    n === 1
                      ? "settings.library.archiveUsage.deletedOne"
                      : "settings.library.archiveUsage.deletedMany",
                    { n },
                  ),
                );
                await refresh();
              } finally {
                setWiping(false);
              }
            })();
          }}
          className="btn btn--secondary text-rose-300 hover:text-rose-200"
        >
          {t("settings.library.archiveUsage.delete", {
            size: usage ? formatArchiveSize(usage.bytes) : "0 MB",
          })}
        </button>
      </SettingRow>
    </>
  );
}
