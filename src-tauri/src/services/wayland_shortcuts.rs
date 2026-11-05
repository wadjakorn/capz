//! Global shortcuts on Wayland via the xdg-desktop-portal GlobalShortcuts
//! interface (CP-0094 W2).
//!
//! Wayland gives clients no global key grabs; tauri's global-shortcut plugin
//! uses X11 grabs, which only fire while an XWayland window has focus. The
//! portal is the sanctioned route (GNOME 48+, KDE, Hyprland). Constraints that
//! shape this module, all measured on GNOME 50:
//!
//! - The portal refuses callers without an app id ("An app id is required").
//!   A host (non-Flatpak) app gets one by calling
//!   `org.freedesktop.host.portal.Registry.Register` as the **first** portal
//!   call on its connection, and that only succeeds if a desktop file with the
//!   same id is installed — so we make sure `dev.baze.capz.desktop` exists.
//! - The session lives as long as the D-Bus connection, so one connection is
//!   kept for the app's lifetime and rebinding closes the old session first.
//! - The desktop asks the user to confirm the bindings once and owns them from
//!   then on; our accelerators are only the *preferred* triggers. Changing them
//!   later goes through `ConfigureShortcuts` (the desktop's own dialog).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use anyhow::{anyhow, Context, Result};
use tauri::{AppHandle, Wry};
use zbus::blocking::{Connection, Proxy};
use zbus::zvariant::{OwnedObjectPath, OwnedValue, Value};

use crate::shortcuts::HotkeyAction;

pub const APP_ID: &str = "dev.baze.capz";
const DEST: &str = "org.freedesktop.portal.Desktop";
const PATH: &str = "/org/freedesktop/portal/desktop";
const IFACE: &str = "org.freedesktop.portal.GlobalShortcuts";

/// Whether the portal accepted our shortcuts. Read by the editor to decide
/// whether to explain the `--capture` fallback.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    /// Not a Wayland session, or binding has not finished yet.
    Pending,
    Bound,
    Unavailable,
}

struct State {
    status: Status,
    session: Option<OwnedObjectPath>,
    actions: HashMap<String, HotkeyAction>,
    /// Shortcut id → the desktop's own label for the bound keys. The desktop
    /// owns the bindings, so this — not our config — is what actually fires.
    triggers: HashMap<String, String>,
}

fn state() -> &'static Mutex<State> {
    static S: OnceLock<Mutex<State>> = OnceLock::new();
    S.get_or_init(|| {
        Mutex::new(State {
            status: Status::Pending,
            session: None,
            actions: HashMap::new(),
            triggers: HashMap::new(),
        })
    })
}

pub fn status() -> Status {
    state().lock().map(|s| s.status).unwrap_or(Status::Unavailable)
}

/// Stable portal id per action — the desktop stores the user's binding under it.
fn shortcut_id(action: HotkeyAction) -> Option<&'static str> {
    Some(match action {
        HotkeyAction::CaptureFull => "capture-full",
        HotkeyAction::CaptureArea => "capture-area",
        HotkeyAction::CaptureWindow => "capture-window",
        HotkeyAction::CaptureScroll => "capture-scroll",
        HotkeyAction::ShowEditor => "show-editor",
        HotkeyAction::CommandRing => "command-ring",
        // macOS-only, and the hold ring needs modifier polling Wayland lacks.
        HotkeyAction::CaptureSystemArea | HotkeyAction::CommandRingV2 => return None,
    })
}

fn description(action: HotkeyAction) -> &'static str {
    use crate::i18n::{tr, Msg};
    match action {
        HotkeyAction::CaptureFull => tr(Msg::TrayCaptureFull),
        HotkeyAction::CaptureArea => tr(Msg::TrayCaptureArea),
        HotkeyAction::CaptureWindow => tr(Msg::TrayCaptureWindow),
        HotkeyAction::CaptureScroll => tr(Msg::TrayCaptureScroll),
        HotkeyAction::ShowEditor => tr(Msg::TrayOpenApp),
        HotkeyAction::CommandRing => tr(Msg::ShortcutCommandRing),
        HotkeyAction::CaptureSystemArea | HotkeyAction::CommandRingV2 => "",
    }
}

