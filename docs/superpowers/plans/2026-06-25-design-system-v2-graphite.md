# Design System v2 "Graphite" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the entire capz (Shotr) desktop UI from the dark-purple "liquid glass" system to a flat-dark **Graphite** system, with zero behavior/IPC/capture changes.

**Architecture:** Rewrite the token + `@theme` layer in [`src/app/globals.css`](../../../src/app/globals.css) so all shadcn `ui/*` primitives re-skin automatically; add a new neutral component-class layer (`.btn`, `.surface`, …) replacing `glass-*/glow-*/rail-*`; migrate consumers surface-by-surface (home → settings → onboarding → editor → overlay), gating each on its existing Playwright web spec; rebuild the Ladle storybook; delete dead classes last.

**Tech Stack:** Next.js 15 static export, React 19, Tailwind 4 (`@theme inline`), shadcn/ui, Ladle, Playwright (`e2e/web`), Vitest. Package manager **pnpm only**.

## Global Constraints

- **pnpm only** — never npm/yarn.
- **Dark-only.** No light theme. Single `:root, .dark` palette.
- **No `backdrop-filter` / blur anywhere** in the new system. Surfaces are fully opaque (this is what makes the Windows fallback unnecessary).
- **Accent = actions + selected tool only.** Tabs, segments, cards, tiles stay neutral graphite.
- **No behavior, IPC, `ts-rs`, or Rust changes.** Annotation **draw-color** palette is user content — do not touch.
- **No `localStorage`** (uses `tauri-plugin-store`) — irrelevant to CSS but do not introduce.
- **Brand token name:** `--accent` (bright indigo). In `@theme inline`, Tailwind `color-primary → var(--accent)`, `color-accent → var(--surface-raised)` (decoupled — see Task 1).
- **Canonical class-rename map** (applied in every consumer task):

  | old | new |
  |---|---|
  | `glass-button-primary` | `btn btn--primary` |
  | `glass-button` | `btn btn--secondary` |
  | `glass-card` | `surface` |
  | `glass-row-list` | `surface-row-list` |
  | `glass-pill`, `glass-pill-soft` | `toolbar` |
  | `glass-input` | `field` |
  | `glass-select` | `field` |
  | `glass-toggle` | `switch` |
  | `glass-toggle-thumb` | `switch-thumb` |
  | `glass-tab` | `segmented-item` |
  | `rail-button` | `btn-icon` |
  | `glow-tile`, `glow-tile-*` | `tile` (tone variants dropped) |
  | `headline-xl` | `headline` |
  | `eyebrow` | `eyebrow` (kept; re-colored in Task 1) |

- **Spec:** [`docs/superpowers/specs/2026-06-25-design-system-v2-design.md`](../specs/2026-06-25-design-system-v2-design.md).
- **Verification commands** (exact): `pnpm build`, `pnpm test:unit`, `pnpm test:e2e:web`, `pnpm ladle:build`.

---

## File Structure

- **`src/app/globals.css`** — the whole token + theme + base + component layer. The core of this work. (Tasks 1, 2, 9.)
- **`src/app/page.tsx`** — home surface. (Task 3.)
- **`src/components/settings/{SettingsView,OutputPrefsForm,StickersForm,HotkeyRecorder}.tsx`** — settings surface. (Task 4.)
- **`src/components/onboarding/{OnboardingView,InertGrantRecoveryDialog}.tsx`** — onboarding surface. (Task 5.)
- **`src/app/editor/page.tsx`, `src/components/editor/{Toolbar,EditorStage,OcrLayer,Rulers}.tsx`, `src/components/editor/toolbar/*`** — editor surface. (Task 6.)
- **`src/app/overlay/page.tsx`** — selection overlay. (Task 7.)
- **`src/components/design/**`** — Ladle storybook. (Task 8.)

shadcn primitives in `src/components/ui/*` need **no edits** — they re-skin via the `@theme` remap in Task 1.

---

## Task 1: Token foundation, theme remap, flat backdrop, drop Windows hack

**Files:**
- Modify: `src/app/globals.css` (the `@theme inline` block, the `:root, .dark` block, the `@layer base` body background, and the trailing `html[data-os="windows"]` block).

