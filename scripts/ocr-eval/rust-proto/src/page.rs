//! One image end to end (REFERENCE.md `read()` without orientation, deskew,
//! split_gap and column reading order — gate A1 measured those as no-ops on
//! screenshots): detect → crop → recognise (tall boxes also turned ±90°) →
//! drop mark fragments → clean text → filter → word boxes.

use crate::backend::Net;
use crate::det::{detect, DetCfg};
use crate::geom::{dist, Quad};
use crate::imgops::{crop_quad, rot90, Img};
use crate::rec::{recognize, RecCfg};
use crate::text::{canonical, fix_scripts, invalid_share, CtcChar};
use anyhow::Result;
use serde::Serialize;
use unicode_normalization::char::is_combining_mark;

#[derive(Clone, Debug)]
pub struct FilterCfg {
    pub drop_below: f32,
    pub min_chars: usize,
    pub junk_below: f32,
    pub junk_invalid: f64,
}

impl Default for FilterCfg {
    fn default() -> Self {
        FilterCfg { drop_below: 0.8, min_chars: 2, junk_below: 0.9, junk_invalid: 0.05 }
    }
}

#[derive(Serialize, Debug, Clone)]
pub struct Word {
    pub text: String,
    pub conf: f32,
    pub quad: Quad,
}

#[derive(Serialize, Debug, Clone)]
pub struct Line {
    pub text: String,
    pub conf: f32,
    #[serde(rename = "box")]
    pub bbox: [f64; 4],
    pub quad: Quad,
    pub words: Vec<Word>,
}

fn line_height(boxes: &[Quad]) -> f64 {
    let hs: Vec<f64> = boxes.iter().map(|b| dist(b[0], b[3]).max(1.0)).collect();
    let lines: Vec<f64> = boxes.iter().zip(&hs).filter(|(b, h)| dist(b[0], b[1]) >= 2.0 * **h).map(|(_, h)| *h).collect();
    let v = if lines.len() >= 3 { lines } else { hs };
    if v.is_empty() { 1.0 } else { median(v) }
}

fn median(mut v: Vec<f64>) -> f64 {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let n = v.len();
    if n % 2 == 1 { v[n / 2] } else { (v[n / 2 - 1] + v[n / 2]) / 2.0 }
}

/// _fragments: tiny boxes (≤ 3 chars, < 35 % of line height) touching a full line.
fn fragments(boxes: &[Quad], texts: &[String]) -> Vec<bool> {
    let mut out = vec![false; boxes.len()];
    if boxes.len() < 3 {
        return out;
    }
    let hs: Vec<f64> = boxes.iter().map(|b| dist(b[0], b[3])).collect();
    let hmed = line_height(boxes);
    let ext = |b: &Quad| {
        let xs = b.map(|p| p[0]);
        let ys = b.map(|p| p[1]);
        let mn = |v: [f64; 4]| v.iter().cloned().fold(f64::MAX, f64::min);
        let mx = |v: [f64; 4]| v.iter().cloned().fold(f64::MIN, f64::max);
        (mn(xs), mx(xs), mn(ys), mx(ys))
    };
    for (i, b) in boxes.iter().enumerate() {
        if hs[i] >= 0.35 * hmed || texts[i].replace(' ', "").chars().count() > 3 {
            continue;
        }
        let (x0, x1, y0, y1) = ext(b);
        for (j, c) in boxes.iter().enumerate() {
            if j == i || hs[j] < 0.6 * hmed {
                continue;
            }
            let (cx0, cx1, cy0, cy1) = ext(c);
            if cx0 <= x1 && x0 <= cx1 && (y0 - cy1).abs().min((cy0 - y1).abs()) <= 0.5 * hmed {
                out[i] = true;
                break;
            }
        }
    }
    out
}

fn spacing(c: &str) -> bool {
    c.chars().next().is_some_and(|ch| !is_combining_mark(ch))
}

