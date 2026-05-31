const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

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

export function formatShortcut(accel: string): string {
  if (!accel) return "";
  const map = IS_MAC ? KEY_DISPLAY_MAC : KEY_DISPLAY_WIN;
  const parts = accel.split("+").map((p) => map[p] ?? p);
  return IS_MAC ? parts.join("") : parts.join("+");
}

export function isReserved(accel: string): boolean {
  if (!IS_MAC) return false;
  const normalized = accel.replace(/CmdOrCtrl/g, "Cmd");
  return RESERVED_MAC.has(normalized);
}

export function eventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("CmdOrCtrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  const key = e.key;
  if (!key || MODIFIERS.has(key) || key === "Meta" || key === "Control") return null;

  // Derive the token from the physical key (e.code) so it is independent of
  // Shift (Shift+1 stays "1", not "!") and of the active keyboard layout
  // (Thai physical P labelled "ญ" stays "P"). Fall back to e.key for keys that
  // e.code does not cleanly map (Enter, Escape, arrows, etc.).
  const code = e.code;
  let token: string;
  let m: RegExpMatchArray | null;
  if ((m = code.match(/^Digit([0-9])$/)) || (m = code.match(/^Numpad([0-9])$/))) {
    token = m[1];
  } else if ((m = code.match(/^Key([A-Z])$/))) {
    token = m[1];
  } else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) {
    token = code;
  } else if (key.length === 1) {
    token = key.toUpperCase();
  } else if (key.startsWith("Arrow")) {
    token = key;
  } else if (key === " ") {
    token = "Space";
  } else {
    token = key;
  }

  if (parts.length === 0) return null;
  parts.push(token);
  return parts.join("+");
}
