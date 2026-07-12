use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Result};
use image::{
    codecs::jpeg::JpegEncoder, codecs::png::PngEncoder, imageops::FilterType, DynamicImage,
    ExtendedColorType, ImageEncoder, RgbaImage,
};

fn downscale_to_max_edge(img: &RgbaImage, max_edge: u32) -> RgbaImage {
    let (w, h) = img.dimensions();
    let longest = w.max(h);
    if longest <= max_edge {
        return img.clone();
    }
    let scale = max_edge as f32 / longest as f32;
    let nw = ((w as f32) * scale).round().max(1.0) as u32;
    let nh = ((h as f32) * scale).round().max(1.0) as u32;
    image::imageops::resize(img, nw, nh, FilterType::Triangle)
}

fn maybe_downscale(img: &RgbaImage, max_edge: Option<u32>) -> RgbaImage {
    match max_edge {
        Some(edge) if edge > 0 => downscale_to_max_edge(img, edge),
        _ => img.clone(),
    }
}

/// Apply an anti-aliased rounded-rectangle alpha mask to `img` in place.
/// `radius` is in **physical pixels**. Pixels outside each corner's quarter-arc
/// are made fully transparent; the arc itself is anti-aliased via fractional
/// coverage over a ~1px band. No-op when `radius` is 0 (clamped to at most half
/// the smaller dimension).
///
/// Used to clean up macOS window captures: xcap returns a rectangular buffer in
/// which the window's rounded-corner cutouts are filled by opaque backdrop
/// pixels (4 solid triangles). Masking those corners to transparency yields a
/// natural rounded-window screenshot. The backdrop is arbitrary desktop content
/// (no knowable fill color), so a geometric mask — not a color flood-fill — is
/// used: it is content-agnostic and can never eat window content.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn round_corners(img: &mut RgbaImage, radius: u32) {
    let (w, h) = img.dimensions();
    let r = radius.min(w / 2).min(h / 2);
    if r == 0 {
        return;
    }
    let rf = r as f32;
    // Each entry: (corner-box origin x, origin y, arc-center x, arc-center y).
    // The arc center sits at the box's *inner* corner, so the outer triangle of
    // the box (far from the center) is what gets masked away. `w - r`/`h - r`
    // never underflow because `r <= w/2` and `r <= h/2`.
    let corners = [
        (0, 0, rf, rf),                               // top-left
        (w - r, 0, (w - r) as f32, rf),               // top-right
        (0, h - r, rf, (h - r) as f32),               // bottom-left
        (w - r, h - r, (w - r) as f32, (h - r) as f32), // bottom-right
    ];
    for (ox, oy, cx, cy) in corners {
        for yy in 0..r {
            for xx in 0..r {
                let x = ox + xx;
                let y = oy + yy;
                // Pixel center vs arc center.
                let dx = x as f32 + 0.5 - cx;
                let dy = y as f32 + 0.5 - cy;
                let dist = (dx * dx + dy * dy).sqrt();
                // 1.0 inside the disk, 0.0 outside, linear AA across the edge.
                let coverage = (rf - dist + 0.5).clamp(0.0, 1.0);
                if coverage < 1.0 {
                    let p = img.get_pixel_mut(x, y);
                    p[3] = (p[3] as f32 * coverage).round() as u8;
                }
            }
        }
    }
}

fn temp_path(ext: &str) -> Result<PathBuf> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| anyhow!("time: {e}"))?
        .as_millis();
    Ok(std::env::temp_dir().join(format!("capz-temp-{ts}.{ext}")))
}

