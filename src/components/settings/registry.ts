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

import type { Platform } from "@/lib/shortcuts";
import { t, translate, LANGS, type TKey } from "@/i18n/store";

/**
 * Labels are dictionary keys, not strings: this module is evaluated at import
 * time, before the language is known, so text is resolved with `t()` where it
 * is rendered (see `settingLabel`, `pageLabel`).
 */
export const PAGES = [
  {
    id: "capture",
    labelKey: "settings.page.capture",
    ledeKey: "settings.page.capture.lede",
  },
  {
    id: "editor",
    labelKey: "settings.page.editor",
    ledeKey: "settings.page.editor.lede",
  },
  {
    id: "after",
    labelKey: "settings.page.after",
    ledeKey: "settings.page.after.lede",
  },
  {
    id: "library",
    labelKey: "settings.page.library",
    ledeKey: "settings.page.library.lede",
  },
  {
    id: "app",
    labelKey: "settings.page.app",
    ledeKey: "settings.page.app.lede",
  },
] as const satisfies readonly { id: string; labelKey: TKey; ledeKey: TKey }[];

export type PageId = (typeof PAGES)[number]["id"];

export type SettingDef = {
  page: PageId;
  /** Row label. Plain language, sentence case, no trailing colon. */
  labelKey: TKey;
  /** Sub-heading inside a page, e.g. "Shortcuts" or "Troubleshooting". */
  group?: TKey;
  /** Folded into "Advanced (n)" at the bottom of its page. */
  advanced?: boolean;
  /** Extra search terms that are not in the label. */
  keywords?: string[];
  /** Thai search terms, matched whatever the UI language. */
  keywordsTh?: string[];
  /** Row only exists on this platform (matches `currentPlatform()`). */
  platform?: Platform;
  /**
   * App version this setting first shipped in. Drives the "New" badge; leave
   * unset for settings that already existed.
   */
  addedIn?: string;
};

/** Rows in this group don't count towards the per-page visible-row budget. */
export const SHORTCUTS_GROUP: TKey = "settings.group.shortcuts";

/** Most rows a page may show before the Advanced fold (shortcuts excluded). */
export const MAX_VISIBLE_ROWS = 6;

