/**
 * The single source of truth for what settings exist, where they live and what
 * they are called (CP-0053).
 *
 * Everything that has to reach a setting — the sidebar, search, `openSettings`
 * deep links, "New" badges — reads this table, so a setting is described once.
 * `SettingRow` renders labels from here and tags the DOM node with
 * `data-setting-id`; `SettingsView.drift.test.tsx` asserts the rendered ids
 * match this table exactly, which is what keeps the two from drifting.
 */

export const PAGES = [
  {
    id: "capture",
    label: "Capture",
    lede: "Shortcuts and what happens the moment you capture.",
  },
  {
    id: "editor",
    label: "Editor",
    lede: "How the annotation editor looks and behaves.",
  },
  {
    id: "after",
    label: "After capture",
    lede: "Where your screenshot goes.",
  },
  {
    id: "library",
    label: "Library",
    lede: "Workspaces, saved captures and stickers.",
  },
  {
    id: "app",
    label: "App",
    lede: "Startup, updates, privacy and troubleshooting.",
  },
] as const;

export type PageId = (typeof PAGES)[number]["id"];

export type SettingDef = {
  page: PageId;
  /** Row label. Plain language, sentence case, no trailing colon. */
  label: string;
  /** Sub-heading inside a page, e.g. "Shortcuts" or "Troubleshooting". */
  group?: string;
  /** Folded into "Advanced (n)" at the bottom of its page. */
  advanced?: boolean;
  /** Extra search terms that are not in the label. */
  keywords?: string[];
  /** Row only exists on this platform. */
  platform?: "mac" | "windows";
  /**
   * App version this setting first shipped in. Drives the "New" badge; leave
   * unset for settings that already existed.
   */
  addedIn?: string;
};

/** Rows in this group don't count towards the per-page visible-row budget. */
export const SHORTCUTS_GROUP = "Shortcuts";

/** Most rows a page may show before the Advanced fold (shortcuts excluded). */
export const MAX_VISIBLE_ROWS = 6;

