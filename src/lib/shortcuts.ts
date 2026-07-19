export type Platform = "mac" | "win";

export function currentPlatform(): Platform {
  if (typeof navigator === "undefined") return "win";
  // `navigator.platform` is deprecated; prefer `userAgentData.platform` where
  // the engine exposes it, falling back for those that don't.
  const uaPlatform = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData?.platform;
  return /Mac|iPhone|iPad/.test(uaPlatform || navigator.platform || "")
    ? "mac"
    : "win";
}

// ---- IPC types (hand-mirrored from Rust; keep in sync with shortcuts.rs) ----
/** Mirrors Rust `RegoStatus` (src-tauri/src/shortcuts.rs) — hand-kept in sync.
 *  `needsModifier`: valid, but unusable for the hold ring, which needs a
 *  modifier to release. */
export type RegoStatus = "ok" | "invalid" | "taken" | "needsModifier";
export type HotkeyAction =
  | "captureFull"
  | "captureArea"
  | "captureWindow"
  | "captureScroll"
  // macOS-only (system area capture); Rust emits this in RegoResult.action.
  | "captureSystemArea"
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

// Combos the OS shell normally owns. CP-0037(a): these are a WARNING, not a
// refusal — Cmd+Shift+3/4/5 in particular are user-disableable in System
// Settings, so a user who turned them off can legitimately claim them. The
// live registration attempt (reported as "taken") is the real authority.
const OS_OWNED_MAC = new Set([
  "Cmd+Space",
  "Cmd+Tab",
  "Cmd+Q",
  "Cmd+Shift+3",
  "Cmd+Shift+4",
  "Cmd+Shift+5",
]);

const OS_OWNED_WIN = new Set([
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

// True when the OS shell usually owns this combo. Advisory only — callers
// warn and still allow the binding. Mirrors `RESERVED_MAC`/`RESERVED_WIN` in
// `src-tauri/src/accel.rs`; keep the two lists in sync by hand.
export function isOsOwned(accel: string, platform: Platform = currentPlatform()): boolean {
  if (platform === "mac") {
    return OS_OWNED_MAC.has(accel.replace(/CmdOrCtrl/g, "Cmd"));
  }
  return OS_OWNED_WIN.has(accel);
}

// Bare F13–F20 are bindable without a modifier: they carry no default OS or
// app meaning and are the conventional capture-tool binding. Mirrors
// `is_bare_high_function_key` in `src-tauri/src/accel.rs`.
export function isBareHighFunctionKey(accel: string): boolean {
  return /^F(1[3-9]|20)$/i.test(accel.trim());
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

  const token = tokenFromEvent(e);
  // F13–F20 bind bare; everything else still needs a modifier.
  if (parts.length === 0 && !isBareHighFunctionKey(token)) {
    return { ok: false, reason: "none" };
  }
  return { ok: true, accel: [...parts, token].join("+") };
}

export type AccelValidation =
  | { ok: true; warning?: "os-owned" }
  | { ok: false; reason: "invalid" | "win" | "no-modifier" };

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
  if (mods.length === 0 && !isBareHighFunctionKey(keys[0])) {
    return { ok: false, reason: "no-modifier" };
  }
  if (isOsOwned(accel, platform)) return { ok: true, warning: "os-owned" };
  return { ok: true };
}

export function statusMessage(accel: string, status: RegoStatus): string | null {
  switch (status) {
    case "ok":
      return null;
    case "taken":
      return `${accel} is already claimed by the OS or another app`;
    case "invalid":
      return `${accel} isn't a valid shortcut`;
    case "needsModifier":
      return `${accel} needs a modifier — the hold ring fires when you release it`;
  }
}