**Interfaces:**
- Produces: all Graphite CSS variables (`--bg`, `--bg-canvas`, `--surface`, `--surface-raised`, `--surface-overlay`, `--border*`, `--fg*`, `--accent*`, `--success/--warning/--danger`, `--radius*`, `--elev-*`, `--shadow-focus`, `--text-*`, `--ls-*`, `--t-fast/--t/--ease`) and the shadcn semantic vars (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--border`, `--input`, `--ring`, `--sidebar*`, `--chart*`). Consumed by every later task and by `ui/*`.

- [ ] **Step 1: Baseline — confirm current build + home spec pass before touching anything**

Run: `pnpm build && pnpm test:e2e:web -- home.spec.ts`
Expected: build succeeds; home spec PASS. (Records the green baseline this task must preserve.)

- [ ] **Step 2: Replace the `@theme inline` block** (lines ~23–70) with the Graphite mapping

```css
@theme inline {
  --color-background: var(--bg);
  --color-foreground: var(--fg);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --font-heading: var(--font-sans);

  --color-card: var(--surface);
  --color-card-foreground: var(--fg);
  --color-popover: var(--surface-overlay);
  --color-popover-foreground: var(--fg);

  --color-primary: var(--accent);
  --color-primary-foreground: var(--accent-fg);
  --color-secondary: var(--surface-raised);
  --color-secondary-foreground: var(--fg);
  --color-muted: var(--surface);
  --color-muted-foreground: var(--fg-3);

  --color-accent: var(--surface-raised);
  --color-accent-foreground: var(--fg);

  --color-destructive: var(--danger);
  --color-border: var(--border);
  --color-input: var(--border-strong);
  --color-ring: var(--accent);

  --color-chart-1: var(--accent);
  --color-chart-2: var(--success);
  --color-chart-3: var(--warning);
  --color-chart-4: #f472b6;
  --color-chart-5: #38bdf8;

  --color-sidebar: var(--surface);
  --color-sidebar-foreground: var(--fg);
  --color-sidebar-primary: var(--accent);
  --color-sidebar-primary-foreground: var(--accent-fg);
  --color-sidebar-accent: var(--surface-raised);
  --color-sidebar-accent-foreground: var(--fg);
  --color-sidebar-border: var(--border);
  --color-sidebar-ring: var(--accent);

  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
  --radius-xl: var(--radius-xl);
  --radius-pill: var(--radius-pill);
  --shadow-xs: var(--elev-1);
  --shadow-sm: var(--elev-1);
  --shadow-md: var(--elev-2);
  --shadow-lg: var(--elev-3);
}
```

- [ ] **Step 3: Replace the entire `:root, .dark { … }` block** (the "Single dark-purple palette" block, lines ~72–167) with the Graphite tokens

```css
/* Graphite — flat dark, single palette. No light theme. */
:root,
.dark {
  /* Surfaces */
  --bg: #0f0f12;
  --bg-canvas: #0d0d10;
  --surface: #161619;
  --surface-raised: #1f1f24;
  --surface-overlay: #1c1c21;

  /* Hairlines */
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.12);
  --border-subtle: rgba(255, 255, 255, 0.06);

  /* Text */
  --fg: #ecedf0;
  --fg-2: #c9cad1;
  --fg-3: #9a9aa3;
  --fg-4: #71717a;

  /* Accent (brand indigo) */
  --accent: #6d7cff;
  --accent-hover: #5b6bff;
  --accent-fg: #ffffff;
  --accent-soft: rgba(109, 124, 255, 0.16);
  --accent-ring: rgba(109, 124, 255, 0.45);

  /* Semantic */
  --success: #34d399;
  --warning: #fbbf24;
  --danger: #f76b6b;

  /* Radius */
  --radius: 0.5rem;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-pill: 999px;

  /* Elevation (no blur, no inset sheen) */
  --elev-1: 0 1px 2px rgba(0, 0, 0, 0.40);
  --elev-2: 0 4px 12px rgba(0, 0, 0, 0.45);
  --elev-3: 0 12px 32px rgba(0, 0, 0, 0.55);
  --shadow-focus: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent-ring);

  /* Type scale */
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 13px;
  --text-md: 14px;
  --text-lg: 16px;
  --text-xl: 20px;
  --text-2xl: 28px;
  --ls-tight: -0.022em;
  --ls-snug: -0.015em;
  --ls-eyebrow: 0.06em;

  /* Motion */
  --t-fast: 100ms;
  --t: 140ms;
  --ease: cubic-bezier(0.2, 0.6, 0.2, 1);

  /* shadcn semantic vars (consumed by ui/*) */
  --background: var(--bg);
  --foreground: var(--fg);
  --card: var(--surface);
  --card-foreground: var(--fg);
  --popover: var(--surface-overlay);
  --popover-foreground: var(--fg);
  --primary: var(--accent);
  --primary-foreground: var(--accent-fg);
  --secondary: var(--surface-raised);
  --secondary-foreground: var(--fg);
  --muted: var(--surface);
  --muted-foreground: var(--fg-3);
  --accent-foreground: var(--fg);
  --destructive: var(--danger);
  --input: var(--border-strong);
  --ring: var(--accent);
}
```

> Note: `--accent` resolves to the brand indigo for our own `.btn` classes; Tailwind's `accent` color is decoupled in `@theme` (Step 2) to `--surface-raised`, so shadcn hover states stay neutral. `--border` is intentionally defined once here and consumed by both `@theme` and `@layer base`.

- [ ] **Step 4: Flatten the body background** in `@layer base` — replace the `body { … background-image: radial-gradient(...) … }` rule's background block with a flat fill

```css
  html,
  body {
    background-color: var(--bg);
  }
  body {
    color: var(--fg);
    font-family: var(--font-sans), -apple-system, BlinkMacSystemFont,
      "Segoe UI", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
    letter-spacing: -0.01em;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    background: var(--bg);
    min-height: 100vh;
  }
