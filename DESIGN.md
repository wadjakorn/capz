---
name: capz landing
description: The public landing page at capz-web.pages.dev, a Thai type specimen sheet alternating with the app's own screen.
colors:
  sheet: "#ffffff"
  ink: "#0c0c10"
  ink-2: "#44464f"
  rule: "#c9ccd4"
  codeblock-bg: "#f6f7f9"
  pill: "#4d5cf0"
  annotation-red: "#ef4444"
  annotation-pin: "#E5342B"
  annotation-yellow: "#facc15"
  app-bg: "#0f0f12"
  app-surface: "#161619"
  app-raised: "#1f1f24"
  app-fg: "#ecedf0"
  app-fg-2: "#c4c5cc"
  app-fg-3: "#9a9aa3"
  app-fg-4: "#5c5c66"
  app-accent: "#6d7cff"
  app-accent-hover: "#7d8aff"
  app-pill: "#4d5cf0"
  app-track: "#34343c"
  app-bg-light: "#f6f6f8"
  app-surface-light: "#ffffff"
  app-raised-light: "#f0f0f3"
  app-fg-light: "#18181b"
  app-fg-2-light: "#3f3f46"
  app-fg-3-light: "#6b6b74"
  app-accent-light: "#5b6bff"
  app-pill-light: "#4555e6"
  footer-fg: "#e4e4e8"
typography:
  display-chapter:
    fontFamily: "Chonburi, Noto Serif Thai, serif"
    fontSize: "clamp(48px, 7.4vw, 128px)"
    fontWeight: 400
    lineHeight: 1.22
  display-paper:
    fontFamily: "Chonburi, Noto Serif Thai, serif"
    fontSize: "clamp(40px, 5.2vw, 88px)"
    fontWeight: 400
    lineHeight: 1.22
  headline:
    fontFamily: "Chonburi, Noto Serif Thai, serif"
    fontSize: "clamp(38px, 4.4vw, 66px)"
    fontWeight: 400
    lineHeight: 1.42
  title:
    fontFamily: "Chonburi, Noto Serif Thai, serif"
    fontSize: "clamp(26px, 2.6vw, 38px)"
    fontWeight: 400
    lineHeight: 1.45
  title-sm:
    fontFamily: "Chonburi, Noto Serif Thai, serif"
    fontSize: "clamp(22px, 2.2vw, 32px)"
    fontWeight: 400
    lineHeight: 1.45
  lede:
    fontFamily: "Noto Sans Thai, system-ui, sans-serif"
    fontSize: "clamp(17px, 1.4vw, 20px)"
    fontWeight: 400
    lineHeight: 1.75
  body:
    fontFamily: "Noto Sans Thai, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "Noto Sans Thai, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1
  measure:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.02em"
rounded:
  hairline: "4px"
  control: "8px"
  button: "10px"
  frame: "12px"
  install-card: "14px"
  pill: "999px"
spacing:
  gutter: "clamp(16px, 4vw, 56px)"
  section-top: "clamp(56px, 9vw, 128px)"
  section-head-bottom: "clamp(20px, 3vw, 36px)"
  section-bottom: "clamp(56px, 9vw, 112px)"
  block: "clamp(32px, 5vw, 56px)"
  touch: "44px"
  container-max: "1520px"
components:
  button-primary:
    backgroundColor: "{colors.app-accent}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "16px 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.app-accent-hover}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "16px 20px"
  button-copy:
    backgroundColor: "{colors.ink}"
    textColor: "#ffffff"
    rounded: "0"
    width: "104px"
  button-copy-done:
    backgroundColor: "{colors.pill}"
  chip-clip:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  chip-clip-active:
    backgroundColor: "{colors.pill}"
    textColor: "#ffffff"
  keycap:
    backgroundColor: "{colors.app-raised}"
    textColor: "{colors.app-fg}"
    rounded: "9px"
    height: "2em"
  editor-frame:
    backgroundColor: "{colors.app-bg}"
    textColor: "{colors.app-fg}"
    rounded: "{rounded.frame}"
  editor-tool-active:
    backgroundColor: "{colors.app-pill}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    size: "32px"
  codeblock:
    backgroundColor: "{colors.codeblock-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "4px 4px 4px 16px"
