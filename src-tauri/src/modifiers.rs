//! CP-0038 POC v3 — read the CURRENT modifier state, without intercepting keys.
//!
//! This is a state QUERY, not an event stream: we ask the OS "are these keys
//! down right now?" rather than asking to be told about keystrokes. That is the
//! whole point — an event tap / low-level hook would require Accessibility
//! (macOS TCC) and change capz's trust profile, which CP-0037(b) was skipped to
//! avoid. If this query turns out to need Accessibility after all, the approach
//! is dead and CP-0038 has no path that avoids interception.
//!
//! THROWAWAY, alongside `ring_poc`.

/// Are the given modifiers currently held? `None` = unsupported platform.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Mods {
    pub command: bool,
    pub shift: bool,
}

#[cfg(target_os = "macos")]
pub fn current() -> Option<Mods> {
    use objc2::{class, msg_send};
    // NSEventModifierFlags — NSEvent.modifierFlags is a class property giving
    // the modifier state at the time of the call, independent of any event
    // stream or monitor.
    const SHIFT: u64 = 1 << 17;
    const COMMAND: u64 = 1 << 20;
    let flags: u64 = unsafe { msg_send![class!(NSEvent), modifierFlags] };
    Some(Mods {
        command: flags & COMMAND != 0,
        shift: flags & SHIFT != 0,
    })
}

#[cfg(target_os = "windows")]
pub fn current() -> Option<Mods> {
    // GetAsyncKeyState reports the current physical key state and needs no
    // special permission or hook.
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_SHIFT};
    let down = |vk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY| unsafe {
        (GetAsyncKeyState(vk.0 as i32) as u16 & 0x8000) != 0
    };
    Some(Mods {
        // Ctrl stands in for Cmd on Windows, matching CmdOrCtrl accelerators.
        command: down(VK_CONTROL),
        shift: down(VK_SHIFT),
    })
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn current() -> Option<Mods> {
    None
}
