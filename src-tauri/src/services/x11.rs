//! X11 pointer / modifier queries (Linux, CP-0084).
//!
//! One `QueryPointer` round-trip answers both "where is the cursor?" (root
//! coordinates, physical pixels — the same space xcap reports X11 monitor rects
//! in) and "which modifiers are down?" (the key/button mask). Like the macOS
//! and Windows paths this is a state query, not an input grab: it needs no
//! permission and can't observe or suppress keystrokes.
//!
//! On a Wayland session without XWayland the connection fails and every query
//! returns `None`, so callers take their existing "unsupported" fallback.

use std::sync::{Mutex, OnceLock};

use x11rb::connection::Connection;
use x11rb::protocol::xproto::{ConnectionExt, KeyButMask, Window};
use x11rb::rust_connection::RustConnection;

/// Pointer state at query time.
#[derive(Debug, Clone, Copy)]
pub struct Pointer {
    pub x: i16,
    pub y: i16,
    pub mask: KeyButMask,
}

/// Lazily opened and reused: the hold-ring polls modifiers repeatedly, and a
/// fresh connection per poll would cost a socket + handshake each time. A
/// failed query drops the connection so the next one reconnects.
fn conn() -> &'static Mutex<Option<(RustConnection, Window)>> {
    static CONN: OnceLock<Mutex<Option<(RustConnection, Window)>>> = OnceLock::new();
    CONN.get_or_init(|| Mutex::new(None))
}

pub fn query_pointer() -> Option<Pointer> {
    let mut guard = conn().lock().ok()?;
    if guard.is_none() {
        let (c, screen) = x11rb::connect(None).ok()?;
        let root = c.setup().roots.get(screen)?.root;
        *guard = Some((c, root));
    }
    let (c, root) = guard.as_ref()?;
    let reply = c.query_pointer(*root).ok().and_then(|cookie| cookie.reply().ok());
    match reply {
        Some(r) => Some(Pointer {
            x: r.root_x,
            y: r.root_y,
            mask: r.mask,
        }),
        None => {
            *guard = None;
            None
        }
    }
}