---

# Design System: capz landing

> **Scope.** This file governs the public landing page only (`src/app/page.tsx`, `src/components/site/*`, and the `.site-landing { … }` block in `src/app/globals.css`). It does **not** govern the desktop app's editor UI, settings, onboarding, or `/paste`: those keep their own **Graphite** tokens (`--bg`, `--surface`, `--fg`, `--accent`, `--elev-*`, `--text-*`) declared on `:root, .dark` in the same `globals.css`. Landing rules never touch `<html>` or `:root`; everything is scoped under `.site-landing`. The landing's `--app-*` tokens are a *replica* of the app's screen for illustration, not the app's source of truth.

## Overview

**Creative North Star: "The Proof Sheet and the Screen"**

The page is a printer's Thai type specimen that keeps cutting to the app itself. Paper chapters are white sheets set in black ink with hairline rules and 1.5px ink borders, the way a foundry proof is set. Screen chapters drop into the app's own dark editor surface, rendered with replica chrome and the app's real default values. The two materials alternate down the page (hero paper → Capture, Backdrops on screen → Thai on paper → Annotate on screen → OCR on paper → Workspaces on screen → Web, Install on paper → ink footer), so the reader is always either *reading Thai set well* or *looking at the tool that does it*.

The signature is the hero specimen: a Thai line measured live from the display face at its five vertical levels (tone, upper vowel, x-line, baseline, lower vowel), then marked up with capz's own default annotations: red arrow, red numbered pins, yellow dashed magnifier, and black text on white boxes. Annotation is not decoration here; it is the product demonstrating itself on the page's own type.

Density is generous and editorial: huge Chonburi display heads, 17px body at 1.75 leading, and clamp-driven section rhythm. Indigo is the single action colour. There are no gradients-as-brand, no glass, and no bento grid.

**Key Characteristics:**
- Two materials, strictly alternated: specimen paper (`.paper`) and app screen (`.screen`).
- App-screen colours come only from `--app-*` tokens, switched by `data-app-theme="dark|light"` on the landing root (it currently ships `dark`).
- Annotation colours are the app's defaults from `src/lib/config.ts`, never re-tinted.
- One action colour: indigo. Large CTAs use `app-accent`; small white-text pills use the darker `pill`.
- Display type never breaks inside a Thai word (ThaiText units).
- Every interactive target is at least 44px under 1024px.

## Colors

A monochrome paper-and-ink world plus a dark replica of the app's screen, with one indigo action colour and three annotation colours borrowed verbatim from the app.

### Primary
- **Capture Indigo** (`app-accent`): the primary CTA fill ("Try in the browser", the Windows download) and the app-screen accent: slider fills and thumbs, selected backdrop swatch ring, version dot. Hover lightens to `app-accent-hover` on dark and darkens on light.
- **Pill Indigo** (`pill` / `app-pill`): the same hue, darkened so white text passes contrast (5.1:1 on dark; `app-pill-light` gives 5.7:1). Used for every *small* active state with white text: the active editor tool, active sidebar rows and segments, active backdrop tab and action, active ring segment, active clip chip, the play button, the "copied" state, and the focus outline on paper.

### Secondary (annotation grammar)
- **Arrow Red** (`annotation-red`): the app's arrow/pen default. Specimen arrows (4-unit stroke, filled triangular head 4× the stroke), the caret colour, and the nav's hover/current underline.
- **Pin Red** (`annotation-pin`): numbered pins: a filled circle, a 2px white ring, and a bold white numeral. Also the small pin icon in the annotate tool rail.
- **Highlighter Yellow** (`annotation-yellow`): magnifier border (2px dashed source with a 15% fill and a 3px solid lens), the mini-map viewport, and, at 50% alpha, the text highlighter: the hero's `.hl` mark (14px round caps), text selection, and the active install tab.

