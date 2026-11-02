//! Wayland capture backend (Linux, CP-0094).
//!
//! xcap's Wayland path asks libwayshot for monitor scales, which needs wlroots
//! protocols GNOME and KDE don't have ("Cannot find required wayland
//! protocol"), and Wayland gives clients neither a global screen grab nor
//! window positions. So under a Wayland session capz swaps two backends and
//! keeps the rest of the pipeline:
//!
//! - **Monitors** come from GDK (logical geometry + integer scale), which every
//!   compositor serves through `wl_output` / `xdg_output`.
//! - **Pixels** come from the xdg-desktop-portal Screenshot interface,
//!   non-interactive: one image of the whole desktop, cropped here. The first
//!   call shows the desktop's permission dialog; after "Allow" it is silent.
//!
//! The portal writes its result to a file (GNOME: `~/Pictures/Screenshot-N.png`)
//! that is ours alone, so it is read and deleted immediately.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use image::RgbaImage;
use tauri::{AppHandle, Wry};
use zbus::blocking::{Connection, Proxy};
use zbus::zvariant::{OwnedValue, Value};

/// A monitor in GDK's logical (application) coordinates.
#[derive(Debug, Clone, PartialEq)]
pub struct WlMonitor {
    /// GDK monitor index — stable for the lifetime of the monitor layout.
    pub id: u32,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    /// GDK integer scale. GTK 3 renders at this scale even under fractional
    /// scaling (the compositor downsamples), so it equals the webview's
    /// devicePixelRatio on that monitor.
    pub scale: i32,
    pub is_primary: bool,
}

static APP: OnceLock<AppHandle<Wry>> = OnceLock::new();

/// Called once from `setup`: GDK must be queried on the main thread, and most
/// callers of `monitors()` run on worker threads without an app handle.
pub fn init(app: &AppHandle<Wry>) {
    let _ = APP.set(app.clone());
}

pub fn app() -> Option<&'static AppHandle<Wry>> {
    APP.get()
}

pub fn is_session() -> bool {
    crate::commands::system::is_wayland_session_value()
}

fn read_monitors_on_main() -> Vec<WlMonitor> {
    use gtk::prelude::*;
    let Some(display) = gtk::gdk::Display::default() else {
        return Vec::new();
    };
    let primary = display.primary_monitor();
    let mut out = Vec::new();
    for i in 0..display.n_monitors() {
        let Some(m) = display.monitor(i) else { continue };
        let g = m.geometry();
        out.push(WlMonitor {
            id: i as u32,
            name: m.model().map(|s| s.to_string()).unwrap_or_else(|| format!("Monitor {}", i + 1)),
            x: g.x(),
            y: g.y(),
            width: g.width(),
            height: g.height(),
            scale: m.scale_factor().max(1),
            is_primary: primary.as_ref() == Some(&m),
        });
    }
    // Wayland compositors rarely report a primary; treat the one at the
    // origin (or else the first) as primary so callers always have one.
    if !out.iter().any(|m| m.is_primary) {
        let idx = out.iter().position(|m| m.x == 0 && m.y == 0).unwrap_or(0);
        if let Some(m) = out.get_mut(idx) {
            m.is_primary = true;
        }
    }
    out
}

/// Never empty on success.
pub fn monitors() -> Result<Vec<WlMonitor>> {
    let mons = if gtk::is_initialized_main_thread() {
        read_monitors_on_main()
    } else {
        let app = APP.get().ok_or_else(|| anyhow!("wayland backend not initialised"))?;
        let (tx, rx) = mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(read_monitors_on_main());
        })
        .context("schedule monitor query")?;
        rx.recv_timeout(Duration::from_secs(2))
            .context("monitor query timed out")?
    };
    if mons.is_empty() {
        return Err(anyhow!("no monitors"));
    }
    Ok(mons)
}

/// Put `win` fullscreen on GDK monitor `monitor`. Wayland compositors ignore a
/// client's own window position, so this is how a per-monitor overlay lands on
/// the right screen — and fullscreen also covers panels and docks.
pub fn fullscreen_on_monitor<R: tauri::Runtime>(win: &tauri::WebviewWindow<R>, monitor: u32) {
    let w = win.clone();
    let res = win.run_on_main_thread(move || {
        use gtk::prelude::*;
        match (w.gtk_window(), gtk::gdk::Screen::default()) {
            (Ok(gw), Some(screen)) => gw.fullscreen_on_monitor(&screen, monitor as i32),
            _ => log::warn!("overlay: no GTK window/screen for fullscreen"),
        }
    });
    if let Err(e) = res {
        log::warn!("overlay fullscreen: {e}");
    }
}

