//! macOS-only: delegate area selection to Apple's own screenshot UI
//! (`/usr/sbin/screencapture -i`).
//!
//! Unlike our own overlay, Apple's interactive selection never activates our
//! process and does not cover the desktop, so a source app's open dropdowns /
//! hover tooltips / focus rings survive the capture. See CP-0029 for the full
//! mechanism writeup. capz is non-sandboxed, so it may spawn `screencapture`
//! with no entitlement (Shottr needs one only because it is sandboxed / MAS).
//!
//! Only [`run_interactive_area`] is macOS-gated; the cancel-detection predicate
//! below is platform-agnostic so its contract stays under test everywhere.

use std::path::Path;

/// Did `screencapture` actually produce a capture?
///
/// **Cancel contract:** pressing Esc makes `screencapture` exit *without writing
/// the file*, and its exit status is unreliable across OS versions — so never
/// branch on the exit code. A capture counts as produced only when the output
/// file exists **and** is non-empty; anything else is a clean user-cancel.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn output_was_written(path: &Path) -> bool {
    std::fs::metadata(path).map(|m| m.len() > 0).unwrap_or(false)
}

/// Run Apple's interactive area capture and return the selected region as an
/// in-memory image. Returns `Ok(None)` when the user cancels (Esc).
#[cfg(target_os = "macos")]
pub async fn run_interactive_area() -> anyhow::Result<Option<image::RgbaImage>> {
    use anyhow::Context;
    use std::time::{SystemTime, UNIX_EPOCH};

    // Scratch file. Named with the `capz-temp-` prefix so that if our own
    // cleanup below ever fails, `image_service::sweep_stale_temp` still reclaims
    // it (it prefix-matches `capz-temp-`). `capture_to_editor` later writes the
    // canonical temp from the decoded image, honoring the intermediate-format
    // setting — this scratch file is deleted as soon as we decode it.
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let out = std::env::temp_dir().join(format!("capz-temp-{ts}-screencap.png"));

    tokio::task::spawn_blocking(move || -> anyhow::Result<Option<image::RgbaImage>> {
        // Flags verified against `screencapture --help` on macOS 26.5.2:
        //   -i        interactive selection. Its own help documents `space` =
        //             toggle window-selection mode and `escape` = cancel, both
        //             of which we inherit for free.
        //   -x        do not play sounds — capz plays its own via
        //             `services::sound::play_capture_sound` inside
        //             `windows::load_editor_image`; without -x it double-clicks.
        //   -t png    png is already the default; kept explicit for clarity.
        let status = std::process::Command::new("/usr/sbin/screencapture")
            .arg("-i")
            .arg("-x")
            .args(["-t", "png"])
            .arg(&out)
            .status()
            .context("spawn /usr/sbin/screencapture")?;

        if !output_was_written(&out) {
            // Clean up a possible zero-byte file; report a clean cancel.
            let _ = std::fs::remove_file(&out);
            if !status.success() {
                log::info!("screencapture exited {status} with no output — treating as cancel");
            }
            return Ok(None);
        }

        let img = image::open(&out)
            .with_context(|| format!("decode screencapture output at {}", out.display()))?
            .to_rgba8();
        let _ = std::fs::remove_file(&out);
        Ok(Some(img))
    })
    .await
    .context("join screencapture task")?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("capz-test-screencapture-{name}"))
    }

    #[test]
    fn missing_output_reads_as_cancel() {
        let p = scratch("missing.png");
        let _ = std::fs::remove_file(&p);
        assert!(!output_was_written(&p));
    }

    #[test]
    fn zero_byte_output_reads_as_cancel() {
        let p = scratch("empty.png");
        std::fs::write(&p, b"").expect("write scratch");
        assert!(!output_was_written(&p));
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn non_empty_output_reads_as_captured() {
        let p = scratch("nonempty.png");
        std::fs::write(&p, b"\x89PNG\r\n").expect("write scratch");
        assert!(output_was_written(&p));
        let _ = std::fs::remove_file(&p);
    }
}
