# Design System v2 — "Graphite" — Design Spec

- **Date:** 2026-06-25
- **Status:** Draft for review
- **Scope:** Re-skin the entire `capz` (Shotr) desktop UI from the current
  "liquid glass" dark-purple system to a new flat-dark **Graphite** system.
  Pure visual revamp — no behavior, IPC, or capture-pipeline changes.

## 1. Goal & Intent

The app currently ships a translucent, blur-heavy, dark-**purple** "liquid glass"
design (`glass-*` / `glow-*` classes in [`globals.css`](../../../src/app/globals.css),
plus a Ladle storybook under `src/components/design/`). We are **evolving the token
architecture but replacing the visual language** with a flat, neutral, professional
dark system called **Graphite**.

Why Graphite for a screenshot capture/annotation tool:

- A neutral graphite chrome lets the **captured image be the brightest thing on
  screen** — purple tints and glass sheen currently compete with content.
- **Flat, opaque surfaces** remove all `backdrop-filter` blur, which also deletes
  the entire Windows WebView2 glass-fallback hack (blur never paints there).
- One restrained accent (indigo) used **only for actions and the selected tool**
  replaces the "everything glows" look — calmer, faster, more legible.

Non-goals: no light theme (already dropped), no new features, no changes to the
annotation **draw-color** palette (user content, stays as-is), no IPC/`ts-rs`
changes.

## 2. Foundation Tokens (approved)

Replaces the `:root, .dark` block and `@theme inline` mappings in
[`globals.css`](../../../src/app/globals.css). Dark-only; single palette.

### Surfaces (flat, opaque — no translucency/blur)

| token | value | use |
|---|---|---|
| `--bg` | `#0f0f12` | window background |
| `--bg-canvas` | `#0d0d10` | editor canvas zone (darkest, image pops) |
| `--surface` | `#161619` | cards, panels, settings |
| `--surface-raised` | `#1f1f24` | inputs, hover, raised |
| `--surface-overlay` | `#1c1c21` | toolbar pill, popover, menu, tray |

### Hairlines (replace glass rim/sheen)

`--border #ffffff14` · `--border-strong #ffffff1f` · `--border-subtle #ffffff0f`

### Text

`--fg #ecedf0` · `--fg-2 #c9cad1` · `--fg-3 #9a9aa3` (idle icon) · `--fg-4 #71717a` (placeholder/hint)

### Accent — single, indigo (actions + selected only)

`--accent #6d7cff` · `--accent-hover #5b6bff` · `--accent-fg #ffffff` ·
`--accent-soft #6d7cff29` (selected bg) · `--accent-ring #6d7cff73` (focus)

### Semantic

`--success #34d399` · `--warning #fbbf24` · `--danger #f76b6b`

### Radius (tighter than glass)

`--radius-sm 6px · --radius-md 8px · --radius-lg 12px · --radius-xl 16px · --radius-pill 999px`

### Elevation (hairline + flat shadow; no blur, no inset sheen)

`--elev-1 0 1px 2px #0006` · `--elev-2 0 4px 12px #0007` · `--elev-3 0 12px 32px #0009`

### Type (keep Noto Sans Thai; dense desktop scale)

`--text-xs 11 · --text-sm 12 · --text-base 13 · --text-md 14 · --text-lg 16 · --text-xl 20 · --text-2xl 28`.
Weights 400 / 500, 600 for headings. Tight tracking on headings (`--ls-tight`,`--ls-snug` retained).

### Space & motion

4px grid: `4 6 8 10 12 16 20 24 32`. Motion snappy:
`--t-fast 100ms · --t 140ms`, ease `cubic-bezier(.2,.6,.2,1)`, active `scale .98`.
Focus ring: `box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent-ring)`.

### shadcn variable remap

Re-point the shadcn semantic vars so all `src/components/ui/*` primitives re-skin
with no JSX change:

```
--background→--bg  --card→--surface  --popover→--surface-overlay
--primary→--accent  --primary-foreground→--accent-fg
--secondary→--surface-raised  --muted→--surface  --muted-foreground→--fg-3
--accent→--surface-raised (hover token)  --border→--border  --input→--border-strong  --ring→--accent
--destructive→--danger  --radius→0.5rem (md baseline)
```

## 3. Component System (approved)

Drop `glass-*` / `glow-*` / `rail-*` prefixes. New neutral class names. Same
component APIs/props where they exist — pure re-skin.

