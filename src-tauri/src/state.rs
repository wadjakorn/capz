use std::path::PathBuf;
use std::sync::Mutex;

use image::RgbaImage;

/// In-flight scrolling capture. Created by `scroll_capture_start_command` and
/// consumed on finish/cancel. The background sampler locks the containing
/// mutex each tick to stitch the newest frame onto `acc`; taking the session
/// out (setting the mutex to `None`) signals the sampler to stop.
///
/// `acc` is the growing stitched image; `prev` is the most recently appended
/// frame, whose full content forms the tail of `acc` (the alignment invariant
/// `services::stitch` relies on). Region coords are physical device pixels
/// relative to `monitor_id`'s top-left — the same contract as
/// `capture_region_command`.
pub struct ScrollSession {
    pub monitor_id: u32,
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
    pub acc: RgbaImage,
    pub prev: RgbaImage,
    /// Distinct frames stitched so far (includes the initial frame).
    pub frames: u32,
    /// Count of low-confidence butt-joins (seams that may be imperfect).
    pub warnings: u32,
    /// Whether the sampler is currently driving the target itself (auto-scroll,
    /// ticket EJckEbEdk0ct). `false` = the user scrolls by hand. Toggled by
    /// `scroll_capture_auto_start_command` / `scroll_capture_auto_stop_command`;
    /// the sampler also clears it when it falls back to manual.
    pub auto: bool,
    /// Consecutive auto-scroll steps that produced no new content. Reset on any
    /// progress. Used to detect "bottom reached" (after progress) or "target
    /// ignores synthetic scroll" (no progress at all).
    pub dup_streak: u32,
    /// Whether **auto-scroll itself** has appended real content since it was
    /// last enabled. Distinct from `frames`, which also counts frames the user
    /// scrolled in manually before pressing Auto-scroll — using `frames` here
    /// would misread those as auto progress and finish a truncated capture when
    /// the target actually ignores synthetic scroll. Reset each time auto starts.
    pub auto_progressed: bool,
    /// Height (physical px) of the fixed bottom band (window chrome / scrollbar /
    /// bottom border) that never scrolls, locked on the first genuine scroll.
    /// Excluded from every stitch so it is never welded into a seam. `None` until
    /// the first real scroll establishes it. See `commands::scroll`.
    pub footer: Option<u32>,
}

impl ScrollSession {
    /// Construct a fresh capture session for a starting `first` frame over the
    /// given physical-pixel region. `auto` seeds whether the sampler drives the
    /// scroll from its first tick (true = start in auto-scroll, false = manual).
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        monitor_id: u32,
        x: i32,
        y: i32,
        w: u32,
        h: u32,
        first: RgbaImage,
        auto: bool,
    ) -> Self {
        ScrollSession {
            monitor_id,
            x,
            y,
            w,
            h,
            acc: first.clone(),
            prev: first,
            frames: 1,
            warnings: 0,
            auto,
            dup_streak: 0,
            auto_progressed: false,
            footer: None,
        }
    }
}

/// App-wide runtime state.
///
/// `active_temp_path` is the currently-loaded editor image. Set on every load
/// (capture or paste); previous file is removed when replaced. Cleared (and
/// file removed) on tray Quit. Survives editor hide/show. Process-local — no
/// disk persistence; quitting wipes the workspace by design.
#[derive(Default)]
pub struct AppState {
    pub active_temp_path: Mutex<Option<PathBuf>>,
    /// The single in-flight scrolling capture, if any. `None` when idle.
    pub scroll: Mutex<Option<ScrollSession>>,
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
