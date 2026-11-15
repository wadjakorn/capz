//! Text clean-up ported from the reference runtime: `canonical` (thai_norm.py),
//! `fix_scripts`, `invalid_share` and CTC greedy decoding (line_engine.py).

use unicode_normalization::UnicodeNormalization;

/// One decoded character: (text, x0, x1, prob) with x0..x1 as a share of the crop width.
pub type CtcChar = (String, f64, f64, f32);

const VOWEL_MARKS: &str = "\u{0E31}\u{0E34}\u{0E35}\u{0E36}\u{0E37}\u{0E3A}\u{0E38}\u{0E39}\u{0E47}";
const TONE_MARKS: &str = "\u{0E48}\u{0E49}\u{0E4A}\u{0E4B}\u{0E4C}\u{0E4E}";
const NIKHAHIT: char = '\u{0E4D}';

fn pua(c: char) -> Option<char> {
    const MAP: [(u32, u32); 27] = [
        (0xF700, 0x0E10), (0xF701, 0x0E34), (0xF702, 0x0E35), (0xF703, 0x0E36), (0xF704, 0x0E37),
        (0xF705, 0x0E48), (0xF706, 0x0E49), (0xF707, 0x0E4A), (0xF708, 0x0E4B), (0xF709, 0x0E4C),
        (0xF70A, 0x0E48), (0xF70B, 0x0E49), (0xF70C, 0x0E4A), (0xF70D, 0x0E4B), (0xF70E, 0x0E4C),
        (0xF70F, 0x0E0D), (0xF710, 0x0E31), (0xF711, 0x0E4D), (0xF712, 0x0E47), (0xF713, 0x0E48),
        (0xF714, 0x0E49), (0xF715, 0x0E4A), (0xF716, 0x0E4B), (0xF717, 0x0E4C), (0xF718, 0x0E38),
        (0xF719, 0x0E39), (0xF71A, 0x0E3A),
    ];
    MAP.iter().find(|(k, _)| *k == c as u32).and_then(|(_, v)| char::from_u32(*v))
}

fn rank(c: char) -> Option<u8> {
    if VOWEL_MARKS.contains(c) {
        Some(0)
    } else if TONE_MARKS.contains(c) {
        Some(1)
    } else if c == NIKHAHIT {
        Some(2)
    } else {
        None
    }
}

fn is_tone(c: char) -> bool {
    ('\u{0E48}'..='\u{0E4B}').contains(&c)
}

/// thai_norm.canonical: one code-point spelling per rendering.
pub fn canonical(text: &str) -> String {
    let mapped: String = text
        .chars()
        .filter(|c| !matches!(c, '\u{200B}' | '\u{200C}' | '\u{200D}' | '\u{2060}' | '\u{00AD}' | '\u{FEFF}'))
        .map(|c| if c == '\u{00A0}' { ' ' } else { pua(c).unwrap_or(c) })
        .collect();
    let nfc: Vec<char> = mapped.nfc().collect();
    // runs of >= 2 marks: stable sort by rank, drop doubled marks
    let mut ordered: Vec<char> = Vec::with_capacity(nfc.len());
    let mut i = 0;
    while i < nfc.len() {
        if rank(nfc[i]).is_some() {
            let mut j = i;
            while j < nfc.len() && rank(nfc[j]).is_some() {
                j += 1;
            }
            if j - i >= 2 {
                let mut run: Vec<char> = nfc[i..j].to_vec();
                run.sort_by_key(|c| rank(*c).unwrap());
                for c in run {
                    if ordered.last() != Some(&c) {
                        ordered.push(c);
                    }
                }
            } else {
                ordered.push(nfc[i]);
            }
            i = j;
        } else {
            ordered.push(nfc[i]);
            i += 1;
        }
    }
    // SARA_AM: ([่-๋]?)ํ([่-๋]?)า -> \1\2ำ   (left to right, non-overlapping, like re.sub)
    let mut out: Vec<char> = Vec::with_capacity(ordered.len());
    let mut k = 0;
    while k < ordered.len() {
        let try_at = |s: usize| -> Option<(usize, Vec<char>)> {
            let mut p = s;
            let mut tones = vec![];
            if p < ordered.len() && is_tone(ordered[p]) {
                tones.push(ordered[p]);
                p += 1;
            }
            if p >= ordered.len() || ordered[p] != NIKHAHIT {
                return None;
            }
            p += 1;
            if p < ordered.len() && is_tone(ordered[p]) {
                tones.push(ordered[p]);
                p += 1;
            }
            if p < ordered.len() && ordered[p] == '\u{0E32}' {
                Some((p + 1, tones))
            } else {
                None
            }
        };
        if let Some((end, tones)) = try_at(k) {
            out.extend(tones);
            out.push('\u{0E33}');
            k = end;
        } else {
            out.push(ordered[k]);
            k += 1;
        }
    }
    let s: String = out.into_iter().collect();
    let s = s.replace("\u{0E40}\u{0E40}", "\u{0E41}").replace("\u{0E33}\u{0E33}", "\u{0E33}");
    let s = s.replace("\r\n", "\n").replace('\r', "\n");
    let lines: Vec<String> = s
        .split('\n')
        .map(|line| {
            let mut o = String::with_capacity(line.len());
            let mut in_space = false;
            for c in line.chars() {
                if matches!(c, ' ' | '\t' | '\x0C' | '\x0B') {
                    if !in_space {
                        o.push(' ');
                    }
                    in_space = true;
                } else {
                    o.push(c);
                    in_space = false;
                }
            }
            o.trim().to_string()
        })
        .collect();
    lines.join("\n").trim().to_string()
}

