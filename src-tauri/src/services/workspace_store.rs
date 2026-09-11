//! Durable backing files for editor workspaces.
//!
//! A capture lands in the OS temp dir as `capz-temp-<ms>.{png,jpg}` and lives a
//! deliberately short life: `windows::load_editor_image` deletes the previous
//! one on every swap, and `image_service::sweep_stale_temp` clears anything
//! older than 24h at startup. macOS also purges `/var/folders` across reboots.
//!
//! Multiple workspaces need the opposite contract — a file that survives until
//! the user closes that workspace — so each one gets a copy under
//! `<app_data_dir>/workspaces/`. That directory is declared in both
//! `tauri.conf.json`'s `assetProtocol.scope` (so `convertFileSrc` can load it
//! into the webview) and `capabilities/editor.json`'s `fs:scope`.

use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};
use tauri::{AppHandle, Manager, Runtime};

/// Directory holding workspace backing images, created on demand.
pub fn workspaces_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow!("app_data_dir: {e}"))?
        .join("workspaces");
    std::fs::create_dir_all(&dir).map_err(|e| anyhow!("create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Whether `path` sits directly inside the workspaces dir.
///
/// Every destructive operation here is gated on this: the frontend hands us
/// paths it read back from its own store, and a corrupt or hand-edited
/// `workspaces.json` must not be able to talk us into deleting arbitrary files.
pub fn is_workspace_image<R: Runtime>(app: &AppHandle<R>, path: &Path) -> bool {
    let Ok(dir) = workspaces_dir(app) else {
        return false;
    };
    // Compare canonical forms so `..` segments can't escape the directory.
    // A missing file cannot be canonicalised, so fall back to comparing the
    // parent — enough to keep `remove_file` scoped, and it still fails safely
    // because the removal of a nonexistent file is a no-op.
    match (path.canonicalize(), dir.canonicalize()) {
        (Ok(p), Ok(d)) => p.parent() == Some(d.as_path()),
        _ => path.parent() == Some(dir.as_path()),
    }
}

/// Copy `source` into the workspaces dir under a fresh id, returning the new path.
///
/// The copy is what makes a workspace outlive its temp file. `source` is left
/// alone: for a capture it is still the active temp file that Rust owns and
/// will delete on the next swap.
pub fn adopt<R: Runtime>(app: &AppHandle<R>, source: &Path, id: &str) -> Result<PathBuf> {
    if !source.is_file() {
        return Err(anyhow!("source is not a file: {}", source.display()));
    }
    // Ids come from the frontend's uid(); keep them to a filename-safe alphabet
    // so a malformed one cannot walk out of the directory.
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(anyhow!("invalid workspace id"));
    }
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .filter(|e| matches!(*e, "png" | "jpg" | "jpeg" | "webp"))
        .unwrap_or("png");
    let dest = workspaces_dir(app)?.join(format!("{id}.{ext}"));
    std::fs::copy(source, &dest)
        .map_err(|e| anyhow!("copy to {}: {e}", dest.display()))?;
    Ok(dest)
}

/// Delete one workspace image. Silently ignores a path outside the dir.
pub fn discard<R: Runtime>(app: &AppHandle<R>, path: &Path) -> Result<()> {
    if !is_workspace_image(app, path) {
        return Err(anyhow!("refusing to delete a non-workspace file"));
    }
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        // Already gone is success: callers delete on close and on undo expiry.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(anyhow!("remove {}: {e}", path.display())),
    }
}

/// Delete every file in the workspaces dir whose stem is not in `keep`.
///
/// DANGEROUS BY CONSTRUCTION: called with an empty `keep` it wipes every
/// workspace. The frontend must only call it *after* it has successfully
/// hydrated `workspaces.json`, never on a load failure — an orphan file costs
/// disk, a wrongly-swept one costs the user's work.
pub fn sweep_orphans<R: Runtime>(app: &AppHandle<R>, keep: &[String]) -> Result<usize> {
    let dir = workspaces_dir(app)?;
    let mut removed = 0usize;
    for entry in std::fs::read_dir(&dir)
        .map_err(|e| anyhow!("read {}: {e}", dir.display()))?
        .flatten()
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if keep.iter().any(|k| k == stem) {
            continue;
        }
        if std::fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}