### Neutral
- **Specimen White** (`sheet`): paper chapter background, the sticky nav, and clip chips.
- **Proof Ink** (`ink`): paper text, 1.5px structural borders, the copy button, the language toggle track, the phone bezel, and the footer background.
- **Second Ink** (`ink-2`): ledes, secondary paper text, and specimen level labels.
- **Hairline Rule** (`rule`): dashed specimen level lines, fact dividers, step dividers, and the mobile nav pill borders.
- **Code Paper** (`codeblock-bg`): install code blocks.
- **App screen ramp** (`app-bg` → `app-surface` → `app-raised`, text `app-fg` → `app-fg-4`, and `app-track` for slider tracks): the dark replica of the app's Graphite surfaces. Borders are `rgba(255,255,255,.08)` (`--app-border`) and `.14` (`--app-border-2`). The `*-light` entries are the `data-app-theme="light"` overrides.

### Named Rules
**The Borrowed Colour Rule.** Annotation colours are the app's defaults, copied by value with a comment pointing at `src/lib/config.ts`. If the app's defaults change, these change; never pick a "nicer" red.

**The Two Indigos Rule.** Fill large CTAs with `app-accent`. Anything small that carries white text uses `pill`/`app-pill`, because `#6d7cff` with white is only 3.5:1.

**The Theme Switch Rule.** App-screen surfaces read only `--app-*` variables. Never hard-code a Graphite hex inside a `.screen` chapter, so that flipping `data-app-theme` re-skins every replica at once.

## Typography

**Display Font:** Chonburi 400 (`next/font/google`, Thai and Latin subsets, exposed as `--font-display`), falling back to Noto Serif Thai, then serif.
**Body Font:** Noto Sans Thai, the variable local font that is the product's Thai face, falling back to system-ui.
**Label/Mono Font:** JetBrains Mono (`--font-mono`, aliased to `--measure` on the landing).

**Character:** Chonburi is a high-contrast Thai display face with looped terminals, used only at specimen scale; it is what makes the page read as a type specimen. Noto Sans Thai carries everything functional, and JetBrains Mono plays the role of the printer's measurements.

### Hierarchy
- **Display, chapter** (400, `clamp(48px, 7.4vw, 128px)`, 1.22): `h2` on screen chapters. On phones it becomes `clamp(40px, 13vw, 52px)`.
- **Display, paper** (400, `clamp(40px, 5.2vw, 88px)`, 1.22, balanced): `h2` on paper chapters. OCR and Web use `clamp(36px, 4.4vw, 72px)`, and phones use `clamp(34px, 10.5vw, 46px)`.
- **Headline** (400, `clamp(38px, 4.4vw, 66px)`, 1.42, balanced): the hero `h1` only, whose second phrase gets the yellow highlighter mark.
- **Title** (400, `clamp(26px, 2.6vw, 38px)`, 1.45): `h3` in lead rows, mode captions, the ring row and workspaces. The install OS head (`clamp(26px, 2.6vw, 36px)`) and fact terms and mode names (`clamp(22px, 2.2vw, 32px)`) are its smaller siblings, and install steps use `clamp(20px, 1.8vw, 26px)`.
- **Lede** (400, `clamp(17px, 1.35–1.4vw, 20px)`, 1.75, max 32–34em): the paragraph beside each chapter head, `ink-2` on paper and `app-fg-2` on screen. On phones the hero lede is 16px/1.7.
- **Body** (400, 17px, 1.75): base copy, max 30–36em. Fine print and captions are 16px/1.6.
- **Label** (600–700, 15–19px, line-height 1): buttons (16px, 19px on the primary), chips (15px), the language toggle (12px), and nav links (500, 15px).
- **Measure** (JetBrains Mono, 12.5px, +0.02em): slot ids, version line, the brew command (600, 15px), and specimen level labels. Keycaps are mono 600 at `clamp(17px, 1.8vw, 22px)`.

### Named Rules
**The Unbroken Word Rule.** Every Thai display string goes through `ThaiText`, which wraps each unit in a no-wrap span. Lines break only at spaces and at explicit U+200B markers placed in the locale strings, never inside a Thai word.

**The One Weight Display Rule.** Chonburi is set at 400 everywhere (all headings are reset to `font-weight: 400`). Hierarchy comes from size alone, never from fake bold.

**The Specimen Scale Rule.** Chonburi appears only at title size (≥20px) or larger, plus the wordmark. Never set body, labels, or UI text in it.

## Layout

