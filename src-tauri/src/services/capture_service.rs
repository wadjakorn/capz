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
pub fn capture_region(monitor_id: u32, x: i32, y: i32, w: u32, h: u32, dpr: f64) -> Result<RgbaImage> {
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

    // [area-diag] Compare the two independent scale sources. The current crop
    // uses xcap `scale_factor`; if the overlay actually rendered at a different
    // `devicePixelRatio`, the selection→crop mapping is off → captured region
    // shifts (suspected Windows "shifted left" bug). A divergence here, or a
    // crop origin (px,py) that doesn't match px_dpr/py_dpr, is the smoking gun.
    let (mon_x, mon_y) = (m.x().unwrap_or(0), m.y().unwrap_or(0));
    // warn! (not info!) so it survives the release log filter (LevelFilter::Warn
    // in non-debug builds — see lib.rs). Revert to info!/remove once diagnosed.
    log::warn!(
        "[area-diag] capture_region mon={monitor_id} mon_origin=({mon_x},{mon_y}) \
         buffer={fw}x{fh} scale_factor={scale} dpr={dpr} | \
         logical=({x},{y} {w}x{h}) \
         crop_via_scale=({px},{py} {pw}x{ph}) \
         crop_via_dpr=({},{} {}x{})",
        (x as f64 * dpr).round().max(0.0) as i64,
        (y as f64 * dpr).round().max(0.0) as i64,
        (w as f64 * dpr).round().max(1.0) as i64,
        (h as f64 * dpr).round().max(1.0) as i64,
    );
    if px >= fw || py >= fh {
        return Err(anyhow!("region origin outside monitor"));
    }
    let cw = pw.min(fw - px);
    let ch = ph.min(fh - py);

    let sub = SubImage::new(&full, px, py, cw, ch).to_image();
    Ok(sub)
}
