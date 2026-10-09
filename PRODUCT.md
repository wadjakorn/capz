# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Primary: Thai-speaking people on macOS and Windows who capture the screen and explain something with it every day: support staff, QA testers, people writing docs or tutorials, people posting on social media. Secondary: international users who want a free CleanShot/Shottr-class tool on both macOS and Windows.

## Product Purpose
capz is a native screen capture and annotation app (Tauri) for macOS and Windows. It captures the screen, lets you mark up the capture, makes it presentable, and gets it out to a file or the clipboard fast. This surface is the public landing page (capz-web.pages.dev). Success means a visitor understands what the app does in seconds, sees the real features, and installs it (Homebrew on Mac, an .exe on Windows) or tries the browser editor at /paste.

## Positioning
A free, MIT-licensed capture app that runs on both macOS and Windows and is Thai-first:
- the UI is in Thai by default, with English selectable
- the text tool lays out Thai vowels and tone marks above and below the line without collisions
- on-device OCR reads Thai on macOS

The same editor also runs in the browser at /paste with no install. CleanShot X and Shottr are Mac-only and offer none of the Thai features.

## Capabilities and Constraints
- **Capture:** full screen, area (one overlay per display, remembers the last region), window (transparent rounded corners on macOS), scrolling capture (Beta), macOS system area capture, and command ring v2, which is Alt+Tab-style hold/cycle/release.
- **Default hotkeys:** ⌘/Ctrl+Alt+Shift+3/4/5/0 for full screen, area, window and show editor. ⌘/Ctrl+Shift+Space opens the command ring.
- **Editor tools:** arrows (curved), shapes, text (Thai-aware), pen, highlighter, magnify, blur, pins (numbers, A–Z, bubble), stickers, image layers, crop, rulers and snapping. A tool stays active after use if you choose.
- **Backdrops:** gradient and solid fills plus 18 procedural styles (6 minimal, 12 art/fashion, e.g. Risograph, Gingham, Bauhaus, Terrazzo, Op Art), with padding, shadow and rounded corners.
- **OCR:** on-device "Detect text" (macOS Vision / Windows OCR), selectable and copyable. Thai OCR works on macOS only.
- **Workspaces and history:** multiple workspaces with smooth switching, a capture history with a preview overlay, and an optional automatic archive.
- **Output:** Save, Copy, or Save & Copy, as PNG, JPEG or WebP, with a filename template.
- **Settings:** search and deep links; light/dark/system theme; auto-updater.
- **Privacy:** nothing is sent unless the user opts in. The anonymous install id is opt-in and off by default.
- **Builds:** ad-hoc/unsigned, so the macOS Gatekeeper steps and the Windows SmartScreen/Smart App Control guidance must stay on the page. macOS ships one .dmg per chip (Apple Silicon `aarch64`, Intel `x64`) on each GitHub release, and the Homebrew cask picks the right one. Every macOS install, by .dmg or brew, needs the xattr step on first launch. Windows 10/11 x64. Linux is planned and shown as "coming soon".
- **Web build:** the /paste editor runs in the browser, including on phones with touch.
- **Editor keys (v0.16–v0.17):** ⌘/Ctrl+D duplicates the selection, arrow keys nudge it 1px (Shift = 10px), undo/redo hints match the platform and Ctrl+Y redoes on Windows. Editor shortcuts work with the Thai (Kedmanee) keyboard layout active.
- **Updates keep work (v0.17):** capz saves workspaces before installing an update and warns when something can't survive the relaunch.
- **Release status:** everything above has shipped (latest v0.17.1). Merged but not yet in a desktop release: copy/paste a selected element within and across workspaces (#113, already live in /paste), and the optional "⌘C copies and closes the editor" setting (#117, from 0.18.0). The landing page doesn't advertise those two until they ship.
- **Page stack:** Next.js 15 static export, Tailwind 4. No localStorage. TH/EN toggle, Thai by default.

## Brand Commitments
The name is "capz", always lowercase. The existing app icon is public/icon.png. Noto Sans Thai is the product's Thai face.

## Evidence on Hand
- the app icon
- the procedural backdrop renderer (src/lib/backdropPatterns.ts), which renders the exact pixels the app exports
- real screenshots and screen recordings, still to come from the owner (see shot list)

There are no testimonials, user counts, star counts or press yet, and the page must not invent them.

## Product Principles
1. Thai is a first-class language, not a translation.
2. Show the real thing: real features, real pixels, nothing claimed that the app doesn't do.
3. Free and honest: no ads, no account, nothing sent without opt-in, and install friction stated plainly.
4. Fast from capture to explanation.