- **Container:** `.wrap` is `max-width: 1520px` with `padding-inline: var(--gut)`, where the gutter is `clamp(16px, 4vw, 56px)`. Mobile scrollers bleed past the gutter with `margin: 0 calc(var(--gut) * -1)`, and a mask fades the edges.
- **Chapter head:** a two-column grid (`1.4fr / 1fr`, gap `20px 64px`, aligned to the end). The `h2` sits left and the lede right. Padding is `clamp(56px,9vw,128px)` on top and `clamp(20px,3vw,36px)` below, closed by a rule: 1px `app-border` on screen, 1.5px ink on paper.
- **Content rows:** asymmetric two-column grids (`1.5fr/1fr`, `.9fr/1.3fr`, `1.15fr/1.4fr`, `1.6fr/1fr`) with column gaps of `clamp(28px, 5vw, 72px)`. Section bottoms are `clamp(56px, 9vw, 112px)`.
- **Mosaic:** the Annotate shots sit on a 12-column grid with deliberately offset spans and staggered top margins (`clamp(0px, 8vw, 120px)`). It drops to 2 columns at 900px and 1 column at 600px.
- **Rhythm rule:** every vertical gap is a `clamp(min, vw, max)`. Fixed px appears only inside components.
- **Breakpoints (observed):** 1024px (touch targets go to 44px, the mode grid stacks, the specimen tablet tier), 900px (all two-column grids collapse, the install switches to tabs at 899px (macOS / Windows / Linux; on desktop, Linux "coming soon" is a full-width row under the two columns), the backdrop panel moves below), 820px (the nav wraps and its list becomes a scrolling pill row), 760px (the phone hero: headline, then lede, then CTA, then specimen, with the brew command, proof strip and version hidden; phones and Linux lead with /paste, desktop Macs with the chip-matched .dmg), 600px (the editor frame drops its sidebar and goes 4:3.3, capture modes become a pill scroller, the specimen phone tier).
- **Specimen tiers are rethought, not scaled:** the phone shows the single word "ผู้ใหญ่" (all four levels, no loupe), the tablet shows the full line filling the width, and the desktop shows the line with a level-label column and a magnifier column.

## Elevation & Depth

Paper is flat: depth there comes from 1.5px ink borders and hairline rules, never shadows. Depth belongs to the app replicas, which float on the sheet the way a real window would.

### Shadow Vocabulary
- **App frame** (`--app-elev`: `0 2px 6px rgba(0,0,0,.25), 0 30px 60px -30px rgba(0,0,0,.6)`, lighter in the light theme): editor frames and the backdrop playground.
- **Hero window** (`0 2px 6px rgba(12,12,16,.16), 0 40px 90px -30px rgba(12,12,16,.55)`): the rising demo window on paper.
- **Keycap** (`--app-key-shadow`: a 2px hard bottom edge plus a 1px inset highlight): `kbd` only. It is a physical key edge, which belongs to this world.
- **CTA glow** (`0 1px 2px rgba(15,15,18,.25), 0 12px 26px -12px rgba(109,124,255,.8)`): the primary button only.
- **Placeholder plate** (`0 12px 30px -12px rgba(0,0,0,.45)`): the image inside an editor canvas.

### Named Rules
**The Flat Paper Rule.** Nothing on a paper chapter casts a shadow except an app object placed on it (a window, a phone, a frame). Paper structure is drawn with ink lines.

## Shapes

- **Paper geometry is ruled:** 1.5px ink borders on the nav bottom, hero body top, chapter heads, the brew command box, the install card and its column divider, and the quiet button. Hairlines are 1px `rule`.
- **Radii:** 4px for the shot or placeholder inside a canvas and the focus ring; 6–8px for app controls (sidebar rows, segments, tool buttons, the language toggle); 9px for keycaps; 10px for buttons, the command box, code blocks and the tool rail; 12px for app frames (editor, hero window, backdrop grid, capture-mode rows); 14px for the install card; 999px for chips, mobile nav and mode pills, and the Beta tag; 36px for the phone frame, whose bezel is a 10px ink border.
- **The copy button is square (0 radius)**, fused into the command box's right edge like a stamped slug.
- On the phone hero the window loses its radius and side borders and runs edge to edge.