/// Pixel rectangle `(x, y, w, h)` in a full-desktop screenshot.
pub type PxRect = (u32, u32, u32, u32);

/// Where `mon` sits in a screenshot of the whole desktop. The compositor
/// renders the screenshot at one scale for the whole layout, so the ratio is
/// image width over the layout's logical width — this stays right under
/// fractional and mixed scales without asking the compositor.
pub fn monitor_rect_in_image(mon: &WlMonitor, all: &[WlMonitor], img: (u32, u32)) -> Option<PxRect> {
    let min_x = all.iter().map(|m| m.x).min()?;
    let min_y = all.iter().map(|m| m.y).min()?;
    let max_x = all.iter().map(|m| m.x + m.width).max()?;
    let layout_w = (max_x - min_x).max(1) as f64;
    let ratio = img.0 as f64 / layout_w;
    let px = |v: i32| (v as f64 * ratio).round().max(0.0) as u32;
    let x = px(mon.x - min_x);
    let y = px(mon.y - min_y);
    if x >= img.0 || y >= img.1 {
        return None;
    }
    let w = px(mon.width).min(img.0 - x);
    let h = px(mon.height).min(img.1 - y);
    (w > 0 && h > 0).then_some((x, y, w, h))
}

/// Convert a region from the overlay — CSS px × devicePixelRatio, i.e. GDK
/// scale units relative to the monitor — into the monitor's crop of the
/// screenshot, whose pixel density is `crop_w / mon.width` per logical px.
pub fn region_in_monitor_crop(
    mon: &WlMonitor,
    crop: (u32, u32),
    region: (i32, i32, u32, u32),
) -> Option<PxRect> {
    let k = crop.0 as f64 / (mon.width.max(1) as f64 * mon.scale as f64);
    let (x, y, w, h) = region;
    let x = (x.max(0) as f64 * k).round() as u32;
    let y = (y.max(0) as f64 * k).round() as u32;
    if x >= crop.0 || y >= crop.1 {
        return None;
    }
    let w = ((w as f64 * k).round() as u32).clamp(1, crop.0 - x);
    let h = ((h as f64 * k).round() as u32).clamp(1, crop.1 - y);
    Some((x, y, w, h))
}

fn file_uri_to_path(uri: &str) -> Result<PathBuf> {
    let rest = uri
        .strip_prefix("file://")
        .ok_or_else(|| anyhow!("portal returned a non-file uri"))?;
    let decoded = percent_encoding::percent_decode_str(rest).decode_utf8_lossy();
    Ok(PathBuf::from(decoded.as_ref()))
}

/// Take a screenshot through xdg-desktop-portal. `interactive` lets the user
/// pick the area/window in the desktop's own UI (used for window capture,
/// since Wayland has no window list). The wait is long: the first call blocks
/// on the desktop's permission dialog.
pub fn portal_screenshot(interactive: bool) -> Result<RgbaImage> {
    let conn = Connection::session().context("session bus")?;
    let token = format!(
        "capz{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let sender = conn
        .unique_name()
        .ok_or_else(|| anyhow!("no bus name"))?
        .trim_start_matches(':')
        .replace('.', "_");
    let request_path = format!("/org/freedesktop/portal/desktop/request/{sender}/{token}");

    // Subscribe before calling so a fast reply can't be missed.
    let request = Proxy::new(
        &conn,
        "org.freedesktop.portal.Desktop",
        request_path,
        "org.freedesktop.portal.Request",
    )?;
    let mut responses = request.receive_signal("Response")?;

    let portal = Proxy::new(
        &conn,
        "org.freedesktop.portal.Desktop",
        "/org/freedesktop/portal/desktop",
        "org.freedesktop.portal.Screenshot",
    )?;
    let mut options: HashMap<&str, Value> = HashMap::new();
    options.insert("handle_token", Value::from(token.as_str()));
    options.insert("interactive", Value::from(interactive));
    let _: zbus::zvariant::OwnedObjectPath = portal
        .call("Screenshot", &("", options))
        .context("portal Screenshot call")?;

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let reply = responses.next().map(|m| {
            m.body()
                .deserialize::<(u32, HashMap<String, OwnedValue>)>()
                .map_err(anyhow::Error::from)
        });
        let _ = tx.send(reply);
    });
    let (code, results) = rx
        .recv_timeout(Duration::from_secs(if interactive { 600 } else { 120 }))
        .context("no answer from the screenshot portal")?
        .ok_or_else(|| anyhow!("screenshot portal closed the request"))??;
    match code {
        0 => {}
        1 => return Err(anyhow!("screenshot cancelled")),
        _ => return Err(anyhow!("screenshot permission denied")),
    }
    let uri: String = results
        .get("uri")
        .ok_or_else(|| anyhow!("portal reply has no uri"))?
        .try_clone()?
        .try_into()?;
    let path = file_uri_to_path(&uri)?;
    let img = image::open(&path)
        .with_context(|| format!("decode {}", path.display()))
        .map(|i| i.to_rgba8());
    if let Err(e) = std::fs::remove_file(&path) {
        log::warn!("remove portal screenshot {}: {e}", path.display());
    }
    img
}