fn thai_digit(c: char) -> bool {
    ('\u{0E50}'..='\u{0E59}').contains(&c)
}

/// fix_scripts: a lone W/w glued to Thai becomes พ; O/o/0 touching Thai digits becomes ๐.
/// Look-arounds are evaluated on the original string, as Python's re.sub does.
pub fn fix_scripts(text: &str) -> String {
    let a: Vec<char> = text.chars().collect();
    let thai_letter = |c: char| ('\u{0E01}'..='\u{0E2E}').contains(&c) || ('\u{0E40}'..='\u{0E44}').contains(&c);
    let mut b: Vec<char> = a.clone();
    for i in 0..a.len() {
        if (a[i] == 'W' || a[i] == 'w') && !(i > 0 && a[i - 1].is_ascii_alphabetic()) {
            let next = if i + 1 < a.len() && a[i + 1] == '.' { a.get(i + 2) } else { a.get(i + 1) };
            if next.is_some_and(|c| thai_letter(*c)) {
                b[i] = 'พ';
            }
        }
    }
    let src = b.clone();
    let mut i = 0;
    while i < src.len() {
        if matches!(src[i], 'O' | 'o' | '0') {
            let behind = i > 0 && thai_digit(src[i - 1]);
            let ahead = i + 1 < src.len() && thai_digit(src[i + 1]);
            if behind || ahead {
                b[i] = '๐';
            }
        }
        i += 1;
    }
    b.into_iter().collect()
}

fn is_thai(c: char) -> bool {
    ('\u{0E00}'..='\u{0E7F}').contains(&c)
}

fn cons(c: char) -> bool {
    ('\u{0E01}'..='\u{0E2E}').contains(&c)
}

const MARKS_ALL: &str = "\u{0E31}\u{0E34}\u{0E35}\u{0E36}\u{0E37}\u{0E38}\u{0E39}\u{0E3A}\u{0E47}\u{0E48}\u{0E49}\u{0E4A}\u{0E4B}\u{0E4C}\u{0E4D}\u{0E4E}";
const LEADING: &str = "\u{0E40}\u{0E41}\u{0E42}\u{0E43}\u{0E44}";

/// Share of Thai characters that break Thai spelling (orphan marks, a leading vowel with no consonant).
pub fn invalid_share(text: &str) -> f64 {
    let a: Vec<char> = text.chars().collect();
    let (mut thai, mut bad) = (0usize, 0usize);
    for (i, &ch) in a.iter().enumerate() {
        if !is_thai(ch) {
            continue;
        }
        thai += 1;
        let prev = if i > 0 { a[i - 1] } else { ' ' };
        if MARKS_ALL.contains(ch) {
            let ok = cons(prev) || (MARKS_ALL.contains(prev) && i >= 2 && cons(a[i - 2]));
            if !ok {
                bad += 1;
            }
        } else if LEADING.contains(ch) && !(i + 1 < a.len() && cons(a[i + 1])) {
            bad += 1;
        }
    }
    if thai == 0 { 0.0 } else { bad as f64 / thai as f64 }
}

