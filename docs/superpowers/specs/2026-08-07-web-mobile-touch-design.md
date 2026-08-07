# Web editor: mobile touch support (phase 1)

Date: 2026-08-07
Status: design approved, not yet implemented

## Goal

Make the browser-only editor (`/paste`) usable on a phone or tablet with the
gesture model people already expect from mobile canvas apps:

- **Two fingers** — pinch to zoom and drag to pan, simultaneously.
- **One finger** — acts on content: select, drag/drop a shape, or draw with the
  active tool. There is no one-finger pan.

Desktop behaviour must not regress.

## Non-goals (phase 1)

Double-tap zoom, two-finger rotate, haptics, and a redesigned mobile toolbar
layout (bottom bar / bottom sheets). Tauri desktop builds are untouched — this
is web-only. Deferred deliberately; revisit after phase 1 ships.

## Current state (verified 2026-08-07)

- `src/components/editor/EditorStage.tsx` is 3272 lines. Zoom lives in the
  Zustand store `src/stores/editor.ts` as `displayScale` (with `clampZoom`,
  `ZOOM_MIN`/`ZOOM_MAX`). **Pan is not state** — it is native scroll on the
  container div (`el.scrollLeft` / `el.scrollTop`). Konva `Stage draggable` is
  never used; the Stage sits at a fixed size inside an `overflow-auto` div.
- `zoomAtClient` (EditorStage.tsx:381–404) is a ref-held helper taking
  `(factor, clientX, clientY)` that zooms while pinning the image-coordinate
  point under the cursor. Pinch can reuse it verbatim with the two-finger
  midpoint.
- The container effect at EditorStage.tsx:407–475 registers `wheel`
  (`{passive:false}`), plus `mousedown`/`mousemove`/`mouseup` for middle-button
  pan.
- Stage props (EditorStage.tsx:1385–1392) are `onMouseDown` / `onMouseMove` /
  `onMouseUp` / `onMouseLeave`. `handleMouseDown` (L912) early-returns on
  `e.evt.button !== 0`.
- Roughly 15 per-shape components inside EditorStage.tsx wire `onMouseDown`
  alongside `draggable` + `onDragMove` / `onDragEnd`.
- There is **no** touch, pointer, or gesture handling anywhere in `src/` today
  (only hover-only `onPointerEnter/Leave` in the overlay window).
- `src/app/layout.tsx` has no `viewport` export.
- `src/app/paste/page.tsx` has a hard `w-60 flex-none` sidebar (L281) and no
  responsive breakpoints.
- `e2e/playwright.config.ts` has one browser project using
  `devices["Desktop Chrome"]` — no touch emulation.

### Konva facts confirmed by reading `node_modules/konva` (v10.3.0)

These determine how much of the editor has to change, so they were checked in
source rather than assumed:

1. `Stage._bindContentEvents` maps native `touchstart`/`touchmove`/`touchend`
   **and** native `pointerdown`/`pointermove`/`pointerup` to the same internal
   handlers (`lib/Stage.js:11–22`).
2. Those handlers dispatch into **separate Konva event namespaces** chosen by
   `getEventType` / `getEventsMap` (`lib/Stage.js:67–86`): a native `touchstart`
   fires Konva `touchstart`, a native `pointerdown` fires Konva `pointerdown`.
   Since browsers fire both natively, **registering only `onPointerDown` covers
   mouse, touch, and pen with exactly one dispatch** — registering both
   `onPointerDown` and `onTouchStart` would double-handle.
3. `Konva.pointerEventsEnabled` defaults to `true` (`lib/Global.js:24`), so the
   pointer namespace is live without extra configuration.
4. `Node.prototype.draggable` binds via `'mousedown.konva touchstart.konva'`
   (`lib/Node.js:1408`) — **shape dragging already works with touch** once touch
   events reach the Stage. No per-shape change is needed for drag itself.

## Design

### A. Gesture recognition — `src/lib/touchGestures.ts` (new)

A pure reducer, no DOM and no React, so it is unit-testable under the existing
`environment: "node"` vitest config and the existing
`include: ["src/**/*.test.ts"]` glob. No test-config changes required.

Input: a snapshot of active touch points (`{id, clientX, clientY}[]`) plus the
previous snapshot. Output, one of:

- `{kind: "single"}` — exactly one finger; the caller passes the event through
  to Konva untouched.
- `{kind: "gesture", zoomFactor, panDx, panDy, midX, midY}` — two or more
  fingers. `zoomFactor` is the ratio of current to previous distance between the
  first two tracked fingers; `panDx`/`panDy` are the midpoint delta.
- `{kind: "cancel"}` — emitted once, on the transition from one finger to two,
  so the caller can abandon an in-progress draw or drag.
- `{kind: "idle"}` — no fingers.