/// Screenshot cropped to one monitor.
pub fn capture_monitor(id: u32) -> Result<RgbaImage> {
    let all = monitors()?;
    let mon = all
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| anyhow!("monitor id {id} not found"))?;
    let full = portal_screenshot(false)?;
    let (x, y, w, h) = monitor_rect_in_image(mon, &all, full.dimensions())
        .ok_or_else(|| anyhow!("monitor outside screenshot"))?;
    Ok(image::imageops::crop_imm(&full, x, y, w, h).to_image())
}

/// Freeze frame for area selection. Wayland gives no reliable see-through
/// overlay (compositors differ on transparent fullscreen surfaces), so area
/// mode shows a screenshot taken *before* the overlay opens and the selection
/// is cropped from that same image — what the user sees is what they get.
struct Frozen {
    image: RgbaImage,
    path: PathBuf,
}

fn frozen() -> &'static Mutex<HashMap<u32, Frozen>> {
    static FROZEN: OnceLock<Mutex<HashMap<u32, Frozen>>> = OnceLock::new();
    FROZEN.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Drop the freeze frame and delete its backdrop files.
pub fn clear_frozen() {
    if let Ok(mut map) = frozen().lock() {
        for (_, f) in map.drain() {
            let _ = std::fs::remove_file(&f.path);
        }
    }
}

/// Take one screenshot, split it per monitor, keep the crops for
/// `capture_region`, and write each as a backdrop PNG for its overlay. Returns
/// monitor id → backdrop path. The files match the asset-protocol scope
/// (`capz-temp-*`) and the 24h temp sweep.
pub fn freeze() -> Result<HashMap<u32, PathBuf>> {
    clear_frozen();
    let all = monitors()?;
    let full = portal_screenshot(false)?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut paths = HashMap::new();
    let mut map = frozen().lock().map_err(|_| anyhow!("freeze lock poisoned"))?;
    for mon in &all {
        let Some((x, y, w, h)) = monitor_rect_in_image(mon, &all, full.dimensions()) else {
            continue;
        };
        let image = image::imageops::crop_imm(&full, x, y, w, h).to_image();
        let path = std::env::temp_dir().join(format!("capz-temp-freeze-{}-{ts}.png", mon.id));
        // Fastest PNG settings: this file only lives while the overlay is up.
        let file = std::io::BufWriter::new(std::fs::File::create(&path)?);
        let enc = image::codecs::png::PngEncoder::new_with_quality(
            file,
            image::codecs::png::CompressionType::Fast,
            image::codecs::png::FilterType::NoFilter,
        );
        image::ImageEncoder::write_image(enc, image.as_raw(), w, h, image::ExtendedColorType::Rgba8)?;
        paths.insert(mon.id, path.clone());
        map.insert(mon.id, Frozen { image, path });
    }
    if paths.is_empty() {
        return Err(anyhow!("screenshot does not cover any monitor"));
    }
    Ok(paths)
}