/// Tauri accelerator → XDG shortcuts-spec trigger (`CTRL+ALT+SHIFT+3`,
/// `LOGO+space`): modifiers upper-case, the key as an xkb keysym name.
pub fn to_xdg_trigger(accel: &str) -> Option<String> {
    let mut mods: Vec<&str> = Vec::new();
    let mut key: Option<String> = None;
    for tok in accel.split('+').map(str::trim) {
        let m = match tok.to_ascii_lowercase().as_str() {
            "cmdorctrl" | "commandorcontrol" | "ctrl" | "control" => Some("CTRL"),
            "alt" | "option" => Some("ALT"),
            "shift" => Some("SHIFT"),
            "super" | "meta" | "cmd" | "command" => Some("LOGO"),
            _ => None,
        };
        match m {
            Some(m) => {
                if !mods.contains(&m) {
                    mods.push(m);
                }
            }
            None => {
                if key.is_some() || tok.is_empty() {
                    return None;
                }
                key = Some(keysym(tok)?);
            }
        }
    }
    let key = key?;
    // Spec order, so equal bindings compare equal.
    let order = ["CTRL", "ALT", "SHIFT", "LOGO"];
    let mut parts: Vec<String> = order
        .iter()
        .filter(|m| mods.contains(m))
        .map(|m| m.to_string())
        .collect();
    parts.push(key);
    Some(parts.join("+"))
}

fn keysym(tok: &str) -> Option<String> {
    let lower = tok.to_ascii_lowercase();
    let named = match lower.as_str() {
        "space" => "space",
        "enter" | "return" => "Return",
        "tab" => "Tab",
        "escape" | "esc" => "Escape",
        "backspace" => "BackSpace",
        "delete" => "Delete",
        "insert" => "Insert",
        "home" => "Home",
        "end" => "End",
        "pageup" => "Page_Up",
        "pagedown" => "Page_Down",
        "arrowup" | "up" => "Up",
        "arrowdown" | "down" => "Down",
        "arrowleft" | "left" => "Left",
        "arrowright" | "right" => "Right",
        "printscreen" | "print" => "Print",
        _ => "",
    };
    if !named.is_empty() {
        return Some(named.to_string());
    }
    if tok.len() == 1 {
        let c = tok.chars().next()?;
        return c.is_ascii_alphanumeric().then(|| c.to_ascii_lowercase().to_string());
    }
    // F1..F24
    let up = tok.to_ascii_uppercase();
    if let Some(n) = up.strip_prefix('F').and_then(|n| n.parse::<u8>().ok()) {
        if (1..=24).contains(&n) {
            return Some(format!("F{n}"));
        }
    }
    None
}

/// Where the desktop looks for `dev.baze.capz.desktop`.
fn data_dirs() -> Vec<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut dirs = vec![std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| home.map(|h| h.join(".local/share")))
        .unwrap_or_default()];
    let sys = std::env::var("XDG_DATA_DIRS")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "/usr/local/share:/usr/share".into());
    dirs.extend(sys.split(':').map(PathBuf::from));
    dirs
}

/// The portal's app-id registration needs a desktop file named after the id.
/// Packages install `capz.desktop`; rather than depend on how capz was
/// installed (.deb, AppImage, dev build), keep a hidden user-level entry. One
/// we generated is rewritten whenever capz moved (its `Exec` no longer points
/// here); one the user or a package installed is left alone.
fn ensure_desktop_file() -> Result<()> {
    let name = format!("{APP_ID}.desktop");
    let user_dir = data_dirs()
        .into_iter()
        .next()
        .filter(|d| !d.as_os_str().is_empty())
        .ok_or_else(|| anyhow!("no XDG data home"))?
        .join("applications");
    let user_file = user_dir.join(&name);
    let exe = std::env::var_os("APPIMAGE")
        .map(PathBuf::from)
        .or_else(|| std::env::current_exe().ok())
        .ok_or_else(|| anyhow!("no executable path"))?;
    let body = desktop_entry(&exe);

    match std::fs::read_to_string(&user_file) {
        Ok(existing) if existing == body => return Ok(()),
        Ok(existing) if !existing.contains(GENERATED_MARK) => return Ok(()),
        Ok(_) => {}
        Err(_) => {
            let elsewhere = data_dirs()
                .iter()
                .skip(1)
                .any(|d| d.join("applications").join(&name).is_file());
            if elsewhere {
                return Ok(());
            }
        }
    }
    std::fs::create_dir_all(&user_dir)?;
    std::fs::write(&user_file, body).context("write desktop file")?;
    log::info!("wrote {} for portal app-id registration", user_file.display());
    Ok(())
}

