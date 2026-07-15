# CP-0016 — Right-side tool-options panel (iteration 1)

## Goal

Move the editor's contextual **tool-options controls** (color, stroke width,
size/corner sliders, text style, pin options, magnify/pen options, z-order
reorder) out of the floating bar that currently overlays the top of the canvas,
into a fixed **right-docked vertical panel**. The 11-tool picker stays on the
top row for now; the 1024px palette-overflow fix stays deferred (tracked in the
CP-0016 ticket). This iteration is deliberately scoped so we can see the
relocated controls before deciding whether the tool picker also moves.

## Current state

- The options controls are rendered from `Toolbar.tsx` via `createPortal` into
  `#tool-options-slot` (`Toolbar.tsx:1524`). The portal root is styled as a
  centered floating pill: `absolute left-1/2 -translate-x-1/2 top-7 z-40`
  (`Toolbar.tsx:1525`), shown only when `hasContext` is true (`Toolbar.tsx:1334`).
- `#tool-options-slot` is defined in both editor and web pages as a top overlay:
  `pointer-events-none absolute inset-x-0 top-0 z-40`
  (`src/app/editor/page.tsx:346`, `src/app/paste/page.tsx:263`).
- `EditorStage` sizes its Konva stage from its container via a `ResizeObserver`
  (`EditorStage.tsx:351`), so shrinking the canvas container reflows the stage
  correctly.

## Design

**Layout — reflow, not overlay.** Restructure each page's `<main>` into a flex
row: a `relative min-w-0 flex-1` canvas region (holds the existing
`absolute inset-0` stage) plus the `#tool-options-slot` as a `flex-none` right
child. The slot is empty (0 width) when no tool context exists, so the canvas
keeps full width; when the portal renders the panel the slot takes the panel's
width and the canvas reflows — the ResizeObserver resizes the stage. This keeps
the controls off the canvas instead of overlaying annotations. Settings and
onboarding overlays stay `absolute inset-0` over `<main>` (unchanged); in those
views the Toolbar isn't rendered, so the slot is empty anyway.

**Panel styling.** The portal root becomes a vertical panel:
`flex h-full w-60 flex-col items-stretch gap-2.5 overflow-y-auto
border-l border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-3`
(drops the `.toolbar` pill class and the floating/centering classes). Existing
control groups are `flex items-center` rows and stack vertically as-is.

**Narrow-width fixes.** The `selected` separator flips from a vertical rule
(`h-5 w-px`) to a horizontal one (`h-px w-full`). The pin-controls row gains
`flex-wrap` so Next/Save/Clear/Continue wrap within the panel width. Sliders
(`w-24`) and the sticker grid (`flex-wrap`) already fit ~216px usable width.

## Scope

- **In:** relocate + vertically restack the options controls; both editor and
  `/paste`.
- **Out (this iteration):** moving the tool picker into the panel; the 1024px
  palette-overflow fix; changing any control's behavior; group headers/polish.

## Acceptance

- The options controls no longer float over the canvas; they render in a
  right-docked panel that appears on context and collapses (canvas reclaims
  width) when nothing is selected.
- Canvas/stage reflows to the reduced width with no clipping or overlap.
- Works in both desktop editor and web `/paste`.
- `tsc` clean, unit tests pass, `next build` green; verified visually via the
  `/paste` dev server with an annotation selected.