/// _advance: median pitch between spacing characters inside words (share of line width).
fn advance(tokens: &[Vec<CtcChar>]) -> f64 {
    let mut steps = vec![];
    for tok in tokens {
        let xs: Vec<f64> = tok.iter().filter(|c| !c.0.is_empty() && spacing(&c.0)).map(|c| c.1).collect();
        steps.extend(xs.windows(2).filter(|w| w[1] > w[0]).map(|w| w[1] - w[0]));
    }
    if !steps.is_empty() {
        return median(steps);
    }
    let n: usize = tokens.iter().map(|t| t.len()).sum();
    match (tokens.first(), tokens.last()) {
        (Some(f), Some(l)) if !f.is_empty() && !l.is_empty() => (l[l.len() - 1].2 - f[0].1) / n.max(1) as f64,
        _ => 0.0,
    }
}

/// _words: split the CTC characters at spaces and cut each word's box from the line quad.
pub fn words(chars: Option<&[CtcChar]>, b: &Quad, text: &str, conf: f32) -> Vec<Word> {
    let whole = vec![Word { text: text.to_string(), conf, quad: *b }];
    let Some(chars) = chars.filter(|c| !c.is_empty()) else { return whole };
    let (mut tokens, mut cur, mut gaps): (Vec<Vec<CtcChar>>, Vec<CtcChar>, Vec<f64>) = (vec![], vec![], vec![]);
    for ch in chars {
        if ch.0.is_empty() || ch.0.chars().next().is_some_and(char::is_whitespace) {
            let mid = (ch.1 + ch.2) / 2.0;
            if !cur.is_empty() {
                tokens.push(std::mem::take(&mut cur));
                gaps.push(mid);
            } else if let Some(g) = gaps.last_mut() {
                *g = (*g + mid) / 2.0;
            }
        } else {
            cur.push(ch.clone());
        }
    }
    if !cur.is_empty() {
        tokens.push(cur);
    }
    let adv = advance(&tokens);
    let mut out = vec![];
    let lerp = |a: [f64; 2], c: [f64; 2], t: f64| [a[0] + t * (c[0] - a[0]), a[1] + t * (c[1] - a[1])];
    for (n, tok) in tokens.iter().enumerate() {
        let t = fix_scripts(&canonical(&tok.iter().map(|c| c.0.as_str()).collect::<String>()));
        if t.is_empty() {
            continue;
        }
        let (first, last) = (tok[0].1, tok[tok.len() - 1].2);
        let x0 = if n > 0 { first.min((gaps[n - 1] + 0.2 * adv).max(first - 0.5 * adv)) } else { (first - adv).max(0.0) };
        let x1 = if n < gaps.len() && n < tokens.len() - 1 {
            last.max((gaps[n] - 0.2 * adv).min(last + 0.5 * adv))
        } else {
            (last + 0.5 * adv).min(1.0)
        };
        let quad = [lerp(b[0], b[1], x0), lerp(b[0], b[1], x1), lerp(b[3], b[2], x1), lerp(b[3], b[2], x0)];
        let c = tok.iter().map(|c| c.3).sum::<f32>() / tok.len() as f32;
        out.push(Word { text: t, conf: c, quad });
    }
    if out.is_empty() { whole } else { out }
}

pub struct Engine {
    pub det: Box<dyn Net>,
    pub rec: Box<dyn Net>,
    pub chars: Vec<String>,
    pub det_cfg: DetCfg,
    pub rec_cfg: RecCfg,
    pub filter: FilterCfg,
}

