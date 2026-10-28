use serde::Serialize;

/// Coarse platform facts attached to anonymous feedback reports.
/// Mirrored by `PlatformInfo` in `src/lib/feedback.ts` — keep in sync by hand.
#[derive(Debug, Clone, Serialize)]
pub struct PlatformInfo {
    /// Same vocabulary as tauri-plugin-updater's `{{target}}`: `darwin`, `windows`, `linux`.
    pub target: &'static str,
    /// `aarch64`, `x86_64`, …
    pub arch: &'static str,
}

pub fn platform_info_value() -> PlatformInfo {
    let target = match std::env::consts::OS {
        "macos" => "darwin",
        other => other,
    };
    PlatformInfo {
        target,
        arch: std::env::consts::ARCH,
    }
}

#[tauri::command]
pub fn platform_info() -> PlatformInfo {
    platform_info_value()
}

/// True when capz runs in a Wayland session. v1 Linux support is X11 only
/// (CP-0081): under Wayland capture goes through a portal, global shortcuts
/// don't fire and overlays can't place themselves, so the editor shows a
/// notice asking the user to log in with an Xorg session instead.
///
/// `XDG_SESSION_TYPE` is what display managers set; `WAYLAND_DISPLAY` without
/// `DISPLAY` catches sessions started without one (no XWayland either).
pub fn is_wayland(
    session_type: Option<&str>,
    wayland_display: Option<&str>,
    x_display: Option<&str>,
) -> bool {
    match session_type.map(str::trim) {
        Some(t) if !t.is_empty() => t.eq_ignore_ascii_case("wayland"),
        _ => wayland_display.is_some_and(|w| !w.is_empty()) && x_display.map_or(true, str::is_empty),
    }
}

pub fn is_wayland_session_value() -> bool {
    if !cfg!(target_os = "linux") {
        return false;
    }
    let var = |k: &str| std::env::var(k).ok();
    is_wayland(
        var("XDG_SESSION_TYPE").as_deref(),
        var("WAYLAND_DISPLAY").as_deref(),
        var("DISPLAY").as_deref(),
    )
}

#[tauri::command]
pub fn is_wayland_session() -> bool {
    is_wayland_session_value()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_uses_updater_vocabulary() {
        let info = platform_info_value();
        assert_ne!(info.target, "macos");
        assert!(["darwin", "windows", "linux"].contains(&info.target));
        assert!(!info.arch.is_empty());
    }

    #[test]
    fn wayland_detection_prefers_session_type() {
        assert!(is_wayland(Some("wayland"), None, None));
        assert!(is_wayland(Some("Wayland"), Some("wayland-0"), Some(":0")));
        assert!(!is_wayland(Some("x11"), Some("wayland-0"), None));
        assert!(!is_wayland(Some("tty"), None, None));
    }

    #[test]
    fn wayland_detection_without_session_type_needs_no_x_display() {
        assert!(is_wayland(None, Some("wayland-0"), None));
        assert!(is_wayland(Some(""), Some("wayland-0"), Some("")));
        assert!(!is_wayland(None, Some("wayland-0"), Some(":0")));
        assert!(!is_wayland(None, None, Some(":0")));
    }
}
