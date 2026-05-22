use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Result};
use image::{
    codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage, ImageEncoder, RgbaImage,
};

pub const MAX_LONGEST_EDGE: u32 = 2560;

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

pub fn write_temp_jpeg(img: &RgbaImage, quality: u8) -> Result<PathBuf> {
    let scaled = downscale_to_max_edge(img, MAX_LONGEST_EDGE);
    let rgb = DynamicImage::ImageRgba8(scaled).to_rgb8();
    let mut buf = Vec::with_capacity((rgb.width() * rgb.height() * 3) as usize / 4);
    let enc = JpegEncoder::new_with_quality(&mut buf, quality);
    enc.write_image(
        rgb.as_raw(),
        rgb.width(),
        rgb.height(),
        image::ExtendedColorType::Rgb8,
    )
    .map_err(|e| anyhow!("jpeg encode failed: {e}"))?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| anyhow!("time: {e}"))?
        .as_millis();
    let path = std::env::temp_dir().join(format!("capz-temp-{ts}.jpg"));
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
