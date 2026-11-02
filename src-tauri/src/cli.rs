//! `capz --capture <mode>` — trigger a capture from outside the app (CP-0094).
//!
//! Wayland desktops without the GlobalShortcuts portal (Sway and other
//! wlroots compositors, older GNOME) can still bind a key: the user adds a
//! custom shortcut in their desktop settings that runs this command. A second
//! `capz` process hands its arguments to the running one through the
//! single-instance plugin and exits; if capz isn't running, it starts and then
//! performs the action.

use tauri::{AppHandle, Runtime};

use crate::shortcuts::HotkeyAction;

/// The action requested by `args` (argv, program name first), if any.
pub fn parse<S: AsRef<str>>(args: &[S]) -> Option<HotkeyAction> {
    let mut it = args.iter().skip(1).map(AsRef::as_ref);
    while let Some(arg) = it.next() {
        let value = match arg.strip_prefix("--capture=") {
            Some(v) => v,
            None if arg == "--capture" => it.next()?,
            None => continue,
        };
        return match value.to_ascii_lowercase().as_str() {
            "full" | "screen" => Some(HotkeyAction::CaptureFull),
            "area" | "region" => Some(HotkeyAction::CaptureArea),
            "window" => Some(HotkeyAction::CaptureWindow),
            "scroll" => Some(HotkeyAction::CaptureScroll),
            "ring" => Some(HotkeyAction::CommandRing),
            "editor" => Some(HotkeyAction::ShowEditor),
            other => {
                log::warn!("--capture: unknown mode '{other}'");
                None
            }
        };
    }
    None
}

/// Run the action for `args`. Returns false when there was none.
pub fn handle<R: Runtime, S: AsRef<str>>(app: &AppHandle<R>, args: &[S]) -> bool {
    let Some(action) = parse(args) else {
        return false;
    };
    log::info!("cli: {action:?}");
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || crate::shortcuts::dispatch_action(&app2, action, ""));
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_both_flag_forms() {
        assert_eq!(parse(&["capz", "--capture", "area"]), Some(HotkeyAction::CaptureArea));
        assert_eq!(parse(&["capz", "--capture=full"]), Some(HotkeyAction::CaptureFull));
        assert_eq!(parse(&["/usr/bin/capz", "--capture", "Window"]), Some(HotkeyAction::CaptureWindow));
        assert_eq!(parse(&["capz", "--capture", "ring"]), Some(HotkeyAction::CommandRing));
    }

    #[test]
    fn ignores_everything_else() {
        assert_eq!(parse(&["capz"]), None);
        assert_eq!(parse(&["capz", "--minimized"]), None);
        assert_eq!(parse(&["capz", "--capture"]), None);
        assert_eq!(parse(&["capz", "--capture", "nope"]), None);
        // The program name is never read as a flag.
        assert_eq!(parse(&["--capture", "area"]), None);
    }
}
