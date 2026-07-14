export type Platform = "mac" | "win";

export function currentPlatform(): Platform {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
    ? "mac"
    : "win";
}

// ---- IPC types (hand-mirrored from Rust; keep in sync with shortcuts.rs) ----
export type RegoStatus = "ok" | "invalid" | "taken" | "reserved";
export type HotkeyAction =
  | "captureFull"
  | "captureArea"
  | "captureWindow"
  | "captureScroll"
  | "showEditor"
  | "commandRing";
export type RegoResult = {
  action: HotkeyAction;
  requested: string;
  effective: string;
  status: RegoStatus;
};
export type HotkeyProbe = { status: RegoStatus };

const KEY_DISPLAY_MAC: Record<string, string> = {
  CmdOrCtrl: "⌘",
  Cmd: "⌘",
  Meta: "⌘",
  Super: "⌘",
  Ctrl: "⌃",
  Control: "⌃",
  Alt: "⌥",
  Option: "⌥",
  Shift: "⇧",
  Enter: "↩",
  Return: "↩",
  Escape: "⎋",
  Esc: "⎋",
  Backspace: "⌫",
  Delete: "⌦",
  Tab: "⇥",
  Space: "␣",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

const KEY_DISPLAY_WIN: Record<string, string> = {
  CmdOrCtrl: "Ctrl",
  Cmd: "Win",
  Meta: "Win",
  Super: "Win",
  Control: "Ctrl",
  Option: "Alt",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

const MODIFIERS = new Set([
  "CmdOrCtrl",
  "Cmd",
  "Ctrl",
  "Control",
  "Meta",
  "Super",
  "Alt",
  "Option",
  "Shift",
]);

const RESERVED_MAC = new Set([
  "Cmd+Space",
  "Cmd+Tab",
  "Cmd+Q",
  "Cmd+Shift+3",
  "Cmd+Shift+4",
  "Cmd+Shift+5",
]);

const RESERVED_WIN = new Set([
  "CmdOrCtrl+Shift+Escape",
  "Alt+Tab",
  "Alt+Shift+Tab",
  "Alt+Escape",
  "Alt+F4",
  "CmdOrCtrl+Escape",
]);

export function formatShortcut(accel: string, platform: Platform = currentPlatform()): string {
  if (!accel) return "";
  const map = platform === "mac" ? KEY_DISPLAY_MAC : KEY_DISPLAY_WIN;
  const parts = accel.split("+").map((p) => map[p] ?? p);
  return platform === "mac" ? parts.join("") : parts.join("+");
}

export function isReserved(accel: string, platform: Platform = currentPlatform()): boolean {
  if (platform === "mac") {
    return RESERVED_MAC.has(accel.replace(/CmdOrCtrl/g, "Cmd"));
  }
  return RESERVED_WIN.has(accel);
}

export type AccelEvent = { ok: true; accel: string } | { ok: false; reason: "none" | "win" };

function tokenFromEvent(e: KeyboardEvent): string {
  const code = e.code;
  let m: RegExpMatchArray | null;
  if ((m = code.match(/^Digit([0-9])$/)) || (m = code.match(/^Numpad([0-9])$/))) return m[1];
  if ((m = code.match(/^Key([A-Z])$/))) return m[1];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (code === "Space") return "Space"; // before the length===1 catch (Space fix)
  const key = e.key;
  if (key.length === 1) return key.toUpperCase();
  if (key.startsWith("Arrow")) return key;
  return key;
}

export function eventToAccelerator(
  e: KeyboardEvent,
  platform: Platform = currentPlatform(),
): AccelEvent | null {
  const key = e.key;
  if (!key || MODIFIERS.has(key) || key === "Meta" || key === "Control") return null;

  const parts: string[] = [];
  if (platform === "mac") {
    if (e.metaKey) parts.push("CmdOrCtrl");
    else if (e.ctrlKey) parts.push("Ctrl");
  } else {
    if (e.metaKey) return { ok: false, reason: "win" }; // ⊞ Win disallowed on Windows
    if (e.ctrlKey) parts.push("CmdOrCtrl");
  }
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  if (parts.length === 0) return { ok: false, reason: "none" };
  return { ok: true, accel: [...parts, tokenFromEvent(e)].join("+") };
}

export type AccelValidation =
  | { ok: true }
  | { ok: false; reason: "invalid" | "reserved" | "win" | "no-modifier" };

export function validateAccelerator(
  accel: string,
  platform: Platform = currentPlatform(),
): AccelValidation {
  if (!accel) return { ok: false, reason: "invalid" };
  const parts = accel.split("+");
  if (parts.some((p) => p.trim() === "")) return { ok: false, reason: "invalid" };
  const keys = parts.filter((p) => !MODIFIERS.has(p));
  const mods = parts.filter((p) => MODIFIERS.has(p));
  if (keys.length !== 1) return { ok: false, reason: "invalid" };
  if (platform === "win" && parts.some((p) => p === "Cmd" || p === "Meta" || p === "Super")) {
    return { ok: false, reason: "win" };
  }
  if (mods.length === 0) return { ok: false, reason: "no-modifier" };
  if (isReserved(accel, platform)) return { ok: false, reason: "reserved" };
  return { ok: true };
}

export function statusMessage(accel: string, status: RegoStatus): string | null {
  switch (status) {
    case "ok":
      return null;
    case "taken":
      return `${accel} is already used by another app`;
    case "reserved":
      return `${accel} is reserved by the OS`;
    case "invalid":
      return `${accel} isn't a valid shortcut`;
  }
}