```

(Leave the rest of `@layer base` — the `*`, `html`, heading, and cursor rules — unchanged.)

- [ ] **Step 5: Re-color the `.eyebrow` utility** (keep the class, change color var only — already `var(--primary)` which now resolves to accent; confirm it reads `color: var(--accent);`)

```css
.eyebrow {
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: var(--ls-eyebrow);
  text-transform: uppercase;
  color: var(--accent);
}
```

- [ ] **Step 6: Delete the Windows glass-fallback block** at the end of the file (the `html[data-os="windows"]` rules, lines ~556–573). Remove the entire block including its comment — opaque surfaces make it dead.

- [ ] **Step 7: Build and verify the app still compiles and the home spec still passes**

Run: `pnpm build && pnpm test:e2e:web -- home.spec.ts`
Expected: build succeeds; home spec PASS (old `glass-*` classes still defined further down the file, so the app renders — now on a flat graphite background instead of purple).

- [ ] **Step 8: Visual spot-check**

Run: `pnpm dev` and open the app. Confirm: flat `#0f0f12` background (no purple gradient), shadcn primitives (any `ui/button`, `ui/select`) render indigo-primary / graphite surfaces.

- [ ] **Step 9: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): Graphite token foundation + shadcn remap; drop purple backdrop and Windows glass hack"
```

---

## Task 2: New component-class layer

**Files:**
- Modify: `src/app/globals.css` (add new classes inside the existing `@layer components { … }`; keep old `glass-*/glow-*/rail-*` classes in place for now).

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: classes `.btn` (`.btn--primary/--secondary/--ghost/--danger`, `.btn--sm`), `.btn-icon` (+ `[data-active]`), `.surface`, `.surface-row-list`, `.toolbar`, `.field`, `.switch` + `.switch-thumb`, `.segmented` + `.segmented-item` (+ `[data-active]`), `.tile`, `.menu`, `.badge` (+ `--success/--warning/--danger`), `.headline`. Consumed by Tasks 3–8.

- [ ] **Step 1: Add the new classes** at the top of the existing `@layer components { … }` block (immediately after the `{`)

```css
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 36px;
    padding: 0 16px;
    border-radius: var(--radius-md);
    font-size: var(--text-md);
    font-weight: 500;
    border: 1px solid transparent;
    transition: background var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease),
      transform var(--t-fast) var(--ease), filter var(--t-fast) var(--ease);
  }
  .btn:active:not(:disabled) { transform: scale(0.98); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn:focus-visible { outline: none; box-shadow: var(--shadow-focus); }
  .btn--sm { height: 30px; padding: 0 12px; font-size: var(--text-sm); }

  .btn--primary { background: var(--accent); color: var(--accent-fg); }
  .btn--primary:hover:not(:disabled) { background: var(--accent-hover); }

  .btn--secondary {
    background: var(--surface-raised);
    color: var(--fg);
    border-color: var(--border);
  }
  .btn--secondary:hover:not(:disabled) { background: #26262c; }

  .btn--ghost { background: transparent; color: var(--fg-2); }
  .btn--ghost:hover:not(:disabled) { background: var(--surface-raised); color: var(--fg); }

  .btn--danger { background: var(--danger); color: #fff; }
  .btn--danger:hover:not(:disabled) { filter: brightness(1.06); }

  .btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    color: var(--fg-3);
    background: transparent;
    transition: background var(--t-fast) var(--ease), color var(--t-fast) var(--ease),
      transform var(--t-fast) var(--ease);
  }
  .btn-icon:hover:not(:disabled) { background: var(--surface-raised); color: var(--fg); }
  .btn-icon:active:not(:disabled) { transform: scale(0.98); }
  .btn-icon:focus-visible { outline: none; box-shadow: var(--shadow-focus); }
  .btn-icon[data-active] { background: var(--accent); color: var(--accent-fg); }

  .surface {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--elev-1);
  }
  .surface-row-list > * + * { border-top: 1px solid var(--border-subtle); }

  .toolbar {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 5px;
    background: var(--surface-overlay);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--elev-2);
  }

  .field {
    background: var(--surface-raised);
    border: 1px solid var(--border);
    color: var(--fg);
    padding: 8px 10px;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }
  .field::placeholder { color: var(--fg-4); }
  .field:focus { outline: none; border-color: var(--accent); box-shadow: var(--shadow-focus); }

  .switch {
    position: relative;
    height: 19px;
    width: 34px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: var(--surface-raised);
    transition: background var(--t-fast) var(--ease);
    cursor: pointer;
  }
  .switch[aria-checked="true"] { background: var(--accent); border-color: transparent; }
  .switch:focus-visible { outline: none; box-shadow: var(--shadow-focus); }
  .switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    height: 13px;
    width: 13px;
    border-radius: var(--radius-pill);
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    transition: left var(--t) var(--ease);
  }
  .switch[aria-checked="true"] .switch-thumb { left: 17px; }

  .segmented {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    background: var(--surface-overlay);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  .segmented-item {
    padding: 5px 12px;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    color: var(--fg-2);
    transition: background var(--t-fast) var(--ease), color var(--t-fast) var(--ease);
  }
  .segmented-item:hover { color: var(--fg); }
  .segmented-item[data-active] {
    background: var(--surface-raised);
    color: var(--fg);
    box-shadow: var(--elev-1);
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    border-radius: var(--radius-lg);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--fg);
  }
  .tile-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .menu {
    background: var(--surface-overlay);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--elev-3);
    padding: 4px;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 8px;
    border-radius: var(--radius-pill);
    font-size: var(--text-xs);
    font-weight: 500;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .badge--success { background: rgba(52, 211, 153, 0.16); color: var(--success); }
  .badge--warning { background: rgba(251, 191, 36, 0.16); color: var(--warning); }
  .badge--danger { background: rgba(247, 107, 107, 0.16); color: var(--danger); }

  .headline {
    font-size: var(--text-2xl);
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: var(--ls-tight);
    color: var(--fg);
  }
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: succeeds (new classes added, nothing consumes them yet).

