//! Pure accelerator classification shared by registration and the record-time
//! probe. No Tauri app handle required, so it is unit-testable in isolation.

use std::str::FromStr;
use tauri_plugin_global_shortcut::Shortcut;

/// Which OS's shortcut policy applies. A parameter (not a `cfg!`) so every
/// platform's rules are unit-tested on any build host.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Os {
    Mac,
    Windows,
    Linux,
}

impl Os {
    pub const CURRENT: Os = if cfg!(target_os = "macos") {
        Os::Mac
    } else if cfg!(target_os = "windows") {
        Os::Windows
    } else {
        Os::Linux
    };
}

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

/// Linux desktop (GNOME / KDE / Xfce) combos the shell or window manager
/// usually owns. Super+ combos are rejected outright, as on Windows.
const RESERVED_LINUX: &[&str] = &[
    "Alt+Tab",
    "Alt+Shift+Tab",
    "Alt+F2", // run dialog
    "Alt+F4", // close window
    "CmdOrCtrl+Alt+Delete", // log out
    "CmdOrCtrl+Alt+T", // terminal
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
fn is_reserved(sc: &Shortcut, os: Os) -> bool {
    let list = match os {
        Os::Mac => RESERVED_MAC,
        Os::Windows => RESERVED_WIN,
        Os::Linux => RESERVED_LINUX,
    };
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

pub fn classify(accel: &str, os: Os) -> AccelClass {
    // The Win/⊞ key is OS-reserved and unbindable on Windows; on Linux the
    // desktop owns most Super combos, and the recorder refuses them too.
    if os != Os::Mac && has_win_token(accel) {
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
    if is_reserved(&sc, os) {
        return AccelClass::Discouraged;
    }
    AccelClass::Valid
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_combo_with_modifiers() {
        assert_eq!(classify("CmdOrCtrl+Shift+A", Os::Mac), AccelClass::Valid);
        assert_eq!(classify("CmdOrCtrl+Shift+A", Os::Windows), AccelClass::Valid);
    }

    #[test]
    fn space_is_valid_when_named() {
        assert_eq!(classify("CmdOrCtrl+Shift+Space", Os::Windows), AccelClass::Valid);
    }

    #[test]
    fn bare_key_rejected_by_policy_though_parser_accepts() {
        // "3" parses fine (single-key branch) but has no modifier.
        assert_eq!(classify("3", Os::Windows), AccelClass::Invalid);
    }

    #[test]
    fn modifiers_only_rejected() {
        assert_eq!(classify("CmdOrCtrl+Shift+Alt", Os::Windows), AccelClass::Invalid);
    }

    #[test]
    fn empty_token_rejected() {
        assert_eq!(classify("CmdOrCtrl+Shift+", Os::Windows), AccelClass::Invalid);
    }

    #[test]
    fn win_key_rejected_on_windows() {
        assert_eq!(classify("Super+Shift+S", Os::Windows), AccelClass::Invalid);
    }

    /// CP-0037(a). These used to be a hard refusal. They are now attempted —
    /// the OS decides — so classification must be Discouraged, not Invalid.
    #[test]
    fn os_owned_combos_are_discouraged_not_refused() {
        for accel in ["CmdOrCtrl+Space", "CmdOrCtrl+Shift+3", "CmdOrCtrl+Shift+5"] {
            assert_eq!(classify(accel, Os::Mac), AccelClass::Discouraged, "{accel}");
        }
        for accel in ["Alt+Tab", "CmdOrCtrl+Shift+Escape"] {
            assert_eq!(classify(accel, Os::Windows), AccelClass::Discouraged, "{accel}");
        }
    }

    /// CP-0037(a). Bare F13–F20 are bindable; every other bare key is not.
    #[test]
    fn bare_high_function_keys_accepted_others_still_rejected() {
        for accel in ["F13", "F16", "F20", "f18"] {
            assert_eq!(classify(accel, Os::Mac), AccelClass::Valid, "{accel}");
            assert_eq!(classify(accel, Os::Windows), AccelClass::Valid, "{accel}");
        }
        // Just outside the range, and ordinary keys, stay modifier-gated.
        for accel in ["F12", "F21", "A", "Space", "Escape"] {
            assert_eq!(classify(accel, Os::Windows), AccelClass::Invalid, "{accel}");
        }
        // The exemption is for BARE keys only — modified F13 is still fine.
        assert_eq!(classify("CmdOrCtrl+F13", Os::Windows), AccelClass::Valid);
    }

    #[test]
    fn linux_rejects_super_and_uses_its_own_reserved_list() {
        assert_eq!(classify("Super+Shift+S", Os::Linux), AccelClass::Invalid);
        assert_eq!(classify("CmdOrCtrl+Shift+A", Os::Linux), AccelClass::Valid);
        for accel in ["Alt+Tab", "Alt+F4", "CmdOrCtrl+Alt+T"] {
            assert_eq!(classify(accel, Os::Linux), AccelClass::Discouraged, "{accel}");
        }
        // Not the macOS set.
        assert_eq!(classify("CmdOrCtrl+Space", Os::Linux), AccelClass::Valid);
    }
}
