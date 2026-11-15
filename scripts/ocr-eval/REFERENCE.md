# OpenThai2.0-OCR-Text reference runtime — what it actually does

Read from `runtime/line_engine.py` at revision `40e8e9ff752b65153b1a71d521ec9390882afd7e`
(sha256 `5d5d6726…e5495c`), 2026-11-15. This is the spec the Rust prototype
(`rust-proto/`) ports. Line numbers refer to that file.

## Safety review (Global Constraints)

`grep -nE "socket|urllib|requests|http|subprocess|os\.system|eval\(|exec\(|open\(|write|unlink|remove|environ|pickle|torch\.load"`
over `runtime/*.py` finds only `os.environ.get("OV_CPU_PINNING")` / `OV_RUNTIME_CACHE`
(OpenVINO tuning, read-only) and the word "writes" in a docstring. No network,
no subprocess, no file writes, no dynamic code. Files read: the model directory
(`det.onnx`, `rec.onnx`, `rec_dict.txt`, `config.json`, `det.yml`) and the input image.
We still run it in a subprocess with `python -I`.

## Effective configuration

`DEFAULTS` (l.40) ← `det.yml` PostProcess (`thresh`, `box_thresh`, `unclip_ratio`) ← `config.json` ← caller overrides.

| key | DEFAULTS | after det.yml + config.json (= our B0) |
|---|---|---|
| det.limit | 1280 | 1280 |
| det.thresh | 0.3 | **0.2** |
| det.box_thresh | 0.6 | **0.4** |
| det.unclip | 1.5 | **1.4** |
| det.min_size | 3 | 3 |
| det.max_candidates | 3000 | 3000 |
| det.v_pad | 0.0 | 0.0 |
| det.split_gap | 1.2 | 1.2 |
| rec.height | 48 | 48 |
| rec.max_w | 3200 | 3200 |
| rec.batch | 16 | 16 |
| rec.drop_below | 0.0 | **0.8** |
| rec.min_chars | 1 | **2** |
| rec.junk_below / junk_invalid | 0.0 / 1.0 | **0.9 / 0.05** |
| rec.color | flatten | flatten |
| ori.enabled | true | true (sample 8, flip_below 0.8, flip_margin 0.15, deskew_above 2.5) |
| runtime.backend | openvino (bf16) | we force **onnxruntime** (fp32) |

Note `min_chars 2` and `drop_below 0.8`: single-character cells ("3", "·") and
low-confidence lines are dropped by design (stamps/seals on court scans). On UI
screenshots that can delete real text, so `rec.min_chars` joins the sweep knobs
(see ledger ruling).

## Pipeline of `read()` (l.779)

1. **Load** as BGR uint8 (cv2.imread / PIL→BGR).
2. **detect(img)** (l.660)
   - pad = `max(8, int(0.05·min(H,W)))` white border (`BORDER_CONSTANT 255`).
   - scale `s = min(limit / max(h,w), 4.0)` (limit 0 → 1.0); `rh, rw = max(32, round(h·s/32)·32)` (same for w) — resize to multiples of 32 in **both** directions, non-uniform.
   - `x = resize(img,(rw,rh))/255`, `(x − mean)/std` with mean `[0.485,0.456,0.406]`, std `[0.229,0.224,0.225]` **applied to BGR channels in that order** (no RGB swap), CHW, batch 1.
   - `prob = det(x)[0,0]`; `bitmap = prob > thresh`; `cv2.findContours(RETR_LIST, CHAIN_APPROX_SIMPLE)`; first `max_candidates` contours.
   - per contour: `_mini_box` = `cv2.minAreaRect` → 4 points ordered TL,TR,BR,BL (`order_points`: sort by x, two left sorted by y, two right sorted by y), side = min(rect w,h). Skip if `side < min_size` or `_box_score < box_thresh` (mean prob inside the filled quad).
   - `_unclip`: pyclipper offset (JT_ROUND, closed polygon) by `area·unclip/perimeter`; then `_mini_box` again, skip if `side < min_size + 2`. For a rectangle this equals growing every side by `d = area·ratio/perimeter` (the round corners lie inside the grown rectangle, whose min-area rect is that rectangle).
   - map back: `x·(w/prob_w) − pad`, `y·(h/prob_h) − pad`, clip to image; optional `v_pad`; keep boxes ≥ 2 px both ways.
