"use client";

import { useId, useRef, useState } from "react";
import {
  Camera,
  PenLine,
  Download,
  Library,
  Settings as SettingsIcon,
  Search,
  type LucideIcon,
} from "lucide-react";
import { openSettings, useSettingsNav } from "@/lib/settingsNav";
import { currentPlatform } from "@/lib/shortcuts";
import { pagesWithNewSettings, useSeenSettings } from "@/lib/settingNews";
import { useSettings } from "@/stores/settings";
import { VersionFooter } from "./VersionFooter";
import {
  PAGES,
  searchSettings,
  settingDef,
  pageDef,
  type PageId,
  type SettingId,
} from "./registry";

const PAGE_ICONS: Record<PageId, LucideIcon> = {
  capture: Camera,
  editor: PenLine,
  after: Download,
  library: Library,
  app: SettingsIcon,
};

/**
 * Page list, search and the version footer.
 *
 * Labels, not bare icons: the old icon-only rail meant hovering each one to
 * find where a setting lived.
 */
export function SettingsSidebar({
  searchRef,
}: {
  /** Lets the view focus the search field from a keyboard shortcut. */
  searchRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const page = useSettingsNav((s) => s.page);
  const setPage = useSettingsNav((s) => s.setPage);
  const [query, setQuery] = useState("");
  const listId = useId();
  const ownRef = useRef<HTMLInputElement>(null);
  const input = searchRef ?? ownRef;

  const platform = currentPlatform();
  const lastSeen = useSettings((s) => s.config.general.lastSeenSettingsVersion);
  const seen = useSeenSettings((s) => s.seen);
  const pagesWithNews = pagesWithNewSettings(lastSeen, platform, seen);
  const results: SettingId[] = searchSettings(query, platform);
  const searching = query.trim().length > 0;

  function jump(id: SettingId) {
    setQuery("");
    openSettings(id);
  }

  return (
    <nav
      aria-label="Settings sections"
      className="flex w-56 shrink-0 flex-col gap-1 border-r border-border pr-3 max-[720px]:w-14"
    >
      <div className="relative mb-2 max-[720px]:hidden">
        <Search
          className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
          aria-hidden
        />
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
            if (e.key === "Enter" && results[0]) jump(results[0]);
          }}
          placeholder="Search settings"
          aria-label="Search settings"
          aria-controls={searching ? listId : undefined}
          className="field w-full pl-8"
        />
      </div>

      {searching ? (
        <div id={listId} className="grid gap-0.5">
          {results.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No settings match “{query.trim()}”
            </p>
          ) : (
            results.map((id) => {
              const def = settingDef(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => jump(id)}
                  className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-foreground/[0.06]"
                >
                  {def.label}
                  <span className="block text-xs text-muted-foreground">
                    {pageDef(def.page).label}
                    {def.advanced ? " › Advanced" : ""}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : (
        PAGES.map((p) => {
          const Icon = PAGE_ICONS[p.id];
          const active = p.id === page;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPage(p.id)}
              aria-current={active ? "page" : undefined}
              title={p.label}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm max-[720px]:justify-center max-[720px]:px-2 ${
                active
                  ? "bg-accent-soft text-foreground"
                  : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="max-[720px]:sr-only">{p.label}</span>
              {pagesWithNews.has(p.id) && (
                <span
                  className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 max-[720px]:hidden"
                  aria-label="Has new settings"
                />
              )}
            </button>
          );
        })
      )}

      <VersionFooter />
    </nav>
  );
}
