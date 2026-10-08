// CP-0061: editor shortcuts match on e.key, which is the character the active
// keyboard layout types. Under Thai (or any non-Latin layout) Ctrl+Z reports
// "ผ", so every letter shortcut silently failed. Fall back to the physical key
// from e.code when the layout produced no ASCII character.

const PUNCT_CODES: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
};

function physicalKey(code: string): string | null {
  let m: RegExpMatchArray | null;
  if ((m = code.match(/^Key([A-Z])$/))) return m[1].toLowerCase();
  if ((m = code.match(/^Digit([0-9])$/))) return m[1];
  return PUNCT_CODES[code] ?? null;
}

/**
 * The key a shortcut should match on. ASCII `e.key` is kept as is, so Latin
 * layouts (AZERTY, Dvorak) still match the printed letter; a non-ASCII key
 * falls back to the US character of the physical key. Alt/Option combos are
 * left alone — macOS Option+letter types symbols, not shortcuts.
 */
export function shortcutKey(e: KeyboardEvent): string {
  const key = e.key;
  if (e.altKey || !e.code) return key;
  const physical = physicalKey(e.code);
  if (!physical) return key;
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7f]/.test(key)) return physical;
  // Thai Shift+Z types "(" — Ctrl/⌘+Shift+letter on a Latin layout always
  // yields a letter, so this only kicks in for non-Latin layouts.
  if (
    (e.ctrlKey || e.metaKey) &&
    e.shiftKey &&
    e.code.startsWith("Key") &&
    !/^[a-z]$/i.test(key)
  ) {
    return physical;
  }
  return key;
}