- [ ] **Step 3: Sanity-render the new classes in Ladle**

Run: `pnpm ladle:build`
Expected: build succeeds. (Stories still use old classes; this only confirms CSS is valid.)

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): add Graphite component-class layer (.btn/.surface/.toolbar/.field/.switch/.segmented/.tile/.menu/.badge)"
```

---

## Task 3: Migrate Home surface

**Files:**
- Modify: `src/app/page.tsx`
- Test: `e2e/web/home.spec.ts` (existing — regression gate)

**Interfaces:**
- Consumes: classes from Task 2; rename map from Global Constraints.

- [ ] **Step 1: Confirm gate is green before edits**

Run: `pnpm test:e2e:web -- home.spec.ts`
Expected: PASS.

- [ ] **Step 2: Apply the rename map to `src/app/page.tsx`.** Read the file, then replace every old class per the Global Constraints rename map. Specifically: `headline-xl`→`headline`; `glass-button-primary`→`btn btn--primary`; `glass-button`→`btn btn--secondary`; `glow-tile`/`glow-tile-*`→`tile` (drop the tone modifier; if the tile had a leading icon, wrap it in `<span className="tile-icon">`); `glass-card`→`surface`. Keep `eyebrow` as-is.

- [ ] **Step 3: Build + typecheck**

Run: `pnpm build`
Expected: succeeds, no TS/class errors.

- [ ] **Step 4: Run the home gate**

Run: `pnpm test:e2e:web -- home.spec.ts`
Expected: PASS. If the spec asserts on an old class name, update the assertion to the new class (the spec is a regression guard for structure/behavior, not the old skin).

- [ ] **Step 5: Visual check**

Run: `pnpm dev`, open home. Confirm flat graphite hero, neutral tiles with accent icon chips, indigo primary button.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx e2e/web/home.spec.ts
git commit -m "feat(design): re-skin home to Graphite"
```

