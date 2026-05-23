//! Cross-window user notice channel.
//!
//! Rust emits `app:notice` with `{ kind, message }` to all webviews. Frontend
//! toaster listens and surfaces. Use this for failure paths that originate
//! outside an active frontend command — e.g. hotkey-triggered capture
//! errors, overlay-driven region capture, sound spawn failures.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)] // Info/Success are part of the public surface for future callers.
pub enum NoticeKind {
    Info,
    Success,
    Error,
}

#[derive(Serialize, Clone)]
struct NoticePayload {
    kind: NoticeKind,
    message: String,
}

pub fn emit<R: Runtime>(app: &AppHandle<R>, kind: NoticeKind, message: impl Into<String>) {
    let payload = NoticePayload {
        kind,
        message: message.into(),
    };
    if let Err(e) = app.emit("app:notice", payload) {
        log::warn!("emit app:notice: {e}");
    }
}

pub fn error<R: Runtime>(app: &AppHandle<R>, message: impl Into<String>) {
    emit(app, NoticeKind::Error, message);
}
