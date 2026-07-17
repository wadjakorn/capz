//! macOS-only: delegate area selection to Apple's own screenshot UI
//! (`/usr/sbin/screencapture -i`).
//!
//! Unlike our own overlay, Apple's interactive selection never activates our
//! process and does not cover the desktop, so a source app's open dropdowns /
//! hover tooltips / focus rings survive the capture. See CP-0029 for the full
//! mechanism writeup. capz is non-sandboxed, so it may spawn `screencapture`
//! with no entitlement (Shottr needs one only because it is sandboxed / MAS).

use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Context;
use image::RgbaImage;

/// Run Apple's interactive area capture and return the selected region as an
/// in-memory image.
///
/// Returns `Ok(None)` when the user cancels (Esc). Cancel is detected by the
/// **absence of a non-empty output file**, NOT by the exit code: `screencapture`
/// exits without writing the file on Esc and its exit status is unreliable
/// across OS versions, so treat "missing or zero-byte output" as a clean cancel
/// (no error, no editor).
pub async fn run_interactive_area() -> anyhow::Result<Option<RgbaImage>> {
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

    tokio::task::spawn_blocking(move || -> anyhow::Result<Option<RgbaImage>> {
        // NOTE: flag set is best-effort and MUST be re-verified against
        // `screencapture --help` on a real Mac (CP-0031).
        //   -i        interactive selection (area; Space toggles window picker)
        //   -x        suppress the system shutter sound — capz plays its own via
        //             `services::sound::play_capture_sound` inside
        //             `windows::load_editor_image`; without -x it double-clicks
        //   -t png    force PNG output
        let status = std::process::Command::new("/usr/sbin/screencapture")
            .arg("-i")
            .arg("-x")
            .args(["-t", "png"])
            .arg(&out)
            .status()
            .context("spawn /usr/sbin/screencapture")?;

        // Cancel detection: exists AND non-empty. Do not trust `status` alone.
        let wrote = std::fs::metadata(&out)
            .map(|m| m.len() > 0)
            .unwrap_or(false);
        if !wrote {
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