## Components

### Buttons
- **Primary:** indigo fill, white 700 label at 19px, 10px radius, minimum height 48px, CTA glow. On hover it lifts 2px (`transform .25s cubic-bezier(.16,1,.3,1)`) and shifts to `app-accent-hover`. There is exactly one primary per decision area.
- **Quiet:** transparent with a 1.5px ink border and ink text. Used for the secondary route.
- **Copy:** ink slab with a 0 radius, minimum width 104px, `#26262d` on hover, turning `pill` indigo while showing "copied" (1.6s).
- **Link:** 600, 16px, 12px block padding, underlined with a 0.22em offset and 1.5px thickness.
- **Focus (all):** a 2px `pill` outline with a 3px offset on paper, and `app-accent` on screen.

### Chips
- **Clip chips (hero):** a 44px pill on the sheet with a 1.5px ink border, a mono 600 12px index number, and a 15px label. A 3px `pill` progress bar fills along the bottom edge (`--fill`) as the clip plays. The active chip fills `pill` with white text and a white progress bar, and hovering an inactive chip gives `#eef0ff`.
- **Mobile nav and capture-mode pills:** 44px pills with a 1px border (`rule` on paper, `app-border-2` on screen). The current one fills ink (nav) or `app-pill` (modes). They sit in a horizontal snap scroller with masked edges.
- **Beta tag:** mono 600 12px, a currentColor 1px border, a pill shape, at 0.8 opacity.

### Keycaps
`kbd` uses the app-raised fill, `app-border-2` border, 9px radius, 2em square minimum, mono 600, and the key-shadow edge. A `.wide` variant switches to the body face for word keys. Hotkeys are always shown as rows of keycaps, never as inline text.

### Editor Frame (signature)
A faithful replica of the capz editor chrome around a shot or placeholder. It has a 44px toolbar in the app's real tool order (select, arrow, shapes, text, blur, pen, highlighter, magnify, sticker, pin, crop). Tools are 32px squares with 8px radius, the active tool in `app-pill`, and dim tools in `app-fg-4`. A 190px settings sidebar shows the active tool's panel with the app's real defaults (arrow #ef4444 at 4px, blur 16, magnify 2× with a yellow border, pin #E5342B numbered 1-2-3, text Sans 24px at 1.35×). The canvas is 16:9.4 with 6% padding. Under 600px the sidebar hides, optional tools (pen, sticker, monitor, undo/redo) drop out, and tools shrink to 24×26.

### Media Slot
Every shot is a `MediaSlot` keyed by an id in `shots.ts`, framed as `editor`, `phone` or `bare`. Until its `ready` flag flips, it renders a designed placeholder: the `app-img` gradient plate, the slot id in mono, and one line describing the shot, with a caption of the bold mono id plus "pending". Real media is `/landing/<id>.webp` or `.mp4` (muted, inline, looping), using `object-fit: cover` and a 4px radius.

### Backdrop Panel
A two-column replica (canvas stage plus a 290px panel) of the app's backdrop panel, driven by the real procedural renderer. The panel holds action rows (32px, 7px radius, `pill` when pressed), tabs (`pill` when selected), and a six-column swatch grid of canvases (6px radius, scale 1.05 on hover, a 1.5px accent ring plus a 1px halo when checked). Sliders have a 4px track filled to `--v` and a 16px accent thumb ringed in the surface colour. Under 900px the panel stacks below, text rises to 15–16px, and thumbs grow to 28px.

### Specimen Annotations
Drawn in SVG, scaled so pins stay about 16 CSS px on screen. The **arrow** is a quadratic curve with a round-capped 4-unit red stroke, a filled triangular head, and a white midpoint handle ringed in `#6d7cff`. The **pin** is a red circle with a 2-unit white ring and a 700 white numeral in Noto Sans Thai. The **magnifier** links a dashed yellow source ring (15% fill) to a 3-unit yellow lens at 2× zoom showing the clipped glyphs and level lines. The **text label** is 500 black text on a white box (radius 2, 14-unit padding, `drop-shadow(0 1px 1px rgba(0,0,0,.18))`). The level lines are dashed `rule` lines at 6 6, with a solid ink baseline and mono labels with pixel offsets on desktop.

