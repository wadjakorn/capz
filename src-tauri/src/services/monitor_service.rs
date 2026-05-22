use anyhow::{anyhow, Result};
use serde::Serialize;
use xcap::Monitor;

#[derive(Debug, Clone, Serialize)]
pub struct MonitorInfo {
    pub id: u32,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f32,
    pub is_primary: bool,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, Serialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub fn list_monitors() -> Result<Vec<MonitorInfo>> {
    let mons = Monitor::all().map_err(|e| anyhow!("Monitor::all failed: {e}"))?;
    let mut out = Vec::with_capacity(mons.len());
    for m in mons {
        out.push(MonitorInfo {
            id: m.id().map_err(|e| anyhow!("id: {e}"))?,
            name: m.name().map_err(|e| anyhow!("name: {e}"))?,
            x: m.x().map_err(|e| anyhow!("x: {e}"))?,
            y: m.y().map_err(|e| anyhow!("y: {e}"))?,
            width: m.width().map_err(|e| anyhow!("width: {e}"))?,
            height: m.height().map_err(|e| anyhow!("height: {e}"))?,
            scale_factor: m.scale_factor().map_err(|e| anyhow!("scale: {e}"))?,
            is_primary: m.is_primary().map_err(|e| anyhow!("primary: {e}"))?,
        });
    }
    Ok(out)
}

pub fn monitor_by_id(id: u32) -> Result<Monitor> {
    let mons = Monitor::all().map_err(|e| anyhow!("Monitor::all failed: {e}"))?;
    for m in mons {
        if m.id().map_err(|e| anyhow!("id: {e}"))? == id {
            return Ok(m);
        }
    }
    Err(anyhow!("monitor id {id} not found"))
}

pub fn primary_monitor() -> Result<Monitor> {
    let mons = Monitor::all().map_err(|e| anyhow!("Monitor::all failed: {e}"))?;
    for m in &mons {
        if m.is_primary().map_err(|e| anyhow!("primary: {e}"))? {
            return Ok(m.clone());
        }
    }
    mons.into_iter()
        .next()
        .ok_or_else(|| anyhow!("no monitors"))
}

#[allow(dead_code)]
pub fn virtual_desktop_bounds() -> Result<Rect> {
    let mons = list_monitors()?;
    if mons.is_empty() {
        return Err(anyhow!("no monitors"));
    }
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;
    for m in &mons {
        min_x = min_x.min(m.x);
        min_y = min_y.min(m.y);
        max_x = max_x.max(m.x + m.width as i32);
        max_y = max_y.max(m.y + m.height as i32);
    }
    Ok(Rect {
        x: min_x,
        y: min_y,
        width: (max_x - min_x) as u32,
        height: (max_y - min_y) as u32,
    })
}