const GENERATED_MARK: &str = "X-Capz-Generated=true";

fn desktop_entry(exe: &std::path::Path) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=capz\nExec=\"{}\"\nIcon=capz\nNoDisplay=true\n{GENERATED_MARK}\n",
        exe.display()
    )
}

fn connection() -> Result<&'static Connection> {
    static CONN: OnceLock<Connection> = OnceLock::new();
    // The listener and the first bind race here at startup; only one may
    // register (a second registered connection would just be dropped).
    static INIT: Mutex<()> = Mutex::new(());
    if let Some(c) = CONN.get() {
        return Ok(c);
    }
    let _guard = INIT.lock().map_err(|_| anyhow!("portal init lock poisoned"))?;
    if let Some(c) = CONN.get() {
        return Ok(c);
    }
    ensure_desktop_file()?;
    let conn = Connection::session().context("session bus")?;
    // Must precede every other portal call on this connection.
    let registry = Proxy::new(&conn, DEST, PATH, "org.freedesktop.host.portal.Registry")?;
    let opts: HashMap<&str, Value> = HashMap::new();
    registry
        .call::<_, _, ()>("Register", &(APP_ID, opts))
        .context("register app id with the portal")?;
    Ok(CONN.get_or_init(|| conn))
}

fn sender_path(conn: &Connection) -> Result<String> {
    Ok(conn
        .unique_name()
        .ok_or_else(|| anyhow!("no bus name"))?
        .trim_start_matches(':')
        .replace('.', "_"))
}