/// Encode RGBA capture as lossless PNG. Preserves pixel-perfect fidelity —
/// the editor stage then renders from a buffer identical to xcap's output.
/// `max_edge: None` keeps native resolution.
pub fn write_temp_png(img: &RgbaImage, max_edge: Option<u32>) -> Result<PathBuf> {
    let scaled = maybe_downscale(img, max_edge);
    let mut buf = Vec::with_capacity((scaled.width() * scaled.height()) as usize * 4 / 2);
    PngEncoder::new(&mut buf)
        .write_image(
            &scaled,
            scaled.width(),
            scaled.height(),
            ExtendedColorType::Rgba8,
        )
        .map_err(|e| anyhow!("png encode failed: {e}"))?;
    let path = temp_path("png")?;
    std::fs::write(&path, &buf).map_err(|e| anyhow!("write {}: {e}", path.display()))?;
    Ok(path)
}

/// Encode RGBA capture as JPEG. Smaller / faster but lossy — text and
/// high-contrast edges ring at quality <100. `max_edge: None` keeps native
/// resolution.
pub fn write_temp_jpeg(img: &RgbaImage, quality: u8, max_edge: Option<u32>) -> Result<PathBuf> {
    let scaled = maybe_downscale(img, max_edge);
    let rgb = DynamicImage::ImageRgba8(scaled).to_rgb8();
    let mut buf = Vec::with_capacity((rgb.width() * rgb.height() * 3) as usize / 4);
    let enc = JpegEncoder::new_with_quality(&mut buf, quality);
    enc.write_image(
        rgb.as_raw(),
        rgb.width(),
        rgb.height(),
        ExtendedColorType::Rgb8,
    )
    .map_err(|e| anyhow!("jpeg encode failed: {e}"))?;
    let path = temp_path("jpg")?;
    std::fs::write(&path, &buf).map_err(|e| anyhow!("write {}: {e}", path.display()))?;
    Ok(path)
}

/// Remove `capz-temp-*` files older than 24h from the OS temp dir.
pub fn sweep_stale_temp() {
    let dir = std::env::temp_dir();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    let now = SystemTime::now();
    let cutoff = std::time::Duration::from_secs(60 * 60 * 24);
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if !name.starts_with("capz-temp-") {
            continue;
        }
        if !(name.ends_with(".png") || name.ends_with(".jpg")) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let Ok(modified) = meta.modified() else {
            continue;
        };
        if now
            .duration_since(modified)
            .map(|d| d > cutoff)
            .unwrap_or(false)
        {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    #[test]
    fn round_corners_masks_outer_corners_keeps_center() {
        let w = 40;
        let h = 30;
        let radius = 8;
        let mut img = RgbaImage::from_pixel(w, h, Rgba([10, 20, 30, 255]));
        round_corners(&mut img, radius);

        // Extreme corner pixels are well outside every arc → fully transparent.
        for (x, y) in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)] {
            assert_eq!(img.get_pixel(x, y)[3], 0, "corner ({x},{y}) not cleared");
        }
        // Center and RGB are untouched; only alpha is ever modified.
        let c = img.get_pixel(w / 2, h / 2);
        assert_eq!(c.0, [10, 20, 30, 255], "center pixel altered");
        // A pixel just inside the arc (near the inner corner center) stays opaque.
        assert_eq!(img.get_pixel(radius, radius)[3], 255, "inner-corner pixel cleared");
    }

    #[test]
    fn round_corners_has_antialiased_edge() {
        // With a large radius, some pixel straddling the arc must have partial
        // alpha (0 < a < 255) rather than a hard 0/255 step.
        let mut img = RgbaImage::from_pixel(64, 64, Rgba([255, 255, 255, 255]));
        round_corners(&mut img, 24);
        let partial = img
            .pixels()
            .any(|p| p[3] > 0 && p[3] < 255);
        assert!(partial, "expected at least one anti-aliased edge pixel");
    }

    #[test]
    fn round_corners_zero_radius_is_noop() {
        let mut img = RgbaImage::from_pixel(20, 20, Rgba([1, 2, 3, 200]));
        let before = img.clone();
        round_corners(&mut img, 0);
        assert_eq!(img.as_raw(), before.as_raw());
    }
}