3. Tiny line-shaped image with no boxes (h ≤ 200, w ≥ 1.5h) → whole image is one box.
4. **Orientation** (`ori.enabled`): `_sideways` (most boxes vertical → rotate 90° by confidence vote), `page_skew` ≥ 2.5° → deskew + re-detect; later `_upside_down` for pages whose median line confidence < 0.8. Screenshots are upright: **not ported**, gated by A1.
5. **_page** (l.856): `split_one` cuts each line at blank stretches ≥ `split_gap`×height (keeps the split only if all pieces survive the filter and keep ≥ 90 % of the characters); `reading_order` (columns/rows); **not ported** (A1). Our metric is order-free across components.
6. **_read_boxes** (l.892): `crop_line(img, box, turn=0)` = perspective warp of the quad to `w×h` (`w = max(|p0p1|,|p3p2|)`, `h = max(|p0p3|,|p1p2|)`, INTER_CUBIC, BORDER_REPLICATE). Boxes with h ≥ 1.5w are also read rotated ±90° and the most confident reading kept (not ported: vertical text is rare in screenshots).
7. **recognize_detail** (l.723), color = flatten:
   - resize crop to height 48, width `ceil(48·w/h)` (cv2 default INTER_LINEAR), **then** `prep_crop`: gray (`cv2.COLOR_BGR2GRAY`), `_flatten`, back to 3-channel.
   - `_flatten(g)` (l.235): `k = max(2, h//6)`; `bg` = per-column median of the top k and bottom k rows; median-blur `bg` along x with window `max(3, min(h|1, 255))` (done on a 3-row image, middle row kept); `d = |g − bg|`; `hi = max(98th percentile of d (histogram), 24)`; out = `255 − clip(d·255/hi, 0, 255)`.
   - batches of 16 sorted by aspect ratio; `W = min(max_w, max(16, ceil(48·max_ratio)))`; each crop resized to `(min(W, ceil(48·ratio)), 48)` (again INTER_LINEAR), `/255`, `(x−0.5)/0.5`, CHW, zero-padded on the right (0 = mid-grey).
   - `probs = rec(batch)` → `[N, T, 530]` softmax.
8. **_ctc_detail** (l.756): greedy argmax; collapse runs; drop id 0 (blank); char = `chars[id]` where `chars = [""] + rec_dict lines + [" "]`; char span = `(t·stride/width, end·stride/width)` clamped to 1, stride = `W / T`; confidence = mean of the run-start probabilities.
9. **Filter** per line: `text = fix_scripts(canonical(text))`; drop if fragment of a neighbour (`_fragments`), empty, `conf < drop_below`, fewer than `min_chars` non-space chars, or `conf < junk_below and invalid_share(text) > junk_invalid`.
10. **Words** (`_words`, l.323): split the CTC chars at spaces; word x-extent pushed out by half a median advance, kept 0.2 advance clear of the space centre; first word starts one advance early. Gives the per-word boxes capz's `OcrLine.words` needs.
11. **Text clean-up**: `canonical` (thai_norm.py: NFC, PUA map, mark order, sara-am compose, collapse) and `fix_scripts` (`_LONE_W`: a lone W/w before a Thai letter → พ; `_ZERO_IN_THAI`: O/o/0 next to Thai digits → ๐).

## rec_dict.txt coverage

529 lines (528 characters + trailing empty line) → 530 classes with blank and space.
Covers: Latin A–Z a–z (52), digits 0–9, Thai digits ๐–๙, every Thai consonant/vowel/tone
mark incl. ฤ ฦ ฯ ๆ ฿, ASCII punctuation including `@ / : . - _ # % & + = ? !`, quotes,
brackets, `©®™°±×÷`, arrows `← → ↑ ↓ ⇒`, currency `€ £ ¥ ฿ ₹`, Greek, Roman numerals,
circled digits, typographic dashes/quotes, `…`, `•`, `✓ ✗`.
**Not covered** (cannot be read whatever the image): `⌘ ⇧ ⌥` (macOS key symbols), `▾`,
emoji. The corpus uses `⌘` and `⇧` in menu shortcuts and `▾` in select boxes; the report
counts those characters separately (`score.py` reports them under class `symbol`).