/// Call a portal method that answers through a Request object and wait for
/// its `Response`. `call` gets the handle token to put in its options.
fn request<F>(conn: &Connection, call: F) -> Result<HashMap<String, OwnedValue>>
where
    F: FnOnce(&str) -> Result<()>,
{
    let token = format!(
        "capz{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let path = format!("{PATH}/request/{}/{token}", sender_path(conn)?);
    let req = Proxy::new(conn, DEST, path, "org.freedesktop.portal.Request")?;
    let mut responses = req.receive_signal("Response")?;
    call(&token)?;
    // No timeout: BindShortcuts waits on the desktop's confirmation dialog.
    let msg = responses.next().ok_or_else(|| anyhow!("portal closed the request"))?;
    let (code, results): (u32, HashMap<String, OwnedValue>) = msg.body().deserialize()?;
    match code {
        0 => Ok(results),
        1 => Err(anyhow!("cancelled by the user")),
        _ => Err(anyhow!("portal request failed ({code})")),
    }
}

fn bind_blocking(bindings: &[(HotkeyAction, String)]) -> Result<()> {
    let conn = connection()?;
    let portal = Proxy::new(conn, DEST, PATH, IFACE)?;

    // A rebind replaces the whole set: close the previous session first.
    let previous = state().lock().ok().and_then(|mut s| s.session.take());
    if let Some(old) = previous {
        if let Ok(p) = Proxy::new(conn, DEST, old.as_str(), "org.freedesktop.portal.Session") {
            let _ = p.call::<_, _, ()>("Close", &());
        }
    }

    // Unique per bind: reusing a token while an old session is still being
    // torn down makes the portal fail both requests (response code 2).
    static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let seq = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let session_token = format!("capzsession{}_{seq}", std::process::id());
    let created = request(conn, |token| {
        let mut opts: HashMap<&str, Value> = HashMap::new();
        opts.insert("handle_token", Value::from(token));
        opts.insert("session_handle_token", Value::from(session_token.as_str()));
        portal
            .call::<_, _, OwnedObjectPath>("CreateSession", &(opts,))
            .map(|_| ())
            .map_err(anyhow::Error::from)
    })?;
    let session: OwnedObjectPath = created
        .get("session_handle")
        .ok_or_else(|| anyhow!("no session handle"))?
        .try_clone()?
        .try_into()
        .or_else(|_| -> Result<OwnedObjectPath> {
            // Some portals return the handle as a string.
            let s: String = created["session_handle"].try_clone()?.try_into()?;
            Ok(OwnedObjectPath::try_from(s)?)
        })?;

    let mut actions = HashMap::new();
    let mut shortcuts: Vec<(String, HashMap<&str, Value>)> = Vec::new();
    for (action, accel) in bindings {
        let Some(id) = shortcut_id(*action) else { continue };
        let mut props: HashMap<&str, Value> = HashMap::new();
        props.insert("description", Value::from(description(*action)));
        if let Some(t) = to_xdg_trigger(accel) {
            props.insert("preferred_trigger", Value::from(t));
        }
        shortcuts.push((id.to_string(), props));
        actions.insert(id.to_string(), *action);
    }
    let bound = request(conn, |token| {
        let mut opts: HashMap<&str, Value> = HashMap::new();
        opts.insert("handle_token", Value::from(token));
        portal
            .call::<_, _, OwnedObjectPath>("BindShortcuts", &(&session, &shortcuts, "", opts))
            .map(|_| ())
            .map_err(anyhow::Error::from)
    })?;

    if let Ok(mut s) = state().lock() {
        s.session = Some(session);
        s.actions = actions;
        s.triggers = bound.get("shortcuts").map(parse_triggers).unwrap_or_default();
        s.status = Status::Bound;
    }
    Ok(())
}

/// `a(sa{sv})` from BindShortcuts / ShortcutsChanged → id → trigger label.
fn parse_triggers(v: &OwnedValue) -> HashMap<String, String> {
    let Ok(list) = v.try_clone().map_err(anyhow::Error::from).and_then(|v| {
        Vec::<(String, HashMap<String, OwnedValue>)>::try_from(v).map_err(anyhow::Error::from)
    }) else {
        return HashMap::new();
    };
    list.into_iter()
        .filter_map(|(id, props)| {
            let label: String = props.get("trigger_description")?.try_clone().ok()?.try_into().ok()?;
            Some((id, pretty_trigger(&label)))
        })
        .collect()
}

/// Desktops label triggers their own way: GNOME 50 sends a raw GTK accelerator
/// wrapped in a localized sentence ("Press <Shift><Control>1"), KDE sends
/// "Ctrl+Shift+1". Normalise GTK's form to capz's "Ctrl+Shift+1" style; pass
/// anything else through.
pub fn pretty_trigger(desc: &str) -> String {
    let Some(start) = desc.find('<') else {
        return desc.trim().to_string();
    };
    let mut rest = &desc[start..];
    let mut mods: Vec<&str> = Vec::new();
    while let Some(after) = rest.strip_prefix('<') {
        let Some(end) = after.find('>') else { break };
        let m = match after[..end].to_ascii_lowercase().as_str() {
            "control" | "ctrl" | "primary" => "Ctrl",
            "alt" | "mod1" => "Alt",
            "shift" => "Shift",
            "super" | "mod4" | "meta" | "hyper" => "Super",
            _ => "",
        };
        if !m.is_empty() && !mods.contains(&m) {
            mods.push(m);
        }
        rest = &after[end + 1..];
    }
    let key = rest.split_whitespace().next().unwrap_or("");
    let key = match key {
        "grave" => "`".to_string(),
        "minus" => "-".to_string(),
        "equal" => "=".to_string(),
        "comma" => ",".to_string(),
        "period" => ".".to_string(),
        "slash" => "/".to_string(),
        "backslash" => "\\".to_string(),
        "semicolon" => ";".to_string(),
        "apostrophe" => "'".to_string(),
        "bracketleft" => "[".to_string(),
        "bracketright" => "]".to_string(),
        "space" => "Space".to_string(),
        "Return" => "Enter".to_string(),
        k if k.chars().count() == 1 => k.to_uppercase(),
        k => k.to_string(),
    };
    let order = ["Ctrl", "Alt", "Shift", "Super"];
    let mut parts: Vec<String> = order
        .iter()
        .filter(|m| mods.contains(m))
        .map(|m| m.to_string())
        .collect();
    if !key.is_empty() {
        parts.push(key);
    }
    parts.join("+")
}

/// The keys the desktop actually bound, per action (empty label = unassigned).
pub fn triggers() -> Vec<(HotkeyAction, String)> {
    let Ok(s) = state().lock() else { return Vec::new() };
    s.actions
        .iter()
        .map(|(id, a)| (*a, s.triggers.get(id).cloned().unwrap_or_default()))
        .collect()
}

/// Follow the user re-binding capz's keys in the desktop's settings.
fn start_change_listener(app: AppHandle<Wry>) {
    std::thread::spawn(move || {
        let run = || -> Result<()> {
            let conn = connection()?;
            let portal = Proxy::new(conn, DEST, PATH, IFACE)?;
            for msg in portal.receive_signal("ShortcutsChanged")? {
                let Ok((session, list)) = msg.body().deserialize::<(OwnedObjectPath, OwnedValue)>() else {
                    continue;
                };
                if let Ok(mut s) = state().lock() {
                    if s.session.as_ref() != Some(&session) {
                        continue;
                    }
                    s.triggers = parse_triggers(&list);
                }
                use tauri::Emitter;
                let _ = app.emit("wayland:shortcuts-changed", ());
            }
            Ok(())
        };
        if let Err(e) = run() {
            log::warn!("portal ShortcutsChanged listener stopped: {e}");
        }
    });
}

/// Listen for `Activated` for the rest of the app's life. Started once; the
/// current session/id map is read per signal, so rebinding needs no restart.
fn start_listener(app: AppHandle<Wry>) {
    static STARTED: OnceLock<()> = OnceLock::new();
    if STARTED.set(()).is_err() {
        return;
    }
    start_change_listener(app.clone());
    std::thread::spawn(move || {
        let run = || -> Result<()> {
            let conn = connection()?;
            let portal = Proxy::new(conn, DEST, PATH, IFACE)?;
            for msg in portal.receive_signal("Activated")? {
                let Ok((session, id, _ts, _opts)) = msg
                    .body()
                    .deserialize::<(OwnedObjectPath, String, u64, HashMap<String, OwnedValue>)>()
                else {
                    continue;
                };
                let action = state().lock().ok().and_then(|s| {
                    (s.session.as_ref() == Some(&session))
                        .then(|| s.actions.get(&id).copied())
                        .flatten()
                });
                if let Some(action) = action {
                    log::info!("portal shortcut activated: {id}");
                    let app2 = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        crate::shortcuts::dispatch_action(&app2, action, "");
                    });
                }
            }
            Ok(())
        };
        if let Err(e) = run() {
            log::error!("portal shortcut listener stopped: {e}");
        }
    });
}

