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
/// in **logical (CSS) pixels** relative to the monitor's top-left. xcap returns
/// physical pixels, so we scale before cropping.
pub fn capture_region(monitor_id: u32, x: i32, y: i32, w: u32, h: u32) -> Result<RgbaImage> {
    if w == 0 || h == 0 {
        return Err(anyhow!("region has zero area"));
    }
    let m = monitor_service::monitor_by_id(monitor_id)?;
    let scale = m.scale_factor().map_err(|e| anyhow!("scale: {e}"))?;
    let full = m
        .capture_image()
        .map_err(|e| anyhow!("capture failed: {e}"))?;

    let px = (x as f32 * scale).round().max(0.0) as u32;
    let py = (y as f32 * scale).round().max(0.0) as u32;
    let pw = (w as f32 * scale).round().max(1.0) as u32;
    let ph = (h as f32 * scale).round().max(1.0) as u32;

    let (fw, fh) = full.dimensions();
    let native_w = m.width().unwrap_or(0);
    let native_h = m.height().unwrap_or(0);
    if px >= fw || py >= fh {
        return Err(anyhow!("region origin outside monitor"));
    }
    let cw = pw.min(fw - px);
    let ch = ph.min(fh - py);

    // TEMP DIAGNOSTIC (warn so it shows in release) — area-capture geometry.
    // Compares xcap scale, native monitor size, the actual captured buffer
    // size, the selection (logical px), and the computed/clamped crop. Reveals
    // whether the buffer is non-native or the crop is being clamped (the
    // right/bottom "backward-L" cut). Remove before merge.
    log::warn!(
        "DIAG area-capture: mon={monitor_id} xcap_scale={scale} native=({native_w}x{native_h}) buffer=({fw}x{fh}) sel_logical=({x},{y} {w}x{h}) crop=({px},{py} {pw}x{ph}) clamped=({cw}x{ch})"
    );

    let sub = SubImage::new(&full, px, py, cw, ch).to_image();
    Ok(sub)
}