| new | replaces | rule |
|---|---|---|
| `.btn` + `--primary`/`--secondary`/`--ghost`/`--danger` | `glass-button`, `glass-button-primary` | primary = accent fill; secondary = `surface-raised` + hairline; ghost = transparent → hover `surface-raised`; sizes sm/md; active `scale .98` |
| `.btn-icon` | `rail-button`, editor `ToolButton` | square 32/36; idle `fg-3`; hover `surface-raised` + `fg`; **selected** = accent fill |
| `.surface` | `glass-card` | flat `--surface` + hairline + `radius-lg`; `.surface-row-list > * + *` hairline separator (from `glass-row-list`) |
| `.toolbar` | `glass-pill`, `glass-pill-soft` | `--surface-overlay` + hairline + `elev-2` + `radius-lg`; holds tool buttons + split divider |
| `.field` (input/select) | `glass-input`, `glass-select` | `--surface-raised` + hairline; focus = accent ring |
| `.switch` | `glass-toggle`, `glass-toggle-thumb` | track `--surface-raised` → `--accent` on; white thumb |
| `.segmented` | `glass-tab` | overlay track; active = `--surface-raised` + hairline (**neutral, not accent** — reserves accent for actions) |
| `.tile` | `glow-tile*` | flat `--surface` + accent-tinted icon chip; **neon/gradient tone variants dropped** |
| `.menu` | dropdown / popover / `GlassDock` | `--surface-overlay` + `elev-3` |
| `.badge` | `Badge` story | soft semantic chip (`accent-soft` / success / warning / danger) |
| `.headline` | `headline-xl` | `--text-2xl`, weight 600, tight tracking |
| `.eyebrow` | `eyebrow` (kept) | re-color to `--accent`, uppercase, `--ls-eyebrow` |

Rule of thumb: **accent only for primary actions + the selected tool.** Tabs,
segments, cards, tiles stay neutral graphite.

## 4. Surface Application

| surface | files | treatment |
|---|---|---|
| Home | `src/app/page.tsx` | flat `--bg`, hero `.headline`/`.eyebrow`, feature `.tile`s, primary `.btn`. Drop radial-purple backdrop. |
| Editor | `src/app/editor/page.tsx`, `src/components/editor/*` | canvas zone `--bg-canvas`; floating `.toolbar` pill; `.btn-icon` tools (selected = accent); zoom `.toolbar` pill; OCR layer accent selection |
| Overlay | `src/app/overlay/page.tsx` | neutral dim scrim + **accent** selection border/handles + dimension badge |
| Settings | `src/components/settings/*` | `.surface` cards, `.surface-row-list`, `.field`, `.switch`, `.segmented` tabs, `HotkeyRecorder` re-skin |
| Onboarding | `src/components/onboarding/*` | `.surface` cards, primary `.btn`, step indicators, TCC recovery dialog |

## 5. Migration Strategy

Order chosen to keep the app runnable and verifiable at every step:

1. **Tokens** — rewrite `:root,.dark` vars + `@theme inline` + shadcn remap in
   `globals.css`. Flatten body background to `--bg` (remove radial gradient).
   **Delete the `html[data-os="windows"]` glass-fallback block** (dead without blur).
2. **Component layer** — add new `.btn/.surface/.toolbar/.field/.switch/.segmented/.tile/.menu/.badge/.headline` classes in `@layer components`. Old `glass-*` kept temporarily so the app keeps building.
3. **Migrate consumers, surface by surface**, verifying each with `pnpm dev` +
   the matching e2e web spec: home → settings → onboarding → editor → overlay.
   Real-app files touched (from grep, 2026-06-25):
   `src/app/editor/page.tsx`, `src/components/editor/{Toolbar,EditorStage}.tsx`,
   `src/components/onboarding/{OnboardingView,InertGrantRecoveryDialog}.tsx`,
   `src/components/settings/{SettingsView,OutputPrefsForm,StickersForm}.tsx`,
   `src/components/design/tiles/GlowTile.tsx`,
   `src/components/design/glass3d/GlassDock.tsx`, plus home page.
4. **Storybook** — re-skin Ladle stories to Graphite: replace
   `src/components/design/glass/*`, `glass3d/*`, `tiles/GlowTile*`; update token
   stories (`Colors`, `Typography`, `Radii`, `Shadows`); **remove `Gradients`
   story** (flat system has none).
5. **Cleanup** — delete dead `glass-*/glow-*/rail-*` classes from `globals.css`
   once no consumers remain. `cargo clippy` n/a (no Rust change); run
   `pnpm test:unit`, `pnpm test:e2e:web`, `pnpm build` green.

## 6. Verification

- Per surface: `pnpm dev` visual check + corresponding spec in `e2e/web/`
  (`home`, `settings`, `editor`, `editor-tools`, `onboarding`, `overlay`, `ocr`).
- Full: `pnpm test:unit` + `pnpm test:e2e:web` + `pnpm build` pass.
- Grep guard: `grep -rE 'glass-|glow-tile|rail-button' src` returns nothing
  outside (intentionally renamed) history.
- Windows: confirm surfaces are fully opaque (no reliance on blur) — the OS
  fallback block is gone, so parity is automatic.

## 7. Risks & Mitigations

- **Wide blast radius** (~150 class usages). Mitigation: phased surface-by-surface
  migration with e2e gate per surface; old classes kept until consumers migrate.
- **shadcn remap subtlety** — a mis-mapped var skins every primitive wrong.
  Mitigation: verify `ui/*` primitives in Ladle immediately after Phase 1.
- **Editor contrast** — annotation draw-colors must stay legible on `--bg-canvas`.
  Mitigation: draw palette unchanged; only chrome changes.

## 8. Open Questions

- Accent hue: indigo `#6d7cff` is the default. Swap is a 1-line token change if a
  different brand accent is preferred later.