export const SETTINGS = {
  // ── Capture ──────────────────────────────────────────────────────────────
  "capture.full": {
    page: "capture",
    labelKey: "settings.capture.full",
    group: SHORTCUTS_GROUP,
    keywords: ["hotkey", "shortcut"],
    keywordsTh: ["ปุ่มลัด", "จับภาพ", "เต็มจอ"],
  },
  "capture.area": {
    page: "capture",
    labelKey: "settings.capture.area",
    group: SHORTCUTS_GROUP,
    keywords: ["hotkey", "shortcut", "region", "selection"],
    keywordsTh: ["ปุ่มลัด", "จับภาพ", "พื้นที่", "เลือกพื้นที่"],
  },
  "capture.window": {
    page: "capture",
    labelKey: "settings.capture.window",
    group: SHORTCUTS_GROUP,
    keywords: ["hotkey", "shortcut"],
    keywordsTh: ["ปุ่มลัด", "จับภาพ"],
  },
  "capture.scroll": {
    page: "capture",
    labelKey: "settings.capture.scroll",
    group: SHORTCUTS_GROUP,
    keywords: ["hotkey", "shortcut", "long", "page"],
    keywordsTh: ["ปุ่มลัด", "เลื่อน", "ยาว", "ทั้งหน้า"],
  },
  "capture.ring": {
    page: "capture",
    labelKey: "settings.capture.ring",
    group: SHORTCUTS_GROUP,
    keywords: ["hotkey", "shortcut", "wheel", "menu"],
    keywordsTh: ["ปุ่มลัด", "วงล้อ", "เมนู"],
  },
  "capture.sysArea": {
    page: "capture",
    labelKey: "settings.capture.sysArea",
    group: SHORTCUTS_GROUP,
    platform: "mac",
    keywords: ["hotkey", "shortcut", "macos", "screencapture"],
    keywordsTh: ["ปุ่มลัด", "ระบบ", "จับภาพหน้าจอ"],
  },
  "capture.showEditor": {
    page: "capture",
    labelKey: "settings.capture.showEditor",
    group: SHORTCUTS_GROUP,
    advanced: true,
    keywords: ["hotkey", "shortcut", "open"],
    keywordsTh: ["ปุ่มลัด", "เปิด"],
  },
  "capture.ringHold": {
    page: "capture",
    labelKey: "settings.capture.ringHold",
    group: SHORTCUTS_GROUP,
    advanced: true,
    keywords: ["hotkey", "shortcut", "alt tab", "cycle"],
    keywordsTh: ["ปุ่มลัด", "กดค้าง", "สลับ"],
  },
  "capture.sound": {
    page: "capture",
    labelKey: "settings.capture.sound",
    keywords: ["shutter", "audio"],
    keywordsTh: ["เสียง", "ชัตเตอร์"],
  },
  "capture.ringModes": {
    page: "capture",
    labelKey: "settings.capture.ringModes",
    advanced: true,
    keywords: ["wheel", "slots"],
    keywordsTh: ["วงล้อ", "ช่อง", "โหมด"],
  },
  "capture.backdrop": {
    page: "capture",
    labelKey: "settings.capture.backdrop",
    advanced: true,
    keywords: ["padding", "gradient", "frame"],
    keywordsTh: ["พื้นหลัง", "ระยะขอบ", "ไล่สี", "กรอบ"],
  },

  // ── Editor ───────────────────────────────────────────────────────────────
  "editor.theme": {
    page: "editor",
    labelKey: "settings.editor.theme",
    keywords: ["theme", "dark mode", "light", "colour", "color"],
    keywordsTh: ["ธีม", "มืด", "สว่าง", "สี"],
  },
  "editor.remember": {
    page: "editor",
    labelKey: "settings.editor.remember",
    keywords: ["sticky"],
    keywordsTh: ["จำ", "เครื่องมือ"],
  },
  "editor.snap": {
    page: "editor",
    labelKey: "settings.editor.snap",
    keywords: ["align", "guides"],
    keywordsTh: ["จัดแนว", "เส้นนำ"],
  },
  "editor.rulers": {
    page: "editor",
    labelKey: "settings.editor.rulers",
    advanced: true,
    keywords: ["measure", "guides"],
    keywordsTh: ["ไม้บรรทัด", "วัด", "เส้นนำ"],
  },
  "editor.keepToolActive": {
    page: "editor",
    labelKey: "settings.editor.keepToolActive",
    advanced: true,
    keywords: ["sticky", "tools"],
    keywordsTh: ["เครื่องมือ", "ค้าง"],
  },
  "editor.canvas": {
    page: "editor",
    labelKey: "settings.editor.canvas",
    advanced: true,
    keywords: ["checkerboard", "transparent"],
    keywordsTh: ["แคนวาส", "โปร่งใส", "ตาราง"],
  },
  "editor.ontop": {
    page: "editor",
    labelKey: "settings.editor.ontop",
    advanced: true,
    keywords: ["always on top", "float"],
    keywordsTh: ["บนสุด", "ลอย"],
  },
  "editor.size": {
    page: "editor",
    labelKey: "settings.editor.size",
    advanced: true,
    keywords: ["width", "height", "px"],
    keywordsTh: ["ขนาด", "กว้าง", "สูง", "px"],
  },

  // ── Saving (page id "after") ─────────────────────────────────────────────
  "after.onClose": {
    page: "after",
    labelKey: "settings.after.onClose",
    keywords: ["esc", "escape", "hide", "export", "auto", "after capture", "clipboard", "copy", "save"],
    keywordsTh: ["ปิด", "ส่งออก", "อัตโนมัติ", "คลิปบอร์ด", "คัดลอก", "บันทึก"],
  },
  "after.folder": {
    page: "after",
    labelKey: "settings.after.folder",
    keywords: ["destination", "directory", "where"],
    keywordsTh: ["โฟลเดอร์", "ปลายทาง", "ที่เก็บ"],
  },
  "after.format": {
    page: "after",
    labelKey: "settings.after.format",
    keywords: ["png", "jpeg", "webp"],
    keywordsTh: ["รูปแบบ", "นามสกุล", "ไฟล์"],
  },
  "after.filename": {
    page: "after",
    labelKey: "settings.after.filename",
    advanced: true,
    keywords: ["template", "naming", "date"],
    keywordsTh: ["ชื่อไฟล์", "รูปแบบ", "วันที่"],
  },
  "after.quality": {
    page: "after",
    labelKey: "settings.after.quality",
    advanced: true,
    keywords: ["compression", "size"],
    keywordsTh: ["คุณภาพ", "บีบอัด", "ขนาด"],
  },
  "after.edge": {
    page: "after",
    labelKey: "settings.after.edge",
    advanced: true,
    keywords: ["longest edge", "resize", "downscale", "px"],
    keywordsTh: ["ย่อ", "ขนาด", "ความละเอียด", "px"],
  },
  "after.temp": {
    page: "after",
    labelKey: "settings.after.temp",
    advanced: true,
    keywords: ["intermediate", "png", "jpeg", "speed"],
    keywordsTh: ["ชั่วคราว", "ความเร็ว"],
  },
  "after.tempQuality": {
    page: "after",
    labelKey: "settings.after.tempQuality",
    advanced: true,
    keywords: ["intermediate", "compression"],
    keywordsTh: ["ชั่วคราว", "คุณภาพ", "บีบอัด"],
  },

  // ── Library ──────────────────────────────────────────────────────────────
  "library.workspaces": {
    page: "library",
    labelKey: "settings.library.workspaces",
    keywords: ["tabs", "sessions"],
    keywordsTh: ["เวิร์กสเปซ", "แท็บ"],
  },
  "library.history": {
    page: "library",
    labelKey: "settings.library.history",
    keywords: ["history", "recent", "captures"],
    keywordsTh: ["ประวัติ", "ล่าสุด", "ไฟล์"],
  },
  "library.stickers": {
    page: "library",
    labelKey: "settings.library.stickers",
    keywords: ["emoji", "library", "images"],
    keywordsTh: ["สติกเกอร์", "อีโมจิ", "ภาพ"],
  },
  "library.max": {
    page: "library",
    labelKey: "settings.library.max",
    advanced: true,
    keywordsTh: ["เวิร์กสเปซ", "สูงสุด"],
  },
  "library.newCapture": {
    page: "library",
    labelKey: "settings.library.newCapture",
    advanced: true,
    keywords: ["workspace", "replace"],
    keywordsTh: ["เวิร์กสเปซ", "แทนที่"],
  },
  "library.keep": {
    page: "library",
    labelKey: "settings.library.keep",
    advanced: true,
    keywords: ["history", "limit"],
    keywordsTh: ["ประวัติ", "จำนวน"],
  },
  "library.showAs": {
    page: "library",
    labelKey: "settings.library.showAs",
    advanced: true,
    keywords: ["list", "thumbnails", "grid"],
    keywordsTh: ["รายการ", "ภาพย่อ"],
  },
  "library.clear": {
    page: "library",
    labelKey: "settings.library.clear",
    advanced: true,
    keywords: ["history", "remove", "forget"],
    keywordsTh: ["ประวัติ", "ล้าง", "ลบ"],
  },
  "library.archive": {
    page: "library",
    labelKey: "settings.library.archive",
    advanced: true,
    keywords: ["archive", "captures folder"],
    keywordsTh: ["สำรอง", "เก็บ"],
  },
  "library.archiveLimit": {
    page: "library",
    labelKey: "settings.library.archiveLimit",
    advanced: true,
    keywords: ["size", "disk"],
    keywordsTh: ["สำรอง", "ขนาด", "ดิสก์"],
  },
  "library.archiveUsage": {
    page: "library",
    labelKey: "settings.library.archiveUsage",
    advanced: true,
    keywords: ["archive", "disk", "space"],
    keywordsTh: ["สำรอง", "ดิสก์", "พื้นที่"],
  },

  // ── App ──────────────────────────────────────────────────────────────────
  "app.language": {
    page: "app",
    labelKey: "settings.app.language",
    keywords: ["language", "thai", "english", "locale"],
    keywordsTh: ["ภาษา", "ไทย", "อังกฤษ"],
    addedIn: "0.15.0",
  },
  "app.login": {
    page: "app",
    labelKey: "settings.app.login",
    keywords: ["startup", "autostart", "boot"],
    keywordsTh: ["เปิดเครื่อง", "เริ่มอัตโนมัติ"],
  },
  "app.updates": {
    page: "app",
    labelKey: "settings.app.updates",
    keywords: ["update", "version", "upgrade"],
    keywordsTh: ["อัปเดต", "เวอร์ชัน"],
  },
  "app.feedback": {
    page: "app",
    labelKey: "settings.app.feedback",
    keywords: ["bug", "feature", "report", "contact"],
    keywordsTh: ["ความคิดเห็น", "แจ้งปัญหา", "ฟีเจอร์", "ติดต่อ"],
  },
  "app.about": {
    page: "app",
    labelKey: "settings.app.about",
    keywords: ["version", "tauri", "platform"],
    keywordsTh: ["เวอร์ชัน", "เกี่ยวกับ"],
  },
  "app.installId": {
    page: "app",
    labelKey: "settings.app.installId",
    group: "settings.group.updates",
    advanced: true,
    keywords: ["privacy", "telemetry", "analytics"],
    keywordsTh: ["ความเป็นส่วนตัว", "สถิติ"],
  },
  "app.interval": {
    page: "app",
    labelKey: "settings.app.interval",
    group: "settings.group.updates",
    advanced: true,
    keywords: ["daily", "weekly", "hours"],
    keywordsTh: ["ความถี่", "รายวัน", "รายสัปดาห์"],
  },
  "app.lastChecked": {
    page: "app",
    labelKey: "settings.app.lastChecked",
    group: "settings.group.updates",
    advanced: true,
    keywords: ["update"],
    keywordsTh: ["อัปเดต", "ตรวจ"],
  },
  "app.skipped": {
    page: "app",
    labelKey: "settings.app.skipped",
    group: "settings.group.updates",
    advanced: true,
    keywords: ["update", "ignore"],
    keywordsTh: ["อัปเดต", "ข้าม"],
  },
  "app.onboarding": {
    page: "app",
    labelKey: "settings.app.onboarding",
    group: "settings.group.troubleshooting",
    advanced: true,
    keywords: ["onboarding", "welcome", "permissions"],
    keywordsTh: ["เริ่มต้นใช้งาน", "ยินดีต้อนรับ", "สิทธิ์"],
  },
  "app.tcc": {
    page: "app",
    labelKey: "settings.app.tcc",
    group: "settings.group.troubleshooting",
    advanced: true,
    platform: "mac",
    keywords: ["tcc", "recording", "privacy", "permission"],
    keywordsTh: ["สิทธิ์", "บันทึกหน้าจอ", "ความเป็นส่วนตัว"],
  },
  "app.reset": {
    page: "app",
    labelKey: "settings.app.reset",
    group: "settings.group.troubleshooting",
    advanced: true,
    keywords: ["default", "restore", "wipe"],
    keywordsTh: ["คืนค่าเริ่มต้น", "รีเซ็ต", "ล้าง"],
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
  platform: Platform,
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

/** A row's label in the current language. */
export function settingLabel(id: SettingId): string {
  return t(settingDef(id).labelKey);
}

/** A page's sidebar name in the current language. */
export function pageLabel(id: PageId): string {
  return t(pageDef(id).labelKey);
}

/**
 * Case-insensitive match over label, group, keywords and the page's own label —
 * in every UI language at once, so an English term still finds a row while the
 * UI is Thai and vice versa.
 */
export function searchSettings(
  query: string,
  platform: Platform,
): SettingId[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SETTING_IDS.filter((id) => {
    const def = settingDef(id);
    if (def.platform && def.platform !== platform) return false;
    const keys = [def.labelKey, pageDef(def.page).labelKey, ...(def.group ? [def.group] : [])];
    const haystack = [
      ...LANGS.flatMap((lang) => keys.map((key) => translate(lang, key))),
      ...(def.keywords ?? []),
      ...(def.keywordsTh ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
