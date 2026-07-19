//! Read the CURRENT modifier-key state (CP-0038).
//!
//! This is a state QUERY, not an event stream: we ask the OS "are these keys
//! down right now?" rather than asking to be told about keystrokes. That
//! distinction is the whole reason CP-0038 is implementable — an event tap
//! (`CGEventTap`) or low-level hook (`WH_KEYBOARD_LL`) would require
//! Accessibility/TCC on macOS and change capz's trust profile, which is exactly
//! why CP-0037(b) was skipped. Nothing here can observe *which* keys are
//! pressed, and nothing here can suppress a keystroke.
//!
//! **Do not replace this with an event tap.** If a future change appears to
//! need one, the feature is wrong, not this module.

/// Which modifiers a gesture cares about. `CmdOrCtrl` resolves per-platform:
/// `command` means Cmd on macOS and Ctrl on Windows, matching how Tauri
/// accelerators are written.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Mods {
    pub command: bool,
    pub shift: bool,
    pub alt: bool,
    /// Literal `Control` on macOS. On Windows this collapses into `command`
    /// (both map to Ctrl), so it stays false there.
    pub control: bool,
}

impl Mods {
    /// Is every modifier in `self` currently present in `other`?
    ///
    /// Deliberately a subset test, not equality: the user may be holding extra
    /// keys we don't care about, and the gesture should stay alive until one of
    /// the modifiers it actually depends on comes up.
    pub fn all_held_in(&self, other: &Mods) -> bool {
        (!self.command || other.command)
            && (!self.shift || other.shift)
            && (!self.alt || other.alt)
            && (!self.control || other.control)
    }

    pub fn is_empty(&self) -> bool {
        !(self.command || self.shift || self.alt || self.control)
    }
}

/// Extract the modifier set from a Tauri accelerator string
/// (e.g. `"CmdOrCtrl+Shift+Space"` → command + shift).
///
/// Matching is case-insensitive and covers the aliases Tauri accepts, so a
/// hand-edited config using `"Control+Alt+K"` polls the same keys the shortcut
/// plugin registered. An unrecognised token is ignored — it is the trigger key,
/// not a modifier.
pub fn from_accelerator(accel: &str) -> Mods {
    let mut m = Mods::default();
    let is_windows = cfg!(target_os = "windows");
    for tok in accel.split('+') {
        match tok.trim().to_ascii_lowercase().as_str() {
            "cmdorctrl" | "commandorcontrol" | "cmd" | "command" | "super" | "meta" => {
                m.command = true
            }
            "shift" => m.shift = true,
            "alt" | "option" => m.alt = true,
            // On Windows a bare Ctrl is the same physical key CmdOrCtrl maps to,
            // so folding it into `command` keeps the poll and the registered
            // accelerator talking about one key rather than two.
            "ctrl" | "control" => {
                if is_windows {
                    m.command = true;
                } else {
                    m.control = true;
                }
            }
            _ => {}
        }
    }
    m
}

/// Current modifier state, or `None` if this platform can't be polled — in
/// which case the caller must not offer the hold gesture at all.
#[cfg(target_os = "macos")]
pub fn current() -> Option<Mods> {
    use objc2::{class, msg_send};
    // NSEventModifierFlags. `NSEvent.modifierFlags` is a class property
    // reporting the state at call time, independent of any event stream or
    // monitor — no permission required.
    const SHIFT: u64 = 1 << 17;
    const CONTROL: u64 = 1 << 18;
    const OPTION: u64 = 1 << 19;
    const COMMAND: u64 = 1 << 20;
    let flags: u64 = unsafe { msg_send![class!(NSEvent), modifierFlags] };
    Some(Mods {
        command: flags & COMMAND != 0,
        shift: flags & SHIFT != 0,
        alt: flags & OPTION != 0,
        control: flags & CONTROL != 0,
    })
}

#[cfg(target_os = "windows")]
pub fn current() -> Option<Mods> {
    // GetAsyncKeyState reports current physical key state; no hook, no
    // permission. The high bit means "down right now".
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_MENU, VK_SHIFT,
    };
    let down = |vk: u16| unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 };
    Some(Mods {
        // Ctrl stands in for Cmd, matching CmdOrCtrl accelerators.
        command: down(VK_CONTROL),
        shift: down(VK_SHIFT),
        alt: down(VK_MENU),
        control: false,
    })
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn current() -> Option<Mods> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_default_ring_accelerator() {
        let m = from_accelerator("CmdOrCtrl+Shift+Space");
        assert!(m.command && m.shift);
        assert!(!m.alt);
        assert!(!m.is_empty());
    }

    #[test]
    fn ignores_the_trigger_key_and_is_case_insensitive() {
        assert_eq!(from_accelerator("ALT+K"), from_accelerator("alt+Q"));
        assert!(from_accelerator("alt+k").alt);
    }

    /// An accelerator with no modifiers can't drive a hold gesture: there is
    /// nothing to release. Callers must reject this rather than poll forever.
    #[test]
    fn bare_key_has_no_modifiers() {
        assert!(from_accelerator("F13").is_empty());
        assert!(from_accelerator("").is_empty());
    }

    #[test]
    fn subset_test_tolerates_extra_modifiers_but_not_missing_ones() {
        let want = Mods { command: true, shift: true, ..Default::default() };
        let holding_extra = Mods { command: true, shift: true, alt: true, control: false };
        assert!(want.all_held_in(&holding_extra));
        let shift_released = Mods { command: true, ..Default::default() };
        assert!(!want.all_held_in(&shift_released));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn bare_control_folds_into_command_on_windows() {
        let m = from_accelerator("Control+Shift+A");
        assert!(m.command && !m.control);
    }
}