/// (Re)bind `bindings` through the portal in the background. The first bind
/// shows the desktop's confirmation dialog, so this never blocks the caller.
pub fn bind(app: &AppHandle<Wry>, bindings: Vec<(HotkeyAction, String)>) {
    start_listener(app.clone());
    let app = app.clone();
    let generation = BIND_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
    std::thread::spawn(move || {
        // One bind at a time: a second BindShortcuts while the desktop's
        // dialog is still open collides with the first.
        let Ok(mut last) = BIND_LOCK.lock() else { return };
        if BIND_GEN.load(std::sync::atomic::Ordering::SeqCst) != generation {
            return; // a newer bind is queued behind us
        }
        // Settings re-registers on every recorder blur; with nothing changed,
        // rebinding would only pop the confirmation dialog again.
        if status() == Status::Bound && last.as_ref() == Some(&bindings) {
            return;
        }
        let result = bind_blocking(&bindings);
        if BIND_GEN.load(std::sync::atomic::Ordering::SeqCst) != generation {
            // Superseded while the dialog was open; the newer bind reports.
            return;
        }
        if let Err(e) = result {
            *last = None;
            log::warn!("portal global shortcuts unavailable: {e:#}");
            if let Ok(mut s) = state().lock() {
                s.status = Status::Unavailable;
            }
            // No hotkeys at all: show the editor so its notice explains the
            // tray and the `--capture` fallback.
            use tauri::Emitter;
            let _ = app.emit("wayland:shortcuts-unavailable", ());
            let app2 = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Err(e) = crate::windows::show_editor(&app2) {
                    log::warn!("show editor: {e}");
                }
            });
        } else {
            *last = Some(bindings);
            log::info!("portal global shortcuts bound");
            use tauri::Emitter;
            let _ = app.emit("wayland:shortcuts-changed", ());
        }
    });
}

