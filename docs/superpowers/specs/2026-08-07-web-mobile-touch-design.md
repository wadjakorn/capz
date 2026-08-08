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
layout (bottom bar / bottom sheets). Deferred deliberately; revisit after phase
1 ships.

The feature targets the browser build. One change — the `viewport` export in
section D — lands in the shared root layout and therefore also applies to the
Tauri `editor` window. That is assessed as inert there (a Tauri webview has no
browser pinch-zoom to suppress) but it is not literally web-only, and no other
change touches the desktop build.

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
5. Konva's drag module binds `DD._drag` to **`window`** for both `mousemove`
   and `touchmove`, in the bubble phase (`lib/DragAndDrop.js:108–109`). Our
   container sits earlier in that bubble path, so `preventDefault()` there does
   **not** stop `DD._drag` from running — only `stopPropagation()` does. This
   dictates section B.
6. There are 14 `e.cancelBubble = true` sites among the per-shape handlers
   (e.g. EditorStage.tsx:1994, 2700), whose job is to stop a shape's press from
   reaching the Stage handler and deselecting or starting a draw. Konva
   bubbling is per-namespace, so shape handlers and Stage handlers **must move
   to the pointer namespace together**; converting only one side silently
   breaks all 14.

## Design

### A. Gesture recognition — `src/lib/touchGestures.ts` (new)

A pure reducer, no DOM and no React, so it is unit-testable under the existing
`environment: "node"` vitest config and the existing
`include: ["src/**/*.test.ts"]` glob. No test-config changes required.

Input: a snapshot of active contact points (`{id, clientX, clientY}[]`) plus the
previous snapshot. Output, one of:

- `{kind: "single"}` — exactly one finger; the caller passes the event through
  to Konva untouched.
- `{kind: "gesture", zoomFactor, panDx, panDy, midX, midY}` — two or more
  fingers. `zoomFactor` is the ratio of current to previous distance between the
  first two tracked fingers; `panDx`/`panDy` are the midpoint delta.
- `{kind: "cancel"}` — emitted once, on the transition from one finger to two,
  so the caller can abandon an in-progress draw or drag.
- `{kind: "idle"}` — no fingers.

Contacts are tracked by id, and the reducer keeps using the same two ids for
the life of the gesture. Lifting a third, untracked finger must therefore not
produce a zoom jump; that is an explicit test case.

### B. Gesture wiring — `src/hooks/useCanvasGestures.ts` (new)

**One event model.** Because section C moves every Konva handler to the pointer
namespace anyway, the container listener uses pointer events too — `pointerdown`
/ `pointermove` / `pointerup` / `pointercancel` with a `Map<pointerId, {x, y}>`
of live contacts — rather than a parallel `TouchEvent` implementation. That
keeps a single input model across the whole editor and gets stylus support for
free.

One `touchmove` listener is still required, for the reason in Konva fact (5):
`DD._drag` is bound to `window` for `touchmove`, and only `stopPropagation()`
on an earlier element stops it. So the hook registers, all on `containerRef`
with `{passive: false}`:

- the four pointer listeners above, which drive the reducer, and
- a `touchmove` listener whose sole job is `stopPropagation()` +
  `preventDefault()` while a gesture is active.

**Applying the result — one scroll write per frame.** `zoomAtClient`
(EditorStage.tsx:381–404) corrects scroll inside a `requestAnimationFrame`,
because the correction needs the container's `getBoundingClientRect()` *after*
the new scale has reflowed. That is fine for a discrete wheel tick, but wrong
for a ~60Hz pinch: each deferred correction would land a frame later and
overwrite the pan write for the same gesture, computed from a stale reference
position. The visible result is the point under the fingers drifting and the
image shaking — on the primary gesture of this feature.

The correction genuinely cannot be computed synchronously (the post-reflow rect
is not knowable at `pointermove` time in this layout, where changing the scale
resizes the sizer and moves the Stage). So instead of removing the rAF hop, the
gesture path **coalesces into it**:

- the reducer's output accumulates into a pending `{zoomFactor, panDx, panDy,
  midX, midY}`, and a single rAF flush is scheduled if one is not already
  pending;
- the flush applies the accumulated scale once via `setDisplayScale`, reads the
  post-reflow rect once, computes the anchor-preserving scroll target, subtracts
  the accumulated pan, and writes `el.scrollLeft` / `el.scrollTop` **once**.

Multiple `pointermove` events inside one frame therefore produce exactly one
scale change and one scroll write, in a known order — no interleaving.

The anchor arithmetic is extracted from `zoomAtClient` into a pure, per-axis
helper `src/lib/zoomAnchor.ts`, and `zoomAtClient` is refactored to call it, so
the wheel path and the pinch path share one definition of "keep this point
pinned" and cannot drift apart.

**Gesture start.** On the transition into `{kind: "gesture"}` the hook raises a
`gestureActive` ref, calls `stopPropagation()` + `preventDefault()`, invokes an
`onGestureStart` callback supplied by the caller, and calls `stage.stopDrag()`
on any node Konva is dragging.

**Contract.** The hook takes `{containerRef, stageRef, onGestureStart}` and
**returns** the `gestureActive` ref, which the Stage handlers in section C read.
It owns no editor state: clearing the in-progress `draft` is `EditorStage`'s job,
done from `onGestureStart`. This is what keeps the hook independently readable
and the reducer independently testable.

### C. One-finger path — edits inside `EditorStage.tsx`

- Stage props: `onMouseDown`/`onMouseMove`/`onMouseUp` → `onPointerDown` /
  `onPointerMove` / `onPointerUp`. Per Konva fact (2) this fires for mouse and
  touch alike with a single dispatch.
- `handleMouseDown`'s `e.evt.button !== 0` guard becomes pointer-safe: a
  `PointerEvent` from touch reports `button === 0`, but the handler's typing must
  move from `KonvaEventObject<MouseEvent>` to `KonvaEventObject<PointerEvent>`
  and tolerate a missing `button`.
- The 20 per-shape `onMouseDown` handlers become `onPointerDown`. This is a
  mechanical rename with no logic change; `draggable` needs nothing per Konva
  fact (4). Per Konva fact (6) this conversion and the Stage conversion above
  must land in the same change — a half-converted tree breaks `cancelBubble`.
- Every Stage-level handler early-returns while `gestureActive` is set.

The middle-mouse pan and `wheel` effect (L407–475) stay exactly as they are —
they are mouse-specific and unaffected.

### D. Making room for the gestures

- A `viewport` export with `maximumScale: 1` and `userScalable: false`.
  **Required** — without it the browser's own pinch-zoom competes with ours and
  the canvas gesture becomes unusable. Scoped to the `/paste` and `/editor`
  route segments rather than the root layout; see "Accepted trade-off" below.
- `touch-action: none` on the scroll container, so the browser does not claim
  the gesture before our listeners see it.
- `src/app/paste/page.tsx`: the `w-60 flex-none` sidebar is hidden below the
  `sm` breakpoint and reachable as a slide-over sheet; toolbar controls get a
  44px minimum hit target below `sm` via `max-sm:h-11` / `max-sm:w-11`. As
  shipped this covers `ToolButton`, `OverflowMenu`'s "More tools" trigger, both
  halves of `ExportSplitButton` and `CaptureSplitButton` (including the
  16px carets), `ZoomMenuButton`'s shared `HIT` class, and `PresetSlider`'s
  preset buttons.

  Note the coupling: the tool palette is `flex-1 min-w-0` in the same toolbar
  row, so widening a sibling shrinks it and pushes more tools into the overflow
  menu. `Toolbar.tsx`'s `useOverflowSlots` call measures the palette's own
  `clientWidth`, so that stays correct automatically — but `OverflowMenu`'s
  trigger must keep matching `ToolButton`'s size, because the hook reserves
  exactly one slot for it. On the Pixel 5 e2e viewport the palette ends up
  102px, fitting one tool plus the trigger.

### Accepted trade-off

`userScalable: false` plus `touch-action: none` disables the operating system's
accessibility pinch-zoom. That is accepted **only on the routes that own a
canvas**, because only there is the argument for it true: the canvas provides
its own zoom over a wider range than the browser's, and the alternative —
scoping `touch-action` to the container and leaving the viewport alone — leaves
the page itself zoomable in a way that fights the canvas gesture on some
browsers.

The argument does **not** extend to `/`, the public marketing landing page,
which renders `<Landing />` with no canvas and so no substitute zoom at all;
locking the viewport there would be a plain WCAG 1.4.4 failure on the app's
most-visited URL. So as shipped, the `viewport` export lives in
`src/app/paste/layout.tsx` and `src/app/editor/layout.tsx` (both re-exporting
`canvasViewport` from `src/lib/canvasViewport.ts`), **not** in the root layout.
Verified against the static export: `out/index.html` carries
`width=device-width, initial-scale=1`, while `out/paste/index.html` and
`out/editor/index.html` add `maximum-scale=1, user-scalable=no`.

This supersedes the note in the preamble above: the change no longer lands in
the shared root layout, though it still reaches the Tauri `editor` window,
where it remains inert.

## Verification

**Unit** — `src/lib/touchGestures.test.ts`:

- pinch apart produces `zoomFactor > 1`, pinch together `< 1`
- two fingers translating together produce pan with `zoomFactor ≈ 1`
- one finger → two fingers emits exactly one `cancel`
- with three fingers down, lifting one that is not a tracked finger produces no
  zoom jump
- all fingers up returns to `idle`

**Unit** — `src/lib/zoomAnchor.test.ts`: the extracted helper pins the anchor
point across a scale change, is identity when the scale does not change, and is
inert when the old scale is zero.

**E2E** — a second Playwright project `mobile` in `e2e/playwright.config.ts`
using `devices["Pixel 5"]` (which sets `hasTouch`), with specs under
`e2e/mobile/`.

Playwright 1.60 cannot express these gestures on its own: `interface
Touchscreen` exposes only `tap(x, y)` (checked in
`playwright-core@1.60.0/types/types.d.ts`), and `page.mouse` is single-contact
by definition. Multi-finger input must therefore go through CDP —
`context.newCDPSession(page)` then `Input.dispatchTouchEvent` with a two-entry
`touchPoints[]` for `touchStart` / `touchMove` / `touchEnd`. This is
Chromium-only, which is acceptable because the existing `web` project is
Chromium too. Write it once as `e2e/mobile/gestures.ts` exporting `pinch()` and
`twoFingerPan()` helpers; the specs below use those.

Specs:

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

- That `stopPropagation()` on the container's `touchmove` is sufficient to keep
  `DD._drag` from moving a shape mid-pinch. The listener placement is confirmed
  (`lib/DragAndDrop.js:109`) and the mechanism follows from DOM propagation
  rules, but it has not been run. `stage.stopDrag()` on gesture start is the
  belt-and-braces second line.
- ~~That Konva raises no `pointerdown` of its own that re-enters our Stage
  handlers during a gesture.~~ **Disproved during implementation, and fixed.**
  Konva's content div is a *descendant* of the gesture container, so for every
  press Konva dispatches its Stage `pointerdown` on the way up, *before* the
  container listener that would raise `gestureActive`. When the second finger
  lands, the Stage handler therefore runs with `gestureActive` still `false`.
  For draw tools that is harmless — they only build a `draft`, which
  `onGestureStart` then discards — but Sticker and Pin `add()` an annotation
  immediately (Pin also bumps `pins.lastUsedNumber`), Text opens the editor,
  and the empty-canvas branch clears the selection and resets the tool. None of
  that can be undone after the fact, so an early-return on `gestureActive`
  alone cannot fix it.

  The fix recognises the gesture one dispatch earlier instead: the hook now
  also returns a `contactCount` ref, and because the *first* finger's
  `pointerdown` has already been recorded by the time the *second* finger's
  Konva dispatch runs, "a contact is already live at `pointerdown` time" marks
  a press as a gesture's second contact. `EditorStage`'s `isGestureContact()`
  combines that with `gestureActive`; `handlePointerDown` and the shared
  `ctx.onSelect` (guarded once for all ~20 per-shape handlers) bail on it. The
  first finger and every mouse press see `contactCount === 0` and are
  unaffected. Covered by the "a second finger landing with the Pin tool commits
  no pin" e2e spec, which was confirmed to fail without the guard.
- `Konva.hitOnDragEnabled` defaults to `false` (`lib/Global.js:26`); no touch
  behaviour in this design depends on hit detection during a drag, but this is
  worth re-checking if shape drag feels unresponsive on device.
- That CDP `Input.dispatchTouchEvent` produces `pointermove` events (not only
  `touchmove`) in headless Chromium. If it does not, the container listener in
  section B falls back to the touch model for its contact tracking; the reducer
  in section A is unaffected either way, since it takes plain objects.