impl Engine {
    pub fn read(&mut self, img: &Img) -> Result<Vec<Line>> {
        let mut boxes = detect(self.det.as_mut(), img, &self.det_cfg)?;
        let (h, w) = (img.h as f64, img.w as f64);
        if boxes.is_empty() && h <= 200.0 && w >= 1.5 * h {
            boxes.push([[0.0, 0.0], [w - 1.0, 0.0], [w - 1.0, h - 1.0], [0.0, h - 1.0]]);
        }
        let raw: Vec<Img> = boxes.iter().map(|b| crop_quad(img, b)).collect();
        let tall: Vec<usize> = (0..raw.len()).filter(|&n| raw[n].h as f64 >= 1.5 * raw[n].w as f64).collect();
        let mut all = raw.clone();
        for k in [1, -1] {
            all.extend(tall.iter().map(|&n| rot90(&raw[n], k)));
        }
        let res = recognize(self.rec.as_mut(), &all, &self.rec_cfg, &self.chars)?;
        let mut out: Vec<(String, f32, Option<Vec<CtcChar>>)> =
            res[..raw.len()].iter().map(|r| (r.0.clone(), r.1, Some(r.2.clone()))).collect();
        for (j, &n) in tall.iter().enumerate() {
            for alt in [&res[raw.len() + j], &res[raw.len() + tall.len() + j]] {
                if alt.1 > out[n].1 {
                    out[n] = (alt.0.clone(), alt.1, None);
                }
            }
        }
        let texts: Vec<String> = out.iter().map(|o| o.0.clone()).collect();
        let frag = fragments(&boxes, &texts);
        let f = &self.filter;
        let mut lines = vec![];
        for (i, (raw_text, conf, chars)) in out.iter().enumerate() {
            if frag[i] {
                continue;
            }
            let text = fix_scripts(&canonical(raw_text));
            let n_chars = text.replace(' ', "").chars().count();
            if text.is_empty() || *conf < f.drop_below || n_chars < f.min_chars
                || (*conf < f.junk_below && invalid_share(&text) > f.junk_invalid) {
                continue;
            }
            let b = boxes[i];
            let xs = b.map(|p| p[0]);
            let ys = b.map(|p| p[1]);
            let mn = |v: [f64; 4]| v.iter().cloned().fold(f64::MAX, f64::min);
            let mx = |v: [f64; 4]| v.iter().cloned().fold(f64::MIN, f64::max);
            lines.push(Line {
                words: words(chars.as_deref(), &b, &text, *conf),
                text,
                conf: *conf,
                bbox: [mn(xs), mn(ys), mx(xs) - mn(xs), mx(ys) - mn(ys)],
                quad: b,
            });
        }
        Ok(lines)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ch(s: &str, x0: f64, x1: f64) -> CtcChar {
        (s.to_string(), x0, x1, 0.9)
    }

    #[test]
    fn words_split_at_spaces_left_to_right() {
        let b: Quad = [[0.0, 0.0], [100.0, 0.0], [100.0, 10.0], [0.0, 10.0]];
        let cs = vec![ch("g", 0.10, 0.15), ch("o", 0.20, 0.25), ch(" ", 0.30, 0.35), ch("ไ", 0.40, 0.45), ch("ป", 0.50, 0.55)];
        let ws = words(Some(&cs), &b, "go ไป", 0.9);
        assert_eq!(ws.iter().map(|w| w.text.as_str()).collect::<Vec<_>>(), vec!["go", "ไป"]);
        assert!(ws[0].quad[1][0] < ws[1].quad[0][0], "{:?}", ws);
        assert!(ws[0].quad[0][0] >= 0.0 && ws[1].quad[1][0] <= 100.0);
    }

    #[test]
    fn words_without_positions_is_whole_line() {
        let b: Quad = [[0.0, 0.0], [10.0, 0.0], [10.0, 5.0], [0.0, 5.0]];
        let ws = words(None, &b, "abc", 0.5);
        assert_eq!(ws.len(), 1);
        assert_eq!(ws[0].text, "abc");
    }

    #[test]
    fn fragments_drop_small_mark_box_next_to_line() {
        let line = |y: f64| -> Quad { [[0.0, y], [200.0, y], [200.0, y + 20.0], [0.0, y + 20.0]] };
        let mark: Quad = [[10.0, 92.0], [16.0, 92.0], [16.0, 98.0], [10.0, 98.0]];
        let boxes = vec![line(0.0), line(40.0), line(100.0), mark];
        let texts: Vec<String> = ["hello world", "hello world", "hello world", "่"].iter().map(|s| s.to_string()).collect();
        assert_eq!(fragments(&boxes, &texts), vec![false, false, false, true]);
    }
}
