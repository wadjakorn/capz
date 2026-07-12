use anyhow::{anyhow, Result};
use image::RgbaImage;
use xcap::Window;

#[cfg(target_os = "macos")]
use crate::services::image_service;

/// macOS window corner radius in logical points. macOS composites app windows
/// with rounded corners; xcap captures a rectangular buffer where those corner
/// cutouts are filled by opaque backdrop pixels (4 solid triangles). We mask
/// them back to transparency. ~12pt matches modern macOS (measured ~24 physical
/// px at 2× scale).
#[cfg(target_os = "macos")]
const CORNER_RADIUS_PT: f32 = 12.0;

pub fn capture_window(id: u32) -> Result<RgbaImage> {
    let wins = Window::all().map_err(|e| anyhow!("Window::all: {e}"))?;
    for w in wins {
        if w.id().map_err(|e| anyhow!("id: {e}"))? == id {
            #[allow(unused_mut)]
            let mut img = w.capture_image().map_err(|e| anyhow!("capture: {e}"))?;
            // macOS: strip the opaque rounded-corner backdrop triangles. Derive
            // the physical corner radius from the capture scale — xcap reports
            // window width in *logical* px on macOS while `capture_image` is
            // *physical* px, so scale = physical / logical (≈ 2.0 on Retina).
            #[cfg(target_os = "macos")]
            {
                let logical_w = w.width().unwrap_or(0);
                if logical_w > 0 {
                    let scale = img.width() as f32 / logical_w as f32;
                    let radius = (CORNER_RADIUS_PT * scale).round() as u32;
                    image_service::round_corners(&mut img, radius);
                }
            }
            return Ok(img);
        }
    }
    Err(anyhow!("window id {id} not found"))
}
