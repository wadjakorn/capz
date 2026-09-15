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
}