---

## Task 4: Migrate Settings surface

**Files:**
- Modify: `src/components/settings/SettingsView.tsx`, `src/components/settings/OutputPrefsForm.tsx`, `src/components/settings/StickersForm.tsx`, `src/components/settings/HotkeyRecorder.tsx`
- Test: `e2e/web/settings.spec.ts`, `e2e/web/settings-hotkey.spec.ts`

**Interfaces:**
- Consumes: Task 2 classes; rename map.

- [ ] **Step 1: Gate green before edits**

Run: `pnpm test:e2e:web -- settings.spec.ts settings-hotkey.spec.ts`
Expected: PASS.

- [ ] **Step 2: Apply the rename map** across all four files. Key mappings here: `glass-card`→`surface`; `glass-row-list`→`surface-row-list`; `glass-input`→`field`; `glass-select`→`field`; `glass-toggle`→`switch`; `glass-toggle-thumb`→`switch-thumb`; `glass-tab`→`segmented-item` (and wrap the tab group container in `segmented` if it isn't already); `glass-button-primary`→`btn btn--primary`; `glass-button`→`btn btn--secondary`. `HotkeyRecorder` recording input → `field`; active-capture state uses `box-shadow: var(--shadow-focus)` (already via `.field:focus`).

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Run settings gates**

Run: `pnpm test:e2e:web -- settings.spec.ts settings-hotkey.spec.ts`
Expected: PASS. Update any class-name assertions to new names if needed.

- [ ] **Step 5: Visual check**

Run: `pnpm dev`, open settings. Confirm graphite surface cards, hairline row separators, indigo switches when on, neutral segmented tabs.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings
git commit -m "feat(design): re-skin settings to Graphite"
```

---

## Task 5: Migrate Onboarding surface

**Files:**
- Modify: `src/components/onboarding/OnboardingView.tsx`, `src/components/onboarding/InertGrantRecoveryDialog.tsx`
- Test: `e2e/web/onboarding.spec.ts`, `e2e/web/onboarding-tcc.spec.ts`

**Interfaces:**
- Consumes: Task 2 classes; rename map.

- [ ] **Step 1: Gate green before edits**

Run: `pnpm test:e2e:web -- onboarding.spec.ts onboarding-tcc.spec.ts`
Expected: PASS.

- [ ] **Step 2: Apply the rename map** to both files: `glass-card`→`surface`; `glass-button-primary`→`btn btn--primary`; `glass-button`→`btn btn--secondary`; `glow-tile*`→`tile`. Step indicators: any pill using old glass classes → neutral `surface-raised` with accent fill for the active step.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Run onboarding gates**

Run: `pnpm test:e2e:web -- onboarding.spec.ts onboarding-tcc.spec.ts`
Expected: PASS. Update class-name assertions if needed.

- [ ] **Step 5: Visual check**

Run: `pnpm dev`, open onboarding (clear store / first-run path per `e2e/web/onboarding.spec.ts` setup). Confirm graphite cards, primary indigo CTA, readable TCC recovery dialog.

- [ ] **Step 6: Commit**

```bash
git add src/components/onboarding
git commit -m "feat(design): re-skin onboarding to Graphite"
```

---

## Task 6: Migrate Editor surface

**Files:**
- Modify: `src/app/editor/page.tsx`, `src/components/editor/Toolbar.tsx`, `src/components/editor/EditorStage.tsx`, `src/components/editor/toolbar/ToolButton.tsx`, `src/components/editor/toolbar/CaptureSplitButton.tsx`, `src/components/editor/toolbar/OverflowMenu.tsx`, `src/components/editor/toolbar/ZoomMenuButton.tsx`, `src/components/editor/OcrLayer.tsx`
- Test: `e2e/web/editor.spec.ts`, `e2e/web/editor-tools.spec.ts`, `e2e/web/ocr.spec.ts`

**Interfaces:**
- Consumes: Task 2 classes; rename map.

- [ ] **Step 1: Gate green before edits**

Run: `pnpm test:e2e:web -- editor.spec.ts editor-tools.spec.ts ocr.spec.ts`
Expected: PASS.

- [ ] **Step 2: Canvas zone.** In `EditorStage.tsx` (and/or `editor/page.tsx` wrapper), set the canvas/stage background to `var(--bg-canvas)` so the captured image sits on the darkest surface.

- [ ] **Step 3: Toolbar.** In `Toolbar.tsx`: the floating bar `glass-pill`/`glass-pill-soft`→`toolbar`. Overflow/zoom menus `glass-pill*`→`menu`.

- [ ] **Step 4: Tool buttons.** In `ToolButton.tsx`: `rail-button`→`btn-icon`; the selected/active tool keeps its `data-active` attribute (now styled by `.btn-icon[data-active]` = accent fill). `CaptureSplitButton.tsx` / `ZoomMenuButton.tsx` / `OverflowMenu.tsx`: `glass-button*`→`btn btn--*`, dropdown surfaces→`menu`.

- [ ] **Step 5: OCR layer.** In `OcrLayer.tsx`: selection/highlight chrome uses `var(--accent)` for selected text boxes and `var(--accent-soft)` for hover fills (replace any purple literals or glass classes). Do not change OCR logic.

- [ ] **Step 6: Build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 7: Run editor gates**

Run: `pnpm test:e2e:web -- editor.spec.ts editor-tools.spec.ts ocr.spec.ts`
Expected: PASS. Update class-name assertions if needed (e.g. a tool-active assertion keyed on `data-active` should still hold — verify it targets the attribute, not a `glass-tab` class).

- [ ] **Step 8: Visual check**

Run: `pnpm dev`, open the editor route. Confirm darkest canvas, graphite toolbar pill, selected tool = indigo, zoom pill neutral, captured image visually pops.

- [ ] **Step 9: Commit**

```bash
git add src/app/editor src/components/editor
git commit -m "feat(design): re-skin editor (canvas/toolbar/tools/OCR) to Graphite"
```

---

## Task 7: Migrate Overlay (selection) surface

**Files:**
- Modify: `src/app/overlay/page.tsx`
- Test: `e2e/web/overlay.spec.ts`

**Interfaces:**
- Consumes: tokens from Task 1 (uses raw vars — overlay is mostly inline-styled selection chrome).

- [ ] **Step 1: Gate green before edits**

Run: `pnpm test:e2e:web -- overlay.spec.ts`
Expected: PASS.

- [ ] **Step 2: Re-skin selection chrome.** Replace any purple literals/glass classes: dim scrim → `rgba(0,0,0,0.45)` neutral; selection border + resize handles → `var(--accent)`; the dimension/size badge → `.badge` (or inline `var(--surface-overlay)` + `var(--fg)`). Keep all geometry/selection logic untouched.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Run overlay gate**

Run: `pnpm test:e2e:web -- overlay.spec.ts`
Expected: PASS. Update class assertions if needed.

- [ ] **Step 5: Visual check**

Run: `pnpm dev`, open overlay route. Confirm neutral scrim, indigo selection rectangle + handles, legible dimension badge.

- [ ] **Step 6: Commit**

```bash
git add src/app/overlay/page.tsx
git commit -m "feat(design): re-skin selection overlay to Graphite"
```

---

## Task 8: Rebuild Ladle storybook

**Files:**
- Create: `src/components/design/graphite/` stories mirroring components (`Button`, `Surface`, `Toolbar`, `Field`, `Switch`, `Segmented`, `Tile`, `Menu`, `Badge`).
- Modify: token stories `src/components/design/tokens/{Colors,Typography,Radii,Shadows}.stories.tsx` to read Graphite vars.
- Delete: `src/components/design/glass/*`, `src/components/design/glass3d/*` (and `GlassDock.tsx`), `src/components/design/tokens/Gradients.stories.tsx`, the `_backdrops/GlassStage.tsx` if only used by deleted stories.
- KEEP `src/components/design/tiles/GlowTile.tsx` — it was converted to a Graphite icon-chip (`.tile-icon`) in Task 5 and is imported by `OnboardingView`. Do NOT delete it. Rewrite/replace its `GlowTile.stories.tsx` to show the Graphite chip (and optionally rename the symbol `GlowTile`→`TileIcon` here, updating the one import in `OnboardingView.tsx`; if renaming is skipped, leave the name as-is — it is functionally correct).

**Interfaces:**
- Consumes: Task 2 classes.

- [ ] **Step 1: Inventory deletions.** Read `.ladle/components.tsx` and `.ladle/config.mjs` to confirm none import the to-be-deleted files; update if they do.

- [ ] **Step 2: Add Graphite stories** under `src/components/design/graphite/` — one story file per component, each rendering the variants on a `var(--bg)` panel. (Mirror the structure of the existing `glass/*.stories.tsx` files you are replacing.)

- [ ] **Step 3: Update token stories** to display Graphite swatches/values; delete `Gradients.stories.tsx` (flat system has no gradients).

- [ ] **Step 4: Delete the old glass/glow story tree** (`glass/`, `glass3d/`, `tiles/GlowTile*`).

- [ ] **Step 5: Build the storybook**

Run: `pnpm ladle:build`
Expected: succeeds with no missing-import errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/design .ladle
git commit -m "feat(design): rebuild Ladle storybook for Graphite; remove glass/glow stories"
```

---

## Task 9: Delete dead classes + final verification

**Files:**
- Modify: `src/app/globals.css` (remove old `glass-*/glow-*/rail-*` classes).
- Modify: `PROGRESS-COSMETIC.md` (note the revamp).

**Interfaces:**
- Consumes: completion of Tasks 3–8 (no consumers of old classes remain).

- [ ] **Step 1: Confirm no consumers remain**

Run: `grep -rE 'glass-|glow-tile|rail-button|glass-toggle|glass-tab|headline-xl' src/app src/components`
Expected: **no matches** outside `globals.css` definitions. If any appear, migrate them before continuing.

- [ ] **Step 2: Delete the old class definitions** from `@layer components` in `globals.css`: all `.glass-card/.glass-pill/.glass-pill-soft/.glass-button/.glass-button-primary/.glow-tile*` shared `::before/::after` rim/sheen rules, `.glass-select`, `.glass-input`, `.glass-button*`, `.glow-tile*` tone variants, `.rail-button*`, `.glass-toggle*`, `.glass-tab*`, `.glass-row-list`, and the now-unused liquid-glass vars in the palette block (`--lg-*`, `--depth-*`, `--blur-*`) if nothing references them. Keep `.eyebrow`, `.headline`, and all Task 2 classes.

- [ ] **Step 3: Grep guard**

Run: `grep -rE '\-\-lg-|\.glass-|\.glow-tile|\.rail-button' src/app/globals.css`
Expected: **no matches**.

- [ ] **Step 4: Full verification suite**

Run: `pnpm test:unit && pnpm test:e2e:web && pnpm build && pnpm ladle:build`
Expected: all PASS.

- [ ] **Step 5: Update progress doc.** Add a line to `PROGRESS-COSMETIC.md` recording the Graphite revamp and the spec/plan paths.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css PROGRESS-COSMETIC.md
git commit -m "chore(design): remove dead glass/glow classes; finalize Graphite revamp"
```

---

## Self-Review

**Spec coverage:**
- §2 Foundation tokens → Task 1. ✓
- §2 shadcn remap → Task 1 Step 2. ✓
- §3 Component system → Task 2. ✓
- §4 Surface application (home/editor/overlay/settings/onboarding) → Tasks 3–7. ✓
- §5 Migration strategy (tokens→classes→consumers→storybook→cleanup) → Tasks 1–9 order. ✓
- §5 drop radial backdrop + delete Windows hack → Task 1 Steps 4, 6. ✓
- §6 Verification (per-surface e2e + full suite + grep guard) → each task's gate + Task 9. ✓
- §7 Risk: old classes kept until consumers migrate → Tasks 2 (keep) / 9 (delete). ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Mechanical renames reference the single canonical map in Global Constraints (concrete, not a placeholder). ✓

**Type/name consistency:** Class names (`.btn--primary`, `.btn-icon[data-active]`, `.surface-row-list`, `.switch-thumb`, `.segmented-item`, `.tile-icon`) are defined in Task 2 and used identically in Tasks 3–9 and the rename map. `--accent`/`--bg-canvas`/`--shadow-focus` defined in Task 1, consumed consistently. ✓

**Gap note:** Editor/overlay tasks (6, 7) describe semantic deltas + the rename map rather than full-file rewrites because the changes are localized class swaps in files the implementer reads at execution time; the canvas-bg and accent-selection changes are spelled out as concrete var assignments.