Fingers are tracked by `Touch.identifier`, and the reducer keeps using the same
two identifiers for the life of the gesture. Lifting one of three fingers must
therefore not produce a zoom jump; that is an explicit test case.

### B. Gesture wiring — `src/hooks/useCanvasTouch.ts` (new)

Attaches `touchstart` / `touchmove` / `touchend` / `touchcancel` to the existing
`containerRef` with `{passive: false}`, feeds the reducer, and applies output
through the mechanisms that already exist — no second pan or zoom system:

- zoom → `zoomAtClient.current(zoomFactor, midX, midY)`
- pan → `el.scrollLeft -= panDx; el.scrollTop -= panDy`

On `{kind: "gesture"}` the hook calls `preventDefault()` and raises a
`gestureActive` ref. On `{kind: "cancel"}` it clears the in-progress `draft` and
calls `stage.stopDrag()` on any node Konva is currently dragging, so the first
finger's partial stroke or shape move does not survive into the pinch.

The hook takes `containerRef`, `stageRef`, and the `zoomAtClient` ref as
arguments and owns no editor state of its own.

### C. One-finger path — edits inside `EditorStage.tsx`

- Stage props: `onMouseDown`/`onMouseMove`/`onMouseUp` → `onPointerDown` /
  `onPointerMove` / `onPointerUp`. Per Konva fact (2) this fires for mouse and
  touch alike with a single dispatch.
- `handleMouseDown`'s `e.evt.button !== 0` guard becomes pointer-safe: a
  `PointerEvent` from touch reports `button === 0`, but the handler's typing must
  move from `KonvaEventObject<MouseEvent>` to `KonvaEventObject<PointerEvent>`
  and tolerate a missing `button`.
- The ~15 per-shape `onMouseDown` handlers become `onPointerDown`. This is a
  mechanical rename with no logic change; `draggable` needs nothing per Konva
  fact (4).
- Every Stage-level handler early-returns while `gestureActive` is set.

The middle-mouse pan and `wheel` effect (L407–475) stay exactly as they are —
they are mouse-specific and unaffected.

### D. Making room for the gestures

- `src/app/layout.tsx`: add a `viewport` export with `maximumScale: 1` and
  `userScalable: false`. **Required** — without it the browser's own pinch-zoom
  competes with ours and the canvas gesture becomes unusable.
- `touch-action: none` on the scroll container, so the browser does not claim
  the gesture before our listeners see it.
- `src/app/paste/page.tsx`: the `w-60 flex-none` sidebar is hidden below the
  `sm` breakpoint and reachable as a slide-over sheet; toolbar controls get a
  44px minimum hit target.

### Accepted trade-off

`userScalable: false` plus `touch-action: none` disables the operating system's
accessibility pinch-zoom for the **whole page**, not only the canvas. This is
accepted for phase 1 because the canvas has its own zoom with a wider range than
the browser's, and the alternative — scoping `touch-action` to the container and
leaving the viewport alone — leaves the page itself zoomable in a way that
fights the canvas gesture on some browsers. Revisit if it proves a problem in
practice.

## Verification

**Unit** — `src/lib/touchGestures.test.ts`:

- pinch apart produces `zoomFactor > 1`, pinch together `< 1`
- two fingers translating together produce pan with `zoomFactor ≈ 1`
- one finger → two fingers emits exactly one `cancel`
- with three fingers down, lifting one that is not a tracked finger produces no
  zoom jump
- all fingers up returns to `idle`

**E2E** — a second Playwright project `mobile` in `e2e/playwright.config.ts`
using `devices["Pixel 5"]` (which sets `hasTouch`), with specs under
`e2e/mobile/`:

- pinch changes the zoom indicator
- two-finger drag changes container scroll position
- one-finger drag with a draw tool active creates a shape
- one-finger drag on an existing shape moves it
- one finger landing then a second finger arriving leaves no stray shape

**Regression** — the existing `web` desktop project must pass unchanged. Because
pointer events also fire from a mouse, that suite is the real gate on section C.

`pnpm test:unit` and the full Playwright run must both be green, and
`cargo clippy --all-targets -- -D warnings` is unaffected (no Rust changes).

## Assumptions still to be proven during implementation

These follow from the Konva source read but have not been observed running on a
real device or emulator:

- Konva's `draggable` touch path behaves correctly while our container listener
  is also calling `preventDefault()` on `touchmove` during two-finger gestures.
  Konva's drag-and-drop module listens on `window`; if it processes prevented
  moves, the `cancel` transition in section B is what stops a shape from
  drifting mid-pinch. If that proves insufficient, the fallback is to
  `stopPropagation()` on the container listener during a gesture.
- `Konva.hitOnDragEnabled` defaults to `false` (`lib/Global.js:26`); no touch
  behaviour in this design depends on hit detection during a drag, but this is
  worth re-checking if shape drag feels unresponsive on device.
