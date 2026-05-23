use std::path::PathBuf;
use std::sync::Mutex;

/// App-wide runtime state.
///
/// `active_temp_path` is the currently-loaded editor image. Set on every load
/// (capture or paste); previous file is removed when replaced. Cleared (and
/// file removed) on tray Quit. Survives editor hide/show. Process-local — no
/// disk persistence; quitting wipes the workspace by design.
#[derive(Default)]
pub struct AppState {
    pub active_temp_path: Mutex<Option<PathBuf>>,
}

impl AppState {
    /// Atomically swap the active temp path. Returns the previous path (if any)
    /// so the caller can remove it from disk.
    pub fn swap(&self, next: Option<PathBuf>) -> Option<PathBuf> {
        let mut g = self
            .active_temp_path
            .lock()
            .expect("active_temp_path poisoned");
        std::mem::replace(&mut *g, next)
    }

    pub fn current(&self) -> Option<PathBuf> {
        self.active_temp_path
            .lock()
            .expect("active_temp_path poisoned")
            .clone()
    }
}
