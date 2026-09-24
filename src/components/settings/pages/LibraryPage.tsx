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
          hint="Keep several captures open at once and switch between them in the editor."
          checked={w.enabled}
          onChange={(enabled) => update("workspaces", { enabled })}
        />
        <SettingToggle
          id="library.history"
          hint="Keeps a list of what you exported, with thumbnails, in the editor sidebar."
          checked={h.enabled}
          onChange={(enabled) => update("history", { enabled })}
        />
        <SettingRow id="library.stickers" hint="Images you can drop onto a capture.">
          <button
            type="button"
            className="btn btn--secondary"
            aria-expanded={showStickers}
            onClick={() => setShowStickers((v) => !v)}
          >
            {showStickers ? "Hide" : "Manage…"}
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
            aria-label="Maximum workspaces"
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
              ? `Once all ${w.max} are used, the oldest workspace closes — you can undo that.`
              : "The capture overwrites the workspace you are in. Nothing is closed for you."
          }
        >
          <select
            className="field"
            disabled={!w.enabled}
            value={w.onCapture}
            onChange={(e) =>
              update("workspaces", { onCapture: e.target.value as "new" | "replace" })
            }
            aria-label="When a new capture arrives"
          >
            <option value="new">Open in a new workspace</option>
            <option value="replace">Replace the current workspace</option>
          </select>
        </SettingRow>

        <SettingRow
          id="library.keep"
          hint="Older entries drop off the list. The files stay on your disk."
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
                  `Removed ${dropped} older ${dropped === 1 ? "entry" : "entries"} from the list`,
                  { description: "The files were not deleted." },
                );
              }
            }}
            aria-label="Keep the last"
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
            aria-label="Show as"
          >
            <option value="list">List</option>
            <option value="grid">Thumbnails</option>
          </select>
        </SettingRow>

        <SettingRow id="library.clear" hint="Removes every entry. No files are deleted.">
          <button
            type="button"
            disabled={!h.enabled}
            onClick={() => {
              useHistory.getState().clear();
              toast.success("History cleared", { duration: 1600 });
            }}
            className="btn btn--secondary text-rose-300 hover:text-rose-200"
          >
            Clear list
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
        hint="Copies each screen capture into a Captures folder next to your saved files."
        checked={h.archiveCaptures}
        onChange={(archiveCaptures) => {
          void update("history", { archiveCaptures });
          if (archiveCaptures) void refresh();
        }}
      />

      <SettingRow
        id="library.archiveLimit"
        hint="Past this, the oldest captures go. Files you exported yourself are never touched."
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
                  `Removed ${gone.length} older ${gone.length === 1 ? "capture" : "captures"}`,
                );
              }
              await refresh();
            })();
          }}
          aria-label="Archive limit"
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
            ? `${usage.count} ${usage.count === 1 ? "capture" : "captures"} in the Captures folder.`
            : "Nothing archived yet."
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
                toast.success(`Deleted ${n} archived ${n === 1 ? "capture" : "captures"}`);
                await refresh();
              } finally {
                setWiping(false);
              }
            })();
          }}
          className="btn btn--secondary text-rose-300 hover:text-rose-200"
        >
          {usage ? formatArchiveSize(usage.bytes) : "0 MB"} — Delete…
        </button>
      </SettingRow>
    </>
  );
}