/// Greedy CTC over one line's probabilities `p` (T × C, row-major).
pub fn ctc_detail(p: &[f32], t: usize, c: usize, chars: &[String], stride: f64, width: f64)
    -> (String, f32, Vec<CtcChar>) {
    let mut ids = Vec::with_capacity(t);
    let mut conf = Vec::with_capacity(t);
    for k in 0..t {
        let row = &p[k * c..(k + 1) * c];
        let (mut bi, mut bv) = (0usize, f32::MIN);
        for (j, &v) in row.iter().enumerate() {
            if v > bv {
                bv = v;
                bi = j;
            }
        }
        ids.push(bi);
        conf.push(bv);
    }
    let mut out = Vec::new();
    let mut s = 0;
    while s < t {
        let mut e = s + 1;
        while e < t && ids[e] == ids[s] {
            e += 1;
        }
        if ids[s] != 0 {
            let ch = chars.get(ids[s]).cloned().unwrap_or_default();
            out.push((ch, (s as f64 * stride / width).min(1.0), (e as f64 * stride / width).min(1.0), conf[s]));
        }
        s = e;
    }
    let text: String = out.iter().map(|c| c.0.as_str()).collect();
    let mean = if out.is_empty() { 0.0 } else { out.iter().map(|c| c.3).sum::<f32>() / out.len() as f32 };
    (text, mean, out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chars() -> Vec<String> {
        ["", "a", "b", " "].iter().map(|s| s.to_string()).collect()
    }

    fn probs(ids: &[usize]) -> Vec<f32> {
        let mut p = vec![0.0f32; ids.len() * 4];
        for (t, &i) in ids.iter().enumerate() {
            p[t * 4 + i] = 0.9;
        }
        p
    }

    #[test]
    fn ctc_collapses_repeats_and_blanks() {
        // a a blank a b  ->  "aab"
        let p = probs(&[1, 1, 0, 1, 2]);
        let (text, conf, cs) = ctc_detail(&p, 5, 4, &chars(), 8.0, 40.0);
        assert_eq!(text, "aab");
        assert!((conf - 0.9).abs() < 1e-6);
        assert_eq!(cs.len(), 3);
        assert!((cs[0].1 - 0.0).abs() < 1e-9 && (cs[0].2 - 0.4).abs() < 1e-9); // frames 0..2 of 5, stride 8, width 40
    }

    #[test]
    fn canonical_sara_am() {
        assert_eq!(canonical("น\u{0E4D}\u{0E49}\u{0E32}"), "น้ำ");
        assert_eq!(canonical("น\u{0E49}\u{0E4D}\u{0E32}"), "น้ำ");
    }

    #[test]
    fn canonical_marks_spaces_and_pua() {
        assert_eq!(canonical("ก\u{0E49}\u{0E34}"), "ก\u{0E34}\u{0E49}");
        assert_eq!(canonical("  a \t b  \r\nc "), "a b\nc");
        assert_eq!(canonical("\u{F70A}"), "\u{0E48}");
        assert_eq!(canonical("เเม่"), "แม่");
        assert_eq!(canonical("A\u{200B}B\u{00A0}C"), "AB C");
    }

    #[test]
    fn fix_scripts_lone_w() {
        assert_eq!(fix_scripts("Wระ"), "พระ");
        assert_eq!(fix_scripts("W.ศ."), "พ.ศ.");
        assert_eq!(fix_scripts("Wow ไทย"), "Wow ไทย");
        assert_eq!(fix_scripts("AWระ"), "AWระ");
        assert_eq!(fix_scripts("๗o.๘๒"), "๗๐.๘๒");
        assert_eq!(fix_scripts("๑00"), "๑๐0");
    }

    #[test]
    fn invalid_share_counts_orphan_marks() {
        assert_eq!(invalid_share("ไทย"), 0.0);
        assert!((invalid_share("\u{0E34}ก") - 0.5).abs() < 1e-9);
        assert!((invalid_share("เ ") - 1.0).abs() < 1e-9);
    }
}
