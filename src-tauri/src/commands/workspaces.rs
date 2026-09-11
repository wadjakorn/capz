//! Commands backing the multi-workspace feature (CP-0045).
//!
//! The frontend owns the workspace *documents* (annotations, crop, zoom) in
//! `workspaces.json` via tauri-plugin-store. Rust owns only the backing image
//! files, because those need a durable home outside the temp dir and the
//! deletion paths must be scoped somewhere the webview cannot reach.

use tauri::{AppHandle, Runtime};

use crate::services::workspace_store;

/// Copy a capture's temp file into the workspaces dir under `id`.
///
/// Returns the new absolute path, which the frontend stores and later feeds to
/// `convertFileSrc`. The temp file is intentionally left in place — it is still
/// the active workspace file as far as `AppState` is concerned, and
/// `load_editor_image` remains responsible for retiring it.
#[tauri::command]
pub async fn persist_workspace_image<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    id: String,
) -> Result<String, String> {
    let source = std::path::PathBuf::from(&path);
    // Already ours (a workspace re-adopting its own file) — nothing to copy.
    if workspace_store::is_workspace_image(&app, &source) {
        return Ok(path);
    }
    workspace_store::adopt(&app, &source, &id)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// Delete one workspace's backing image. Refuses paths outside the dir.
#[tauri::command]
pub async fn delete_workspace_image<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<(), String> {
    workspace_store::discard(&app, std::path::Path::new(&path)).map_err(|e| e.to_string())
}

/// Remove workspace images whose id is no longer known to the frontend.
///
/// Call ONLY after `workspaces.json` has loaded successfully. `keep_ids` is the
/// complete set of live workspace ids; anything else in the directory is an
/// orphan from a crash or a forced quit. Returns how many files were removed.
#[tauri::command]
pub async fn sweep_workspace_images<R: Runtime>(
    app: AppHandle<R>,
    keep_ids: Vec<String>,
) -> Result<usize, String> {
    workspace_store::sweep_orphans(&app, &keep_ids).map_err(|e| e.to_string())
}