/// Region of a monitor; `(x, y, w, h)` as the overlay sends it. Cropped from
/// the freeze frame when area mode took one, else from a fresh screenshot.
pub fn capture_region(id: u32, x: i32, y: i32, w: u32, h: u32) -> Result<RgbaImage> {
    let all = monitors()?;
    let mon = all
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| anyhow!("monitor id {id} not found"))?
        .clone();
    let held = frozen()
        .lock()
        .ok()
        .and_then(|m| m.get(&id).map(|f| f.image.clone()));
    let crop = match held {
        Some(img) => img,
        None => capture_monitor(id)?,
    };
    let (rx, ry, rw, rh) = region_in_monitor_crop(&mon, crop.dimensions(), (x, y, w, h))
        .ok_or_else(|| anyhow!("region origin outside monitor"))?;
    Ok(image::imageops::crop_imm(&crop, rx, ry, rw, rh).to_image())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mon(id: u32, x: i32, y: i32, w: i32, h: i32, scale: i32) -> WlMonitor {
        WlMonitor { id, name: String::new(), x, y, width: w, height: h, scale, is_primary: id == 0 }
    }

    #[test]
    fn single_monitor_maps_to_the_whole_image() {
        let m = mon(0, 0, 0, 1920, 1080, 1);
        assert_eq!(monitor_rect_in_image(&m, std::slice::from_ref(&m), (1920, 1080)), Some((0, 0, 1920, 1080)));
        // HiDPI: logical 1280x800 at scale 2 → a 2560x1600 screenshot.
        let m = mon(0, 0, 0, 1280, 800, 2);
        assert_eq!(monitor_rect_in_image(&m, std::slice::from_ref(&m), (2560, 1600)), Some((0, 0, 2560, 1600)));
    }

    #[test]
    fn side_by_side_monitors_split_the_image() {
        let a = mon(0, 0, 0, 1920, 1080, 1);
        let b = mon(1, 1920, 0, 1280, 1024, 1);
        let all = [a.clone(), b.clone()];
        assert_eq!(monitor_rect_in_image(&a, &all, (3200, 1080)), Some((0, 0, 1920, 1080)));
        assert_eq!(monitor_rect_in_image(&b, &all, (3200, 1080)), Some((1920, 0, 1280, 1024)));
    }

    #[test]
    fn negative_origins_are_shifted_into_the_image() {
        let left = mon(1, -1280, 0, 1280, 1024, 1);
        let main = mon(0, 0, 0, 1920, 1080, 1);
        let all = [left.clone(), main.clone()];
        assert_eq!(monitor_rect_in_image(&left, &all, (3200, 1080)), Some((0, 0, 1280, 1024)));
        assert_eq!(monitor_rect_in_image(&main, &all, (3200, 1080)), Some((1280, 0, 1920, 1080)));
    }

    #[test]
    fn mixed_scale_layout_uses_the_screenshot_density() {
        // The compositor rendered everything at 2x: a scale-1 monitor's crop
        // is still 2x its logical size.
        let hi = mon(0, 0, 0, 1280, 800, 2);
        let lo = mon(1, 1280, 0, 1920, 1080, 1);
        let all = [hi.clone(), lo.clone()];
        assert_eq!(monitor_rect_in_image(&lo, &all, (6400, 2160)), Some((2560, 0, 3840, 2160)));
    }

    #[test]
    fn region_scales_from_overlay_units_to_crop_pixels() {
        // Overlay on a scale-1 monitor whose crop is 2x dense.
        let lo = mon(1, 0, 0, 1920, 1080, 1);
        assert_eq!(
            region_in_monitor_crop(&lo, (3840, 2160), (100, 50, 300, 200)),
            Some((200, 100, 600, 400))
        );
        // Overlay units already match the crop (scale 2, crop 2x).
        let hi = mon(0, 0, 0, 1280, 800, 2);
        assert_eq!(
            region_in_monitor_crop(&hi, (2560, 1600), (100, 50, 300, 200)),
            Some((100, 50, 300, 200))
        );
    }

    #[test]
    fn region_is_clamped_to_the_crop() {
        let m = mon(0, 0, 0, 1920, 1080, 1);
        assert_eq!(
            region_in_monitor_crop(&m, (1920, 1080), (-5, 1000, 4000, 400)),
            Some((0, 1000, 1920, 80))
        );
        assert_eq!(region_in_monitor_crop(&m, (1920, 1080), (1920, 0, 10, 10)), None);
    }

    #[test]
    fn file_uris_are_decoded() {
        assert_eq!(
            file_uri_to_path("file:///home/a/Pictures/Screen%20shot.png").unwrap(),
            PathBuf::from("/home/a/Pictures/Screen shot.png")
        );
        assert!(file_uri_to_path("https://x/y.png").is_err());
    }
}