### Navigation
A sticky specimen index on the sheet with a 1.5px ink bottom rule and a minimum height of 56px. It holds a Chonburi wordmark beside an icon tile with a 1.5px ink border, a numbered section list (hover and current underlined in 2px Arrow Red at a 0.3em offset), a TH/EN segmented toggle (ink track, with the active segment white on ink), and a 36px circular GitHub button (44px under 1024px). Under 820px the list wraps to a full-width pill scroller.

### Install Card
A 1.5px ink card with a 14px radius and two OS columns divided by an ink rule. Under 900px it becomes tabs (52px, with the selected tab on a 50% yellow highlighter fill). Steps are stacked and divided by `rule` lines. Code blocks are `codeblock-bg` with a 1px `rule` border, mono 500 at 14px, a right fade mask, and a 44px ghost copy button.

### Motion
- **Easing:** `cubic-bezier(.16, 1, .3, 1)` (an expo-out) for every landing transition and keyframe. The camera uses quadratic ease-in-out between keyframes.
- **Specimen draw-in:** arrow strokes draw by dash offset (800ms), and pins, heads and labels pop from scale 0.3 (520ms). Elements are staggered 150ms apart, starting at 120ms.
- **Hero scroll scene (`scrub` mode, wide screens with a fine pointer):** the section is pinned for `100vh + 90vh + 60vh × clips`. During the first 90vh, the specimen's level, glyph and annotation layers parallax at 6%, 14% and 26% of the stage height, pins grow 15%, the hero copy fades and lifts 90px, and the editor window rises from the bottom edge, scaling from 0.62 to 1. The remaining scroll is split across the clips by duration and scrubs `currentTime`.
- **`playlist` mode (phones, touch):** normal flow with autoplay through the clips. On frames under 760px the **guided camera** follows each clip's `{t, x, y, s}` keyframes (about 2× zoom, never a fixed crop), shows a 48px mini-map whose yellow rectangle marks the visible region, and opens the uncropped clip fullscreen on tap.
- **`poster` mode (reduced motion):** posters plus a 76px `pill` play button. Reduced motion also disables the plate swap, button and chip transitions, video cross-fades, and the specimen draw. `?mode=` forces any mode.
- **Small motion:** video cross-fade 220ms, capture-mode plate swap (`landing-plate`, 350ms, from 6px down and 0.3 opacity), and swatch hover scale.

## Do's and Don'ts

### Do:
- **Do** alternate `.paper` and `.screen` chapters, and put every new app depiction inside a `.screen` chapter or an app frame that reads `--app-*` tokens.
- **Do** copy annotation colours and sizes from the app defaults (arrow #ef4444 at width 4 with a filled head, pin #E5342B with a white numeral, magnify and highlighter #facc15, text on a white box).
- **Do** use `pill`/`app-pill` for any small active state that carries white text, and `app-accent` only for large CTAs, fills and thumbs.
- **Do** wrap every Thai display string in `ThaiText` and place U+200B break hints in the locale strings.
- **Do** size every vertical section gap with `clamp()` and hold touch targets at ≥44px under 1024px.
- **Do** show each unshot feature through `MediaSlot` with its labelled placeholder until a real capture exists.
- **Do** give every motion a reduced-motion path that keeps the content (posters, a static specimen).

### Don't:
- **Don't** apply these landing tokens to the desktop editor, settings, onboarding, or `/paste`. They use Graphite (`--bg`, `--surface`, `--accent`, `--elev-*`) and are out of scope here.
- **Don't** hard-code Graphite hex values inside screen chapters, which bypasses `data-app-theme`.
- **Don't** put shadows on paper elements; draw structure with 1.5px ink or 1px rule lines.
- **Don't** set Chonburi below title size or at any weight other than 400.
- **Don't** crop hero clips to a fixed portrait frame or shrink the whole frame on phones; follow the guided camera keyframes instead.
- **Don't** add a second action colour or re-tint the annotation colours for aesthetic reasons.
- **Don't** present a placeholder as a real shot, or invent stats, testimonials or counts (PRODUCT.md: show the real thing).
