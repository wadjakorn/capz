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
    /// Parses, and we attempt registration anyway, but the OS shell usually
    /// owns this combo. Callers should warn the user; the live registration
    /// attempt stays the authority on whether it actually binds.
    Discouraged,
}

/// Windows combos the OS shell normally owns. Binding them is usually a bad
/// idea, but it is the user's call — we warn and let `RegisterHotKey` have the
/// final say. Win+ combos are rejected outright elsewhere (the SUPER modifier
/// is disallowed on Windows), so this is the non-Win set.
const RESERVED_WIN: &[&str] = &[
    "CmdOrCtrl+Shift+Escape", // Task Manager
    "Alt+Tab",
    "Alt+Shift+Tab",
    "Alt+Escape",
    "Alt+F4",
    "CmdOrCtrl+Escape",
];

/// macOS combos the OS normally owns and silently swallows. Cmd+Shift+3/4/5
/// are user-disableable in System Settings > Keyboard > Shortcuts, so a user
/// who has turned the system screenshot shortcuts off can legitimately claim
/// them — hence warn rather than refuse.
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
/// True for bare F13–F20. These keys exist on full-size/extended keyboards,
/// carry no default OS or app meaning, and are the conventional binding for
/// capture tools — so they are the one exception to the ≥1-modifier rule.
/// Checked on the raw token for the same reason as `has_win_token`.
fn is_bare_high_function_key(accel: &str) -> bool {
    matches!(
        accel.trim().to_ascii_uppercase().as_str(),
        "F13" | "F14" | "F15" | "F16" | "F17" | "F18" | "F19" | "F20"
    )
}

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
    // F13–F20 are exempt — nothing else claims them.
    if sc.mods.is_empty() && !is_bare_high_function_key(accel) {
        return AccelClass::Invalid;
    }
    if is_reserved(&sc, is_windows) {
        return AccelClass::Discouraged;
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

    /// CP-0037(a). These used to be a hard refusal. They are now attempted —
    /// the OS decides — so classification must be Discouraged, not Invalid.
    #[test]
    fn os_owned_combos_are_discouraged_not_refused() {
        for accel in ["CmdOrCtrl+Space", "CmdOrCtrl+Shift+3", "CmdOrCtrl+Shift+5"] {
            assert_eq!(classify(accel, false), AccelClass::Discouraged, "{accel}");
        }
        for accel in ["Alt+Tab", "CmdOrCtrl+Shift+Escape"] {
            assert_eq!(classify(accel, true), AccelClass::Discouraged, "{accel}");
        }
    }

    /// CP-0037(a). Bare F13–F20 are bindable; every other bare key is not.
    #[test]
    fn bare_high_function_keys_accepted_others_still_rejected() {
        for accel in ["F13", "F16", "F20", "f18"] {
            assert_eq!(classify(accel, false), AccelClass::Valid, "{accel}");
            assert_eq!(classify(accel, true), AccelClass::Valid, "{accel}");
        }
        // Just outside the range, and ordinary keys, stay modifier-gated.
        for accel in ["F12", "F21", "A", "Space", "Escape"] {
            assert_eq!(classify(accel, true), AccelClass::Invalid, "{accel}");
        }
        // The exemption is for BARE keys only — modified F13 is still fine.
        assert_eq!(classify("CmdOrCtrl+F13", true), AccelClass::Valid);
    }
}
