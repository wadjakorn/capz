---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/components/site"]
---

## Scope and mode
Landing page (`/`, `src/components/site/*`). Visitor mode: **Persuade**.

## Audience, job, action
- **Who:** Thai-speaking Mac and Windows users first, international users second.
- **Job:** understand in seconds what the desktop app does.
- **Action:** desktop visitors copy the brew command or download the Windows installer; phone visitors open `/paste`.

## Proof and content
- Real `/paste` recordings in the hero (a `HERO_CLIPS` manifest in `shots.ts`, swappable, 1–5 clips).
- A real backdrop renderer drives the playground.
- Every other shot is a labelled placeholder until the owner captures it (see `docs/landing/SHOTS.md`).

## Chosen direction
- **Form:** a Thai type specimen alternating with the app's own screen (seed ce51cb18).
- **Memorable moment:** the measured Thai line, marked up with capz's real default annotations.

## Decisions approved by the user (2026-10-06)
- **Mobile hero video uses a guided camera.**
  - Each clip starts on the full 16:10 frame, zooms about 2× to the point of action with a mini-map, then returns to the full frame. Tapping opens the uncropped clip fullscreen.
  - There is never a fixed crop. The user rejected portrait crops.
  - Shrinking the whole frame to 390px was also rejected, because it makes the action illegible.
- **Mobile hero order is headline → lede → CTA → specimen.**
  - The specimen shows the single word "ผู้ใหญ่", which carries all 4 Thai levels. There is no loupe on phones.
  - The brew command and proof strip are hidden on phones, because a phone cannot run brew.
- **The app theme may change**, so app-screen surfaces are themed by `data-app-theme` on the landing root.

## Unresolved
- No real shots yet.
- `og.png` is pending.
- The ring wheel is a diagram until a `ring-v2` clip exists.
