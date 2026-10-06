# Landing shot list

Every picture and clip on the landing page (`/`) is listed in
`src/components/site/shots.ts`. Until a shot exists, the page draws a designed
placeholder showing the slot id and one line saying what the shot will show.

**To add a still:** drop `public/landing/<id>.webp` in place and set `ready: true` on its slot.

**To add a clip:** for a video slot, drop `public/landing/<id>.mp4` in place and set `ready: true`.

**To swap a hero clip:** replace its file, or edit its line in `HERO_CLIPS`.

## Capture setup

- macOS on a Retina screen, with the app UI in Thai.
- Clean wallpaper. No real names, emails or tokens on screen.
- Use a Thai web page as the subject.
- **Stills:** PNG at 2×, converted to WebP.
- **Clips:** 16:10, 5–8 s, H.264, with a keyframe every ~6 frames so scroll-scrubbing stays smooth.

## Hero clips (`HERO_CLIPS`)

| id | What it shows | Notes |
|---|---|---|
| `import` | Pasting a screenshot into the editor and turning on a backdrop | `camera`: whole frame |
| `annotate` | An arrow, pins 1-2-3, a blurred email, the magnifier | On phones the camera zooms to the action. Keyframes use normalised x/y (0–1). |
| `backdrop` | Switching backdrops | `camera`: whole frame |

The current clips are stand-ins recorded in the `/paste` web editor.

## Stills and loops (`SLOTS`)

| Priority | id | What to capture |
|---|---|---|
| ★★★ | `hero-editor` | The editor marking up a Thai page: a curved arrow, pins 1-2-3, a Thai label, a blurred email, a Risograph backdrop |
| ★★★ | `ring-v2` (loop) | Hold ⌘⇧Space, tap to cycle, release, and the area overlay appears |
| ★★★ | `scroll-capture` (loop) | The scroll HUD stitching a long Thai page, ending on the tall result |
| ★★ | `full-screen` | A full-screen capture just opened in the editor |
| ★★ | `area-overlay` | The area overlay on a busy desktop, with the template rect and the action pill |
| ★★ | `window-corners` | A macOS window capture on a backdrop, with transparent corners |
| ★★ | `thai-text` | The text tool with a mark-heavy Thai line, plus the line-spacing panel |
| ★★ | `ocr` | Detect text on Thai content: a line selected and the "copied" toast showing |
| ★★ | `workspaces` (loop) | Switching workspaces, then opening a History item |
| ★ | `settings-th` | Settings in Thai, with a search query typed |
| ★ | `history-preview` | The History preview with Reveal, Copy, Trash and Add to workspace |
| ★ | `tool-arrow`, `tool-pins`, `tool-magnify`, `tool-blur` | One 1:1 close-up per tool |
| ★ | `paste-mobile` | `/paste` on a phone (portrait) |
| — | `backdrop-base` | A plain window capture with no backdrop. Not wired yet: the backdrop playground still draws a sample capture and doesn't read this file. |
