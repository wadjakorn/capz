"use client";

import { create } from "zustand";

import { settingDef, settingsForPage, type PageId, type SettingId } from "@/components/settings/registry";
import type { Platform } from "@/lib/shortcuts";

/** `a > b` for plain `x.y.z` versions. Anything unparseable sorts as older. */
export function isNewerVersion(a: string, b: string): boolean {
  const parse = (v: string) => v.split(".").map((n) => Number.parseInt(n, 10));
  const [a1 = 0, a2 = 0, a3 = 0] = parse(a);
  const [b1 = 0, b2 = 0, b3 = 0] = parse(b);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

/**
 * Has this setting arrived since the user last looked?
 *
 * An empty `lastSeen` is a fresh install: nothing is new to someone who has
 * never seen the old version either.
 */
export function isNewSetting(id: SettingId, lastSeen: string): boolean {
  const addedIn = settingDef(id).addedIn;
  if (!addedIn || !lastSeen) return false;
  return isNewerVersion(addedIn, lastSeen);
}

/**
 * Pages that should wear a dot, given what the user has already seen.
 *
 * Rows hidden on this platform are excluded — they can never be rendered here,
 * so counting them would leave a dot that no amount of looking clears.
 */
export function pagesWithNewSettings(
  lastSeen: string,
  platform: Platform,
  seen: ReadonlySet<SettingId>,
): Set<PageId> {
  const pages = new Set<PageId>();
  for (const page of ["capture", "editor", "after", "library", "app"] as PageId[]) {
    const isNew = settingsForPage(page, platform).some(
      (id) => isNewSetting(id, lastSeen) && !seen.has(id),
    );
    if (isNew) pages.add(page);
  }
  return pages;
}

/** Every setting the user has now been shown, including what they saw before. */
export function newSettingsOnPage(
  page: PageId,
  lastSeen: string,
  platform: Platform,
): SettingId[] {
  return settingsForPage(page, platform).filter((id) => isNewSetting(id, lastSeen));
}

/**
 * Settings the user has been shown during this run.
 *
 * Kept in memory because it only has to survive until the version stamp is
 * written; the stamp itself is the durable record.
 */
export const useSeenSettings = create<{
  seen: Set<SettingId>;
  markSeen: (ids: SettingId[]) => void;
  reset: () => void;
}>((set) => ({
  seen: new Set<SettingId>(),
  markSeen: (ids) =>
    set((s) => {
      if (ids.every((id) => s.seen.has(id))) return s;
      const seen = new Set(s.seen);
      for (const id of ids) seen.add(id);
      return { seen };
    }),
  reset: () => set({ seen: new Set<SettingId>() }),
}));

/**
 * Record that a page has been looked at: its new rows stop being new, and once
 * nothing anywhere is new any more, the version stamp moves forward.
 *
 * The stamp is written through `update`, so it lands in the same store as
 * every other setting — `SettingsView` keeps it out of the autosave signature
 * so merely opening a page never claims "Saved".
 */
export async function markPageSeen(
  page: PageId,
  platform: Platform,
  opts: {
    lastSeen: string;
    appVersion: string | null;
    update: (patch: { lastSeenSettingsVersion: string }) => Promise<void>;
  },
): Promise<void> {
  const { lastSeen, appVersion, update } = opts;
  if (!appVersion) return;

  // First run with a version stamp: adopt the current version silently, so a
  // fresh install is not covered in badges for settings it never lost.
  if (!lastSeen) {
    await update({ lastSeenSettingsVersion: appVersion });
    return;
  }

  const onPage = newSettingsOnPage(page, lastSeen, platform);
  if (onPage.length > 0) useSeenSettings.getState().markSeen(onPage);

  const seen = useSeenSettings.getState().seen;
  const remaining = pagesWithNewSettings(lastSeen, platform, seen);
  if (remaining.size === 0 && isNewerVersion(appVersion, lastSeen)) {
    await update({ lastSeenSettingsVersion: appVersion });
    useSeenSettings.getState().reset();
  }
}
