//! Non-activating capture windows (Spotlight-style).
//!
//! On macOS, `set_focus()` on a Tauri window calls `activateIgnoringOtherApps`,
//! which activates capz and drags the editor in front of whatever the user was
//! about to capture. Converting the capture overlays to a non-activating
//! `NSPanel` lets them become key (so Esc and pointer input still work) without
//! activating the app — the screen stays exactly as the user sees it, so a
//! visible editor is captured and a buried one stays buried.
//!
//! Elsewhere these helpers fall through to the plain Tauri calls.
//!
//! Rules (see the crate's docs and SCRUTINIZE-v2):
//! - never call `set_focusable` on a converted window (tao reads an ivar the
//!   swapped class no longer has);
//! - never install a `panel_event!` handler — it replaces tao's delegate and
//!   Tauri's focus/blur events stop;
//! - always close through [`close`], which hands the window back via
//!   `to_window()` so the crate's panel store drops its strong reference.

use tauri::{AppHandle, Runtime, WebviewWindow};

#[cfg(target_os = "macos")]
mod mac {
    tauri_nspanel::tauri_panel! {
        panel!(CapzCapturePanel {
            config: {
                can_become_key_window: true,
                can_become_main_window: false,
                is_floating_panel: true,
                hides_on_deactivate: false
            }
        })
    }
}

/// Convert `win` to a non-activating panel. Must run on the main thread, before
/// the window is first shown. No-op off macOS.
pub fn make_nonactivating<R: Runtime>(win: &WebviewWindow<R>) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::objc2_app_kit::NSWindowStyleMask;
        use tauri_nspanel::WebviewWindowExt;
        let panel = win.to_panel::<mac::CapzCapturePanel<R>>()?;
        let current: NSWindowStyleMask =
            unsafe { tauri_nspanel::objc2::msg_send![panel.as_panel(), styleMask] };
        let mask = current | NSWindowStyleMask::NonactivatingPanel;
        // `set_style_mask` is the only path that also syncs WindowServer's
        // activation-prevention tag (`_setPreventsActivation:`).
        panel
            .set_style_mask(mask)
            .map_err(|e| tauri::Error::Anyhow(anyhow::anyhow!("nonactivating style: {e:?}")))?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = win;
    Ok(())
}

/// Order `win` front without making it key or activating capz (macOS panel);
/// plain `show()` elsewhere.
pub fn show<R: Runtime>(app: &AppHandle<R>, win: &WebviewWindow<R>) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;
        if let Ok(panel) = app.get_webview_panel(win.label()) {
            panel.show();
            return Ok(());
        }
    }
    let _ = app;
    win.show()
}

/// Make `win` key without activating capz. Replaces `set_focus()` for panels.
pub fn make_key<R: Runtime>(app: &AppHandle<R>, win: &WebviewWindow<R>) {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;
        if let Ok(panel) = app.get_webview_panel(win.label()) {
            panel.make_key_window();
            return;
        }
    }
    let _ = app;
    let _ = win.set_focus();
}

/// Close `win`, first handing a panel back to a plain window so the crate's
/// panel store releases it. Must run on the main thread.
pub fn close<R: Runtime>(app: &AppHandle<R>, win: &WebviewWindow<R>) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;
        if let Ok(panel) = app.get_webview_panel(win.label()) {
            if let Some(w) = panel.to_window() {
                return w.close();
            }
        }
    }
    let _ = app;
    win.close()
}
