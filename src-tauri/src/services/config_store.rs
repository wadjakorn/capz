//! Resolves the absolute path of the persistent settings store
//! (`config.json`) under `app_data_dir()` — same base directory that
//! `tauri-plugin-store` v2 uses internally (`BaseDirectory::AppData`).
//! Pinning the path here makes the store location independent of any future
//! plugin default-path change and surfaces the resolved path in logs for
//! diagnosing the "settings wiped after updater" bug.
//!
//! NOTE: `app_data_dir()` is derived from the bundle `identifier` in
//! `tauri.conf.json` (`dev.baze.capz`). Changing that identifier moves the
//! config directory and orphans every existing user's settings on update —
//! it is effectively a one-way constraint. Do not change it.

use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

pub const CONFIG_STORE_FILE: &str = "config.json";
pub const CONFIG_STORE_KEY: &str = "app";

pub fn config_store_path<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<PathBuf> {
    Ok(app.path().app_data_dir()?.join(CONFIG_STORE_FILE))
}
