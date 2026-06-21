//! Pure accelerator classification shared by registration and the record-time
//! probe. No Tauri app handle required, so it is unit-testable in isolation.

use std::str::FromStr;
use tauri_plugin_global_shortcut::Shortcut;

/// Disposition of a requested accelerator string.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccelClass {
    /// Parses and satisfies our policy — safe to attempt to register.
    Valid,
    /// Unparseable, or violates the "≥1 modifier / single key / no Win" policy.
    Invalid,
    /// Parses but collides with an OS-reserved combo we refuse to bind.
    Reserved,
}

/// Windows combos we refuse even though `RegisterHotKey` might accept them —
/// binding them breaks core OS UX. Win+ combos are rejected separately (the
/// SUPER modifier is disallowed on Windows), so this is the non-Win set.
const RESERVED_WIN: &[&str] = &[
    "CmdOrCtrl+Shift+Escape", // Task Manager
    "Alt+Tab",
    "Alt+Shift+Tab",
    "Alt+Escape",
    "Alt+F4",
    "CmdOrCtrl+Escape",
];

/// macOS combos the OS owns and silently swallows.
const RESERVED_MAC: &[&str] = &[
    "CmdOrCtrl+Space",
    "CmdOrCtrl+Tab",
    "CmdOrCtrl+Q",
    "CmdOrCtrl+Shift+3",
    "CmdOrCtrl+Shift+4",
    "CmdOrCtrl+Shift+5",
];

/// Reserved check by parsed equality so it is independent of token spelling
/// (e.g. "Cmd+Space" vs "CmdOrCtrl+Space" parse equal on macOS).
fn is_reserved(sc: &Shortcut, is_windows: bool) -> bool {
    let list = if is_windows { RESERVED_WIN } else { RESERVED_MAC };
    list.iter()
        .filter_map(|r| Shortcut::from_str(r).ok())
        .any(|r| r == *sc)
}

/// True if any '+'-separated token is a Windows/⊞ key token. Checked on the
/// requested string (not via parsed `Modifiers`) because `CmdOrCtrl` parses to
/// SUPER on macOS builds and CONTROL on Windows builds — a compile-time mapping
/// that the parsed bit cannot distinguish from a real Win-key request. The
/// recorder never emits these tokens; this guards injected/legacy config.
fn has_win_token(accel: &str) -> bool {
    accel.split('+').any(|t| {
        matches!(
            t.trim().to_ascii_uppercase().as_str(),
            "SUPER" | "WIN" | "CMD" | "COMMAND" | "META"
        )
    })
}

pub fn classify(accel: &str, is_windows: bool) -> AccelClass {
    // The Win/⊞ key is OS-reserved and unbindable on Windows.
    if is_windows && has_win_token(accel) {
        return AccelClass::Invalid;
    }
    let Ok(sc) = Shortcut::from_str(accel) else {
        return AccelClass::Invalid;
    };
    // Policy the parser does NOT enforce: a bare key would hijack it globally.
    if sc.mods.is_empty() {
        return AccelClass::Invalid;
    }
    if is_reserved(&sc, is_windows) {
        return AccelClass::Reserved;
    }
    AccelClass::Valid
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_combo_with_modifiers() {
        assert_eq!(classify("CmdOrCtrl+Shift+A", false), AccelClass::Valid);
        assert_eq!(classify("CmdOrCtrl+Shift+A", true), AccelClass::Valid);
    }

    #[test]
    fn space_is_valid_when_named() {
        assert_eq!(classify("CmdOrCtrl+Shift+Space", true), AccelClass::Valid);
    }

    #[test]
    fn bare_key_rejected_by_policy_though_parser_accepts() {
        // "3" parses fine (single-key branch) but has no modifier.
        assert_eq!(classify("3", true), AccelClass::Invalid);
    }

    #[test]
    fn modifiers_only_rejected() {
        assert_eq!(classify("CmdOrCtrl+Shift+Alt", true), AccelClass::Invalid);
    }

    #[test]
    fn empty_token_rejected() {
        assert_eq!(classify("CmdOrCtrl+Shift+", true), AccelClass::Invalid);
    }

    #[test]
    fn win_key_rejected_on_windows() {
        assert_eq!(classify("Super+Shift+S", true), AccelClass::Invalid);
    }

    #[test]
    fn reserved_mac_and_win() {
        assert_eq!(classify("CmdOrCtrl+Space", false), AccelClass::Reserved);
        assert_eq!(classify("Alt+Tab", true), AccelClass::Reserved);
    }
}
