"use client";

import { ChevronRight } from "lucide-react";
import { useSettingsNav } from "@/lib/settingsNav";
import { currentPlatform } from "@/lib/shortcuts";
import { settingsForPage, type PageId } from "./registry";

/**
 * The tuning knobs of a page, folded away by default.
 *
 * The count comes from the registry filtered to this platform, so a mac-only
 * row never inflates the number on Windows. Open state lives in the nav store:
 * `openSettings` can force it open when a deep link or a search result points
 * at a row inside.
 */
export function AdvancedSection({
  page,
  children,
}: {
  page: PageId;
  children: React.ReactNode;
}) {
  const open = useSettingsNav((s) => s.advOpen[page] ?? false);
  const toggle = useSettingsNav((s) => s.toggleAdvanced);
  const count = settingsForPage(page, currentPlatform(), { advanced: true }).length;

  if (count === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <button
        type="button"
        onClick={() => toggle(page)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        Advanced <span className="text-foreground/40">({count})</span>
      </button>
      {open && <div className="grid gap-4 border-t border-border p-4">{children}</div>}
    </div>
  );
}