export const SETTINGS = {
  // ── Capture ──────────────────────────────────────────────────────────────
  "capture.full": {
    page: "capture",
    label: "Full screen",
    group: SHORTCUTS_GROUP,
    keywords: ["hotkey", "shortcut"],
  },
  "capture.area": {
    page: "capture",
    label: "Area",
    group: SHORTCUTS_GROUP,
    keywords: ["hotkey", "shortcut", "region", "selection"],
  },
  "capture.window": {
    page: "capture",
    label: "Window",
    group: SHORTCUTS_GROUP,
    keywords: ["hotkey", "shortcut"],
  },
  "capture.scroll": {
    page: "capture",
    label: "Scrolling capture",
    group: SHORTCUTS_GROUP,
    keywords: ["hotkey", "shortcut", "long", "page"],
  },
  "capture.ring": {
    page: "capture",
    label: "Command ring",
    group: SHORTCUTS_GROUP,
    keywords: ["hotkey", "shortcut", "wheel", "menu"],
  },
  "capture.sysArea": {
    page: "capture",
    label: "System area capture",
    group: SHORTCUTS_GROUP,
    platform: "mac",
    keywords: ["hotkey", "shortcut", "macos", "screencapture"],
  },
  "capture.showEditor": {
    page: "capture",
    label: "Show editor",
    group: SHORTCUTS_GROUP,
    advanced: true,
    keywords: ["hotkey", "shortcut", "open"],
  },
  "capture.ringHold": {
    page: "capture",
    label: "Command ring (hold)",
    group: SHORTCUTS_GROUP,
    advanced: true,
    keywords: ["hotkey", "shortcut", "alt tab", "cycle"],
  },
  "capture.sound": {
    page: "capture",
    label: "Play sound on capture",
    keywords: ["shutter", "audio"],
  },
  "capture.ringModes": {
    page: "capture",
    label: "Command ring modes",
    advanced: true,
    keywords: ["wheel", "slots"],
  },
  "capture.backdrop": {
    page: "capture",
    label: "Add backdrop automatically",
    advanced: true,
    keywords: ["padding", "gradient", "frame"],
  },

  // ── Editor ───────────────────────────────────────────────────────────────
  "editor.theme": {
    page: "editor",
    label: "Appearance",
    keywords: ["theme", "dark mode", "light", "colour", "color"],
  },
  "editor.remember": {
    page: "editor",
    label: "Remember last tool, color and size",
    keywords: ["sticky"],
  },
  "editor.snap": {
    page: "editor",
    label: "Snap to edges and other elements",
    keywords: ["align", "guides"],
  },
  "editor.rulers": {
    page: "editor",
    label: "Show rulers",
    advanced: true,
    keywords: ["measure", "guides"],
  },
  "editor.keepToolActive": {
    page: "editor",
    label: "Keep tool active after use",
    advanced: true,
    keywords: ["sticky", "tools"],
  },
  "editor.canvas": {
    page: "editor",
    label: "Canvas background",
    advanced: true,
    keywords: ["checkerboard", "transparent"],
  },
  "editor.ontop": {
    page: "editor",
    label: "Keep editor on top",
    advanced: true,
    keywords: ["always on top", "float"],
  },
  "editor.size": {
    page: "editor",
    label: "Default window size",
    advanced: true,
    keywords: ["width", "height", "px"],
  },

  // ── After capture ────────────────────────────────────────────────────────
  "after.output": {
    page: "after",
    label: "After capturing",
    keywords: ["clipboard", "copy", "save", "default output"],
  },
  "after.folder": {
    page: "after",
    label: "Save folder",
    keywords: ["destination", "directory", "where"],
  },
  "after.format": {
    page: "after",
    label: "File format",
    keywords: ["png", "jpeg", "webp"],
  },
  "after.filename": {
    page: "after",
    label: "Filename",
    advanced: true,
    keywords: ["template", "naming", "date"],
  },
  "after.quality": {
    page: "after",
    label: "JPEG quality",
    advanced: true,
    keywords: ["compression", "size"],
  },
  "after.edge": {
    page: "after",
    label: "Shrink large images",
    advanced: true,
    keywords: ["longest edge", "resize", "downscale", "px"],
  },
  "after.onClose": {
    page: "after",
    label: "On closing the editor",
    advanced: true,
    keywords: ["hide", "esc", "export"],
  },
  "after.temp": {
    page: "after",
    label: "Temporary capture format",
    advanced: true,
    keywords: ["intermediate", "png", "jpeg", "speed"],
  },
  "after.tempQuality": {
    page: "after",
    label: "Temporary JPEG quality",
    advanced: true,
    keywords: ["intermediate", "compression"],
  },

  // ── Library ──────────────────────────────────────────────────────────────
  "library.workspaces": {
    page: "library",
    label: "Multiple workspaces",
    keywords: ["tabs", "sessions"],
  },
  "library.history": {
    page: "library",
    label: "Remember saved files",
    keywords: ["history", "recent", "captures"],
  },
  "library.stickers": {
    page: "library",
    label: "Stickers",
    keywords: ["emoji", "library", "images"],
  },
  "library.max": {
    page: "library",
    label: "Maximum workspaces",
    advanced: true,
  },
  "library.newCapture": {
    page: "library",
    label: "When a new capture arrives",
    advanced: true,
    keywords: ["workspace", "replace"],
  },
  "library.keep": {
    page: "library",
    label: "Keep the last",
    advanced: true,
    keywords: ["history", "limit"],
  },
  "library.showAs": {
    page: "library",
    label: "Show as",
    advanced: true,
    keywords: ["list", "thumbnails", "grid"],
  },
  "library.clear": {
    page: "library",
    label: "Clear the list",
    advanced: true,
    keywords: ["history", "remove", "forget"],
  },
  "library.archive": {
    page: "library",
    label: "Also keep every capture",
    advanced: true,
    keywords: ["archive", "captures folder"],
  },
  "library.archiveLimit": {
    page: "library",
    label: "Archive limit",
    advanced: true,
    keywords: ["size", "disk"],
  },
  "library.archiveUsage": {
    page: "library",
    label: "Currently using",
    advanced: true,
    keywords: ["archive", "disk", "space"],
  },

  // ── App ──────────────────────────────────────────────────────────────────
  "app.login": {
    page: "app",
    label: "Launch at login",
    keywords: ["startup", "autostart", "boot"],
  },
  "app.updates": {
    page: "app",
    label: "Check for updates automatically",
    keywords: ["update", "version", "upgrade"],
  },
  "app.feedback": {
    page: "app",
    label: "Send feedback",
    keywords: ["bug", "feature", "report", "contact"],
  },
  "app.about": {
    page: "app",
    label: "About capz",
    keywords: ["version", "tauri", "platform"],
  },
  "app.installId": {
    page: "app",
    label: "Share anonymous install ID",
    group: "Updates",
    advanced: true,
    keywords: ["privacy", "telemetry", "analytics"],
  },
  "app.interval": {
    page: "app",
    label: "Check interval",
    group: "Updates",
    advanced: true,
    keywords: ["daily", "weekly", "hours"],
  },
  "app.lastChecked": {
    page: "app",
    label: "Last checked",
    group: "Updates",
    advanced: true,
    keywords: ["update"],
  },
  "app.skipped": {
    page: "app",
    label: "Skipped version",
    group: "Updates",
    advanced: true,
    keywords: ["update", "ignore"],
  },
  "app.onboarding": {
    page: "app",
    label: "Run setup again",
    group: "Troubleshooting",
    advanced: true,
    keywords: ["onboarding", "welcome", "permissions"],
  },
  "app.tcc": {
    page: "app",
    label: "Fix screen permission after macOS update",
    group: "Troubleshooting",
    advanced: true,
    platform: "mac",
    keywords: ["tcc", "recording", "privacy", "permission"],
  },
  "app.reset": {
    page: "app",
    label: "Reset all settings",
    group: "Troubleshooting",
    advanced: true,
    keywords: ["default", "restore", "wipe"],
  },
} as const satisfies Record<string, SettingDef>;

