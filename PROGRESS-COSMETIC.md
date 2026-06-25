# PROGRESS-COSMETIC — UX / visual polish tracker

Split from [PROGRESS-NEXT.md](PROGRESS-NEXT.md). Index: [BUG](PROGRESS-BUG.md) · [FEATURE](PROGRESS-FEATURE.md).

Scope: UI layout, visual hygiene, toasts/feedback, window-merge UX, tray menu. No behavior changes that belong in BUG; no new capabilities that belong in FEATURE.

Open items first (actionable for agents). Landed history archived — see below.

## Open

- [ ] **Re-design saved/copied feedback** — both `toast.success("Copied")` (copy-to-clipboard, [src/app/editor/page.tsx](src/app/editor/page.tsx) + [src/components/editor/Toolbar.tsx](src/components/editor/Toolbar.tsx)) and `toast.success("Saved")` (export PNG) fire as small top-right toasts that are easy to miss and feel out of place for the primary success affordance of the app. Replace with a large transient overlay centered over the editor stage — semi-opaque card with a big check icon + "Copied to clipboard" / "Saved to <filename>" label that fades in and out over ~800ms, non-blocking. Keep small toasts for errors. Consider showing the saved path with a "Reveal in Finder/Explorer" action on the overlay.
- [ ] **High-quality capture feedback** — capturing 5K/6K screens can take seconds; show a loader / progress indicator in the tray or a transient HUD so the user knows it's working instead of suspecting a no-op.

## Landed

- **Graphite design-system v2 revamp** (2026-06-26) — Full migration from liquid-glass aesthetics to the flat Graphite token system across all app surfaces (home, editor, overlay, settings, onboarding) and Ladle storybook. Old `glass-*`/`glow-tile*`/`rail-button*`/`headline-xl` class definitions deleted from `@layer components`; old `--lg-*/--depth-*/--blur-*` CSS variables removed; new Graphite component classes (`.btn`, `.btn-icon`, `.surface`, `.toolbar`, `.field`, `.switch`, `.segmented`, `.tile`, `.menu`, `.badge`, `.headline`) remain. Spec: [docs/superpowers/specs/2026-06-25-design-system-v2-design.md](docs/superpowers/specs/2026-06-25-design-system-v2-design.md). Plan: [docs/superpowers/plans/2026-06-25-design-system-v2-graphite.md](docs/superpowers/plans/2026-06-25-design-system-v2-graphite.md).

Archived: [docs/archive/PROGRESS-COSMETIC-LANDED.md](docs/archive/PROGRESS-COSMETIC-LANDED.md).
