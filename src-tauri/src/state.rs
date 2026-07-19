use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
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
    /// Requested wheel-notch count for the **next** Windows auto-scroll step.
    /// Adapted after each step by `commands::scroll::next_auto_clicks` to keep
    /// the per-step advance well under one viewport (a fixed count overshoots on
    /// targets that map each notch to a large jump — CP-0014). Starts small and
    /// only grows if steps are too small to progress. Unused on macOS, which
    /// scrolls an exact pixel fraction and needs no feedback.
    pub auto_clicks: i32,
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
            // Start at one notch: the smallest, safest advance. The Windows
            // sampler ramps up only if a step proves too small to progress
            // (`next_auto_clicks`), so a first step can't overshoot the stitcher.
            auto_clicks: 1,
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
    /// Whether the capture currently being dispatched was requested "as a
    /// layer" (from the editor's capture-as-layer split button) rather than as
    /// a workspace replacement. Written at every dispatch entry point
    /// (`capture_dispatch::trigger_capture`) and consumed by
    /// `windows::load_editor_image`.
    ///
    /// Living in Rust rather than as a frontend latch is deliberate: the
    /// intent must survive the editor being hidden, the overlay round-trip and
    /// a cancelled area drag. Because *every* dispatch (hotkey, tray, command
    /// ring, both toolbar buttons) re-writes it, a cancelled layer capture
    /// cannot leak into the next replace capture.
    pending_layer: AtomicBool,
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

    /// Record whether the capture now being dispatched is a layer capture.
    pub fn set_pending_layer(&self, layer: bool) {
        self.pending_layer.store(layer, Ordering::SeqCst);
    }

    /// Read-and-clear the layer intent. Clearing on read means a single
    /// dispatch can only ever produce one layer image.
    pub fn take_pending_layer(&self) -> bool {
        self.pending_layer.swap(false, Ordering::SeqCst)
    }

    pub fn current(&self) -> Option<PathBuf> {
        self.active_temp_path
            .lock()
            .expect("active_temp_path poisoned")
            .clone()
    }
}
