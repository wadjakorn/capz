# Landing shot list

Every picture and clip on the landing page (`/`) is listed in
`src/components/site/shots.ts`. Until a shot exists, the page draws a designed
placeholder showing the slot id and one line saying what the shot will show.

**To add a still:** drop `public/landing/<id>.webp` in place and set `ready: true` on its slot.

**To add a clip:** for a video slot, drop `public/landing/<id>.mp4` in place and set `ready: true`.

**To swap a hero clip:** replace its file, or edit its line in `HERO_CLIPS`.

## Capture setup

- **Light theme.** The landing is bright, so every shot uses the app's light theme. The web editor's default config is dark, so Playwright captures force `light` with an init script that pins `<html>`'s `dark`/`light` classes. The desktop app has a real light theme in Settings.
- **Web-capturable first.** Everything the `/paste` web editor can show (annotation tools, backdrops, Thai text, workspaces, phone layout) is captured there with Playwright at 2–3× DPR. Only desktop-only features need the Mac.
- macOS on a Retina screen, with the app UI in Thai.
- Clean wallpaper. No real names, emails or tokens on screen.
- Use a Thai web page as the subject.
- **Stills:** PNG at 2×, converted to WebP.
- **Clips:** 16:10, 5–8 s, H.264, with a keyframe every ~6 frames so scroll-scrubbing stays smooth.

## Hero clips (`HERO_CLIPS`)

| id | What it shows | Notes |
|---|---|---|
| `import` | Pasting a screenshot into the editor | `camera`: whole frame |
| `annotate` | An arrow, pins 1-2-3, a blurred email, the magnifier, a Thai text label | On phones the camera zooms to the action. Keyframes use normalised x/y (0–1). |
| `backdrop` | Turning on the backdrop, then switching art styles | `camera`: whole frame |
| `copy` | ⌘C → the "คัดลอกแล้ว" toast, clear, ⌘V lands the next image (a keycast badge shows the keys) | On phones the camera zooms to the toast, then backs out |

The clips are recorded in the `/paste` web editor (light theme): annotate first, then turn on the backdrop.

**Automation note:** map image coordinates to the screen with the `.bg-image` node's `getAbsoluteTransform().point()`. Don't use `getClientRect()`: with a backdrop on it includes the image's drop shadow, which shifts every point by up to ~15px and makes magnify/blur look misplaced. That isn't an app bug.

## Stills and loops (`SLOTS`)

Status: ✅ = captured from `/paste` (light) and `ready: true`; 🖥 = needs the desktop app.

| Priority | id | What to capture |
|---|---|---|
| ★★★ ✅ | `hero-editor` | The editor marking up a Thai page: an arrow, pins 1-2-3, a Thai label, a blurred email, the magnifier, a Risograph backdrop |
| ★★★ 🖥 | `ring-v2` (loop) | Hold ⌘⇧Space, tap to cycle, release, and the area overlay appears |
| ★★★ 🖥 | `scroll-capture` (loop) | The scroll HUD stitching a long Thai page, ending on the tall result |
| ★★ 🖥 | `full-screen` | A full-screen capture just opened in the editor |
| ★★ 🖥 | `area-overlay` | The area overlay on a busy desktop, with the template rect and the action pill |
| ★★ 🖥 | `window-corners` | A macOS window capture on a backdrop, with transparent corners |
| ★★ ✅ | `thai-text` | The text tool with a mark-heavy Thai line ("ผู้ใหญ่ปั้นดินน้ำมัน สระไม่ลอย", 48px), plus the line-spacing panel |
| ★★ ✅ | `combine` | A chat screenshot pasted onto a docs page as a layer, joined by an arrow and pins 1-2 |
| ★★ 🖥 | `ocr` | Detect text on Thai content: a line selected and the "copied" toast showing |
| ★★ ✅ | `workspaces` (loop) | Switching workspaces (captured on the web; History preview is desktop-only and has its own slot) |
| ★ 🖥 | `settings-th` | Settings in Thai, with a search query typed |
| ★ 🖥 | `history-preview` | The History preview with Reveal, Copy, Trash and Add to workspace |
| ★ ✅ | `tool-arrow`, `tool-pins`, `tool-magnify`, `tool-blur` | One 1:1 close-up per tool |
| ★ ✅ | `paste-mobile` | `/paste` on a phone (portrait) |
| — ✅ | `backdrop-base` | The annotated capture with no backdrop, 1600×1000. The backdrop playground draws it on every style. |
