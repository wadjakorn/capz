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

/// Open the given directory in Finder (macOS) or Explorer (Windows).
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
