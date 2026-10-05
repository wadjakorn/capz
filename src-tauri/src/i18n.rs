//! UI language for the few strings Rust shows itself: the tray menu and its
//! busy tooltip, the editor window title, `app:notice` toasts and scroll-HUD
//! notes. Everything else is translated in the webview (src/i18n).
//!
//! The language is read from `general.language` in config.json at startup and
//! then pushed by the frontend's LanguageManager through `set_ui_language`
//! whenever the setting changes, so the tray relabels live.

use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Mutex;

use tauri::{menu::MenuItem, AppHandle, Manager, Runtime, Wry};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Lang {
    En,
    Th,
}

impl Lang {
    fn parse(s: &str) -> Option<Self> {
        match s {
            "en" => Some(Lang::En),
            "th" => Some(Lang::Th),
            _ => None,
        }
    }
}

static LANG: AtomicU8 = AtomicU8::new(1); // Th — the default for fresh installs.

pub fn current() -> Lang {
    if LANG.load(Ordering::Relaxed) == 0 {
        Lang::En
    } else {
        Lang::Th
    }
}

fn set(lang: Lang) {
    LANG.store(if lang == Lang::En { 0 } else { 1 }, Ordering::Relaxed);
}

#[derive(Clone, Copy, Debug)]
pub enum Msg {
    TrayCaptureFull,
    TrayCaptureArea,
    TrayCaptureWindow,
    TrayCaptureScroll,
    TrayOpenApp,
    TrayQuit,
    Capturing,
    EditorTitle,
    /// Followed by `: <error>`.
    CaptureFailed,
    /// `{}` is the comma-separated list of accelerators.
    ShortcutsInactive,
    ScrollAutoUnavailable,
    ScrollTargetIgnored,
    /// Only raised by the macOS window picker.
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    ScreenRecordingRequired,
}

pub fn text(lang: Lang, msg: Msg) -> &'static str {
    use Msg::*;
    match (lang, msg) {
        (Lang::En, TrayCaptureFull) => "Capture Full Screen",
        (Lang::Th, TrayCaptureFull) => "จับภาพทั้งหน้าจอ",
        (Lang::En, TrayCaptureArea) => "Capture Area",
        (Lang::Th, TrayCaptureArea) => "จับภาพบางส่วน",
        (Lang::En, TrayCaptureWindow) => "Capture Window…",
        (Lang::Th, TrayCaptureWindow) => "จับภาพหน้าต่าง…",
        (Lang::En, TrayCaptureScroll) => "Scrolling Capture…",
        (Lang::Th, TrayCaptureScroll) => "จับภาพแบบเลื่อน…",
        (Lang::En, TrayOpenApp) => "Open App",
        (Lang::Th, TrayOpenApp) => "เปิดแอป",
        (Lang::En, TrayQuit) => "Quit capz",
        (Lang::Th, TrayQuit) => "ออกจาก capz",
        (Lang::En, Capturing) => "Capturing…",
        (Lang::Th, Capturing) => "กำลังจับภาพ…",
        (Lang::En, EditorTitle) => "capz — Editor",
        (Lang::Th, EditorTitle) => "capz — ตัวแก้ไข",
        (Lang::En, CaptureFailed) => "Capture failed",
        (Lang::Th, CaptureFailed) => "จับภาพไม่สำเร็จ",
        (Lang::En, ShortcutsInactive) => "Some shortcuts are inactive ({}). Open Settings to fix them.",
        (Lang::Th, ShortcutsInactive) => "ปุ่มลัดบางชุดใช้งานไม่ได้ ({}) เปิดการตั้งค่าเพื่อแก้ไข",
        (Lang::En, ScrollAutoUnavailable) => "Auto-scroll unavailable — scroll manually",
        (Lang::Th, ScrollAutoUnavailable) => "เลื่อนอัตโนมัติไม่ได้ — เลื่อนเองแทน",
        (Lang::En, ScrollTargetIgnored) => "Target ignored auto-scroll — scroll manually",
        (Lang::Th, ScrollTargetIgnored) => "หน้าต่างนี้ไม่รับการเลื่อนอัตโนมัติ — เลื่อนเองแทน",
        (Lang::En, ScreenRecordingRequired) => "Screen Recording permission required. Grant in System Settings → Privacy & Security → Screen Recording, then restart the app.",
        (Lang::Th, ScreenRecordingRequired) => "ต้องอนุญาตการบันทึกหน้าจอ ไปที่ System Settings → Privacy & Security → Screen Recording แล้วเปิดแอปใหม่",
    }
}

