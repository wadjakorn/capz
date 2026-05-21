use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn show_settings(app: &AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window("settings") {
        win.show()?;
        win.set_focus()?;
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings/index.html".into()))
        .title("Shotr — Settings")
        .inner_size(720.0, 520.0)
        .resizable(true)
        .visible(true)
        .build()?;
    Ok(())
}
