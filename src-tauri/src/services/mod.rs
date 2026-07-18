pub mod capture_service;
pub mod config_store;
pub mod image_service;
pub mod monitor_service;
pub mod ocr;
// Not macOS-gated: only `run_interactive_area` inside is. Keeping the module
// compiled everywhere keeps its cancel-detection tests running on all platforms.
pub mod screencapture;
pub mod sound;
pub mod stitch;
pub mod synthetic_scroll;
pub mod window_service;