/// Translate `msg` in the current language.
pub fn tr(msg: Msg) -> &'static str {
    text(current(), msg)
}

/// `"Capture failed: <e>"` in the current language (the detail stays as-is).
pub fn capture_failed(e: impl std::fmt::Display) -> String {
    format!("{}: {e}", tr(Msg::CaptureFailed))
}

/// Resolve the stored language: an explicit `general.language` wins; a config
/// that predates the setting means an upgrading English user; no config at all
/// is a fresh install, which gets the Thai default. Mirrors the v3 → v4 step
/// in src/lib/config.ts.
pub fn lang_from_config(config: Option<&serde_json::Value>) -> Lang {
    match config {
        None => Lang::Th,
        Some(v) => v
            .get("general")
            .and_then(|g| g.get("language"))
            .and_then(|l| l.as_str())
            .and_then(Lang::parse)
            .unwrap_or(Lang::En),
    }
}

pub fn init_from_config<R: Runtime>(app: &AppHandle<R>) {
    use crate::services::config_store::{config_store_path, CONFIG_STORE_KEY};
    use tauri_plugin_store::StoreExt;
    let stored = config_store_path(app)
        .ok()
        .and_then(|p| app.store(p).ok())
        .and_then(|s| s.get(CONFIG_STORE_KEY));
    set(lang_from_config(stored.as_ref()));
}

/// Tray items kept so they can be relabelled when the language changes.
#[derive(Default)]
pub struct TrayLabels(pub Mutex<Vec<(Msg, MenuItem<Wry>)>>);

fn relabel(app: &AppHandle<Wry>) {
    if let Some(labels) = app.try_state::<TrayLabels>() {
        if let Ok(items) = labels.0.lock() {
            for (msg, item) in items.iter() {
                if let Err(e) = item.set_text(tr(*msg)) {
                    log::warn!("tray relabel: {e}");
                }
            }
        }
    }
    if let Some(editor) = app.get_webview_window("editor") {
        let _ = editor.set_title(tr(Msg::EditorTitle));
    }
}

#[tauri::command]
pub fn set_ui_language(app: AppHandle<Wry>, lang: String) -> Result<(), String> {
    let lang = Lang::parse(&lang).ok_or_else(|| format!("unknown language: {lang}"))?;
    if lang != current() {
        set(lang);
    }
    relabel(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn fresh_install_is_thai() {
        assert_eq!(lang_from_config(None), Lang::Th);
    }

    #[test]
    fn pre_language_config_stays_english() {
        assert_eq!(lang_from_config(Some(&json!({ "general": { "theme": "dark" } }))), Lang::En);
    }

    #[test]
    fn explicit_language_wins() {
        assert_eq!(lang_from_config(Some(&json!({ "general": { "language": "th" } }))), Lang::Th);
        assert_eq!(lang_from_config(Some(&json!({ "general": { "language": "en" } }))), Lang::En);
        assert_eq!(lang_from_config(Some(&json!({ "general": { "language": "xx" } }))), Lang::En);
    }

    #[test]
    fn every_message_has_both_languages() {
        use Msg::*;
        for m in [
            TrayCaptureFull, TrayCaptureArea, TrayCaptureWindow, TrayCaptureScroll, TrayOpenApp,
            TrayQuit, Capturing, EditorTitle, CaptureFailed, ShortcutsInactive,
            ScrollAutoUnavailable, ScrollTargetIgnored, ScreenRecordingRequired,
        ] {
            assert!(!text(Lang::En, m).is_empty());
            assert!(!text(Lang::Th, m).is_empty());
        }
        assert!(text(Lang::Th, ShortcutsInactive).contains("{}"));
    }
}