export type SettingId = keyof typeof SETTINGS;

export const SETTING_IDS = Object.keys(SETTINGS) as SettingId[];

/**
 * `satisfies` keeps the literal ids for `SettingId` but narrows each value to
 * its own shape, so reading an optional field off `SETTINGS[id]` does not type
 * check. Everything goes through this widening accessor instead.
 */
export function settingDef(id: SettingId): SettingDef {
  return SETTINGS[id] as SettingDef;
}

export function isSettingId(value: unknown): value is SettingId {
  return typeof value === "string" && value in SETTINGS;
}

export function pageDef(id: PageId) {
  const page = PAGES.find((p) => p.id === id);
  if (!page) throw new Error(`unknown settings page: ${id}`);
  return page;
}

/** Ids on a page, in registry order, filtered to the platform in use. */
export function settingsForPage(
  page: PageId,
  platform: "mac" | "windows" | "linux",
  opts: { advanced?: boolean } = {},
): SettingId[] {
  return SETTING_IDS.filter((id) => {
    const def = settingDef(id);
    if (def.page !== page) return false;
    if (def.platform && def.platform !== platform) return false;
    if (opts.advanced !== undefined && Boolean(def.advanced) !== opts.advanced) {
      return false;
    }
    return true;
  });
}

/** Case-insensitive match over label, keywords and the page's own label. */
export function searchSettings(
  query: string,
  platform: "mac" | "windows" | "linux",
): SettingId[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SETTING_IDS.filter((id) => {
    const def = settingDef(id);
    if (def.platform && def.platform !== platform) return false;
    const haystack = [
      def.label,
      def.group ?? "",
      pageDef(def.page).label,
      ...(def.keywords ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
