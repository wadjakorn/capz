use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

const MAX_STICKERS: usize = 200;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Serialize)]
pub struct StickerEntry {
    pub name: String,
    #[serde(rename = "dataUrl")]
    pub data_url: String,
}

fn mime_for(ext: &str) -> Option<&'static str> {
    match ext.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        _ => None,
    }
}

/// Scan `dir` for image files (png/jpg/jpeg/webp/gif), read up to
/// `MAX_STICKERS` files (≤ `MAX_FILE_BYTES` each), and return them as
/// base64 data URLs sorted by file name. Symlinks and subdirectories are
/// skipped.
#[tauri::command]
pub fn list_stickers(dir: String) -> Result<Vec<StickerEntry>, String> {
    let dir_path = PathBuf::from(&dir);
    if !dir_path.is_dir() {
        return Err(format!("not a directory: {dir}"));
    }

    let mut paths: Vec<PathBuf> = fs::read_dir(&dir_path)
        .map_err(|e| format!("read_dir failed: {e}"))?
        .filter_map(|r| r.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .filter(|p| {
            p.extension()
                .and_then(|s| s.to_str())
                .and_then(mime_for)
                .is_some()
        })
        .collect();
    paths.sort();
    paths.truncate(MAX_STICKERS);

    let engine = base64::engine::general_purpose::STANDARD;
    let mut out = Vec::with_capacity(paths.len());
    for path in paths {
        let metadata = match fs::metadata(&path) {
            Ok(m) => m,
            Err(e) => {
                log::warn!("sticker stat skip {}: {e}", path.display());
                continue;
            }
        };
        if metadata.len() > MAX_FILE_BYTES {
            log::warn!(
                "sticker oversize skip {} ({} bytes)",
                path.display(),
                metadata.len()
            );
            continue;
        }
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or_default();
        let Some(mime) = mime_for(ext) else { continue };
        let bytes = match fs::read(&path) {
            Ok(b) => b,
            Err(e) => {
                log::warn!("sticker read skip {}: {e}", path.display());
                continue;
            }
        };
        let encoded = engine.encode(&bytes);
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("sticker")
            .to_string();
        out.push(StickerEntry {
            name,
            data_url: format!("data:{mime};base64,{encoded}"),
        });
    }
    Ok(out)
}
