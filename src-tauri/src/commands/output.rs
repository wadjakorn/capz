use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Return the OS-default Shotr save directory (`<Pictures>/Capz`).
/// Does not create the directory — frontend uses `plugin-fs` for that
/// (filesystem writes must go through the scoped plugin, not raw std::fs).
#[tauri::command]
pub fn default_save_dir(app: AppHandle) -> Result<String, String> {
    let pictures = app.path().picture_dir().map_err(|e| e.to_string())?;
    let dir = pictures.join("Capz");
    Ok(dir.to_string_lossy().to_string())
}

/// Open the given DIRECTORY in Finder (macOS) or Explorer (Windows), showing
/// its contents. For a file, use `reveal_file_in_finder` instead — plain `open`
/// on a file hands it to the default app (Preview) rather than revealing it.
#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = p;
        return Err("unsupported platform".into());
    }
    Ok(())
}

/// Reveal a FILE in Finder / Explorer with the file itself selected.
///
/// Deliberately a separate command from `reveal_in_finder` rather than a flag:
/// the two are not interchangeable. `open -R` on a *directory* reveals it inside
/// its parent, which is the opposite of what the settings rows and the history
/// menu's "Open save folder" want.
#[tauri::command]
pub fn reveal_file_in_finder(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        // `/select,<path>` must be one argument with no space after the comma;
        // Explorer parses it as a single switch and silently opens the user's
        // Documents folder if the path is passed separately.
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", p.display()))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = p;
        return Err("unsupported platform".into());
    }
    Ok(())
}

/// Move a file to the OS Trash / Recycle Bin.
///
/// Deliberately not `std::fs::remove_file`: this is driven by the capture
/// history's Delete action, which acts on files the user chose to save. A
/// recoverable delete is the only kind worth offering for those — the confirm
/// dialog promises the file can be restored, and this is what keeps that true.
///
/// Errors (permission, a file already gone, no trash on the platform) surface
/// to the caller so the row is kept rather than silently dropped from history.
#[tauri::command]
pub async fn trash_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err(format!("not a file: {path}"));
    }
    tauri::async_runtime::spawn_blocking(move || trash::delete(&p).map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("join: {e}"))?
}
