use std::io::Cursor;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Result};
use image::{codecs::png::PngEncoder, ImageEncoder, RgbaImage};

pub fn encode_png(img: &RgbaImage) -> Result<Vec<u8>> {
    let mut buf = Vec::with_capacity((img.width() * img.height() * 4) as usize);
    let enc = PngEncoder::new(Cursor::new(&mut buf));
    enc.write_image(
        img.as_raw(),
        img.width(),
        img.height(),
        image::ExtendedColorType::Rgba8,
    )
    .map_err(|e| anyhow!("png encode failed: {e}"))?;
    Ok(buf)
}

pub fn write_temp_png(img: &RgbaImage) -> Result<PathBuf> {
    let bytes = encode_png(img)?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| anyhow!("time: {e}"))?
        .as_millis();
    let path = std::env::temp_dir().join(format!("shotr-temp-{ts}.png"));
    std::fs::write(&path, &bytes).map_err(|e| anyhow!("write {}: {e}", path.display()))?;
    Ok(path)
}

/// Remove `shotr-temp-*.png` files older than 24h from the OS temp dir.
#[allow(dead_code)]
pub fn sweep_stale_temp() {
    let dir = std::env::temp_dir();
    let Ok(entries) = std::fs::read_dir(&dir) else { return };
    let now = SystemTime::now();
    let cutoff = std::time::Duration::from_secs(60 * 60 * 24);
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if !(name.starts_with("shotr-temp-") && name.ends_with(".png")) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let Ok(modified) = meta.modified() else { continue };
        if now.duration_since(modified).map(|d| d > cutoff).unwrap_or(false) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}
