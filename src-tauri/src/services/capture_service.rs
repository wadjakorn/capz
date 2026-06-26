use anyhow::{anyhow, Result};
use image::{RgbaImage, SubImage};

use super::monitor_service;

pub fn capture_monitor(id: u32) -> Result<RgbaImage> {
    let m = monitor_service::monitor_by_id(id)?;
    let img = m
        .capture_image()
        .map_err(|e| anyhow!("capture failed: {e}"))?;
    Ok(img)
}

pub fn capture_primary() -> Result<RgbaImage> {
    let m = monitor_service::primary_monitor()?;
    let img = m
        .capture_image()
        .map_err(|e| anyhow!("capture failed: {e}"))?;
    Ok(img)
}

/// Capture a region of `monitor_id`. Coordinates `(x, y)` and size `(w, h)` are
/// in **physical device pixels** relative to the monitor's top-left — the
/// overlay already multiplied its logical selection by the webview
/// devicePixelRatio. xcap's `capture_image` returns a physical-pixel buffer, so
/// we crop directly. We deliberately do NOT re-scale by `Monitor::scale_factor`:
/// on fractional Windows display scaling xcap reports an integer scale (e.g. 1)
/// while the webview dpr is fractional (e.g. 1.07), and the mismatch shifted the
/// capture left+up of the selection (ticket L9mejWlFPDcZ).
pub fn capture_region(monitor_id: u32, x: i32, y: i32, w: u32, h: u32) -> Result<RgbaImage> {
    if w == 0 || h == 0 {
        return Err(anyhow!("region has zero area"));
    }
    let m = monitor_service::monitor_by_id(monitor_id)?;
    let full = m
        .capture_image()
        .map_err(|e| anyhow!("capture failed: {e}"))?;

    let px = x.max(0) as u32;
    let py = y.max(0) as u32;
    let pw = w.max(1);
    let ph = h.max(1);

    let (fw, fh) = full.dimensions();
    if px >= fw || py >= fh {
        return Err(anyhow!("region origin outside monitor"));
    }
    let cw = pw.min(fw - px);
    let ch = ph.min(fh - py);

    let sub = SubImage::new(&full, px, py, cw, ch).to_image();
    Ok(sub)
}