static BIND_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static BIND_LOCK: Mutex<Option<Vec<(HotkeyAction, String)>>> = Mutex::new(None);

/// Open the desktop's own dialog for changing capz's shortcuts.
pub fn configure() -> Result<()> {
    // GNOME's ConfigureShortcuts needs a parent window handle to show anything;
    // without one it silently does nothing (GNOME 50). Its Keyboard panel lists
    // every app's portal shortcuts, so open that instead.
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
    if desktop.split(':').any(|d| d.eq_ignore_ascii_case("GNOME")) {
        std::process::Command::new("gnome-control-center")
            .arg("keyboard")
            .spawn()
            .context("open GNOME Settings")?;
        return Ok(());
    }
    let conn = connection()?;
    let session = state()
        .lock()
        .ok()
        .and_then(|s| s.session.clone())
        .ok_or_else(|| anyhow!("shortcuts are not bound"))?;
    let portal = Proxy::new(conn, DEST, PATH, IFACE)?;
    let opts: HashMap<&str, Value> = HashMap::new();
    portal.call::<_, _, ()>("ConfigureShortcuts", &(&session, "", opts))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pretty_trigger_normalises_gtk_accelerators() {
        assert_eq!(pretty_trigger("Press <Shift><Control>1"), "Ctrl+Shift+1");
        assert_eq!(pretty_trigger("กด <Shift><Control>grave"), "Ctrl+Shift+`");
        assert_eq!(pretty_trigger("<Control><Alt>a"), "Ctrl+Alt+A");
        assert_eq!(pretty_trigger("<Super>space"), "Super+Space");
        assert_eq!(pretty_trigger("Ctrl+Shift+1"), "Ctrl+Shift+1");
        assert_eq!(pretty_trigger(""), "");
    }

    #[test]
    fn parses_bound_trigger_labels() {
        let mut full: HashMap<String, Value> = HashMap::new();
        full.insert("trigger_description".into(), Value::from("Press <Shift><Control>1"));
        let none: HashMap<String, Value> = HashMap::new();
        let list = vec![("capture-full".to_string(), full), ("capture-area".to_string(), none)];
        let v = OwnedValue::try_from(Value::from(list)).unwrap();
        let t = parse_triggers(&v);
        assert_eq!(t.get("capture-full").map(String::as_str), Some("Ctrl+Shift+1"));
        assert!(!t.contains_key("capture-area"));
    }

    #[test]
    fn default_accelerators_convert() {
        assert_eq!(to_xdg_trigger("CmdOrCtrl+Alt+Shift+3").as_deref(), Some("CTRL+ALT+SHIFT+3"));
        assert_eq!(to_xdg_trigger("CmdOrCtrl+Shift+Space").as_deref(), Some("CTRL+SHIFT+space"));
        assert_eq!(to_xdg_trigger("Alt+Shift+A").as_deref(), Some("ALT+SHIFT+a"));
    }

    #[test]
    fn modifier_order_and_aliases_normalise() {
        assert_eq!(to_xdg_trigger("Shift+Control+F12").as_deref(), Some("CTRL+SHIFT+F12"));
        assert_eq!(to_xdg_trigger("Super+PrintScreen").as_deref(), Some("LOGO+Print"));
        assert_eq!(to_xdg_trigger("F13").as_deref(), Some("F13"));
    }

    #[test]
    fn unconvertible_accelerators_are_none() {
        assert_eq!(to_xdg_trigger(""), None);
        assert_eq!(to_xdg_trigger("Ctrl+Shift"), None);
        assert_eq!(to_xdg_trigger("Ctrl+A+B"), None);
        assert_eq!(to_xdg_trigger("Ctrl+F99"), None);
    }

    #[test]
    fn only_wayland_capable_actions_get_ids() {
        assert!(shortcut_id(HotkeyAction::CaptureArea).is_some());
        assert!(shortcut_id(HotkeyAction::CommandRingV2).is_none());
        assert!(shortcut_id(HotkeyAction::CaptureSystemArea).is_none());
    }
}
