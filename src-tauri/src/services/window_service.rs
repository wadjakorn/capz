use anyhow::{anyhow, Result};
use image::RgbaImage;
use xcap::Window;

pub fn capture_window(id: u32) -> Result<RgbaImage> {
    let wins = Window::all().map_err(|e| anyhow!("Window::all: {e}"))?;
    for w in wins {
        if w.id().map_err(|e| anyhow!("id: {e}"))? == id {
            return w.capture_image().map_err(|e| anyhow!("capture: {e}"));
        }
    }
    Err(anyhow!("window id {id} not found"))
}
