# Web Editor Mobile Touch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the browser editor at `/paste` usable on a phone — two fingers pinch-zoom and pan the canvas, one finger selects, drags, and draws.

**Architecture:** Gesture recognition lives in a pure reducer (`src/lib/touchGestures.ts`) with no DOM knowledge, driven by a hook (`src/hooks/useCanvasGestures.ts`) that listens on the existing scroll container and applies results through the container's existing scroll/zoom mechanisms. Inside `EditorStage.tsx`, every Konva mouse handler moves to the pointer namespace so one finger reaches the same code a mouse does. No new zoom or pan system is introduced.

**Tech Stack:** Next.js 15 static export, TypeScript 5 strict, react-konva + konva 10.3.0, Zustand 5, Tailwind 4, Vitest (node environment), Playwright 1.60.

**Spec:** `docs/superpowers/specs/2026-08-07-web-mobile-touch-design.md`

## Global Constraints

- Package manager is **pnpm 9**. Never `npm` or `yarn`.
- No new runtime dependencies. Everything here uses konva 10.3.0, React, and the DOM.
- **No `localStorage` / `sessionStorage`.** Not needed by this work; do not introduce it.
- TypeScript strict mode. `pnpm test:unit` must pass; the existing Playwright `web` project must stay green — it is the regression gate for the pointer conversion.
- Vitest is configured `environment: "node"` with `include: ["src/**/*.test.ts"]`. Unit tests must be `.ts` (not `.tsx`) and must not touch the DOM. Do not modify `vitest.config.ts`.
- Conventional commits. This is a web-only feature; no Rust changes, so `cargo clippy` is unaffected.
- Konva facts this plan depends on, already verified in the spec: `Konva.pointerEventsEnabled` defaults `true`; `draggable` binds `touchstart.konva`; `DD._drag` is a **window** `touchmove` listener in the bubble phase; Konva event bubbling is per-namespace.

---

### Task 1: Extract the zoom-anchor arithmetic

Pull the "keep the point under the cursor pinned" math out of `zoomAtClient` into a pure per-axis helper, so the wheel path and the coming pinch path share one definition. Behaviour must not change.

**Files:**
- Create: `src/lib/zoomAnchor.ts`
- Create: `src/lib/zoomAnchor.test.ts`
- Modify: `src/components/editor/EditorStage.tsx:381-404`

**Interfaces:**
- Consumes: nothing.
- Produces: `anchoredScrollOffset(current: number, anchorClient: number, rectBefore: number, rectAfter: number, oldScale: number, newScale: number): number` — the new value for one scroll axis.

- [ ] **Step 1: Write the failing test**

Create `src/lib/zoomAnchor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { anchoredScrollOffset } from "./zoomAnchor";

describe("anchoredScrollOffset", () => {
  it("is identity when the scale does not change and the rect has not moved", () => {
    expect(anchoredScrollOffset(120, 400, 50, 50, 2, 2)).toBe(120);
  });

  it("pins the anchor point when zooming in", () => {
    // Anchor 350px right of the container's left edge, at scale 2 → image x=175.
    // At scale 4 that point sits 700px right of the edge, so the content must
    // scroll 350px further right to keep it under the finger.
    expect(anchoredScrollOffset(0, 400, 50, 50, 2, 4)).toBe(350);
  });

  it("pins the anchor point when zooming out", () => {
    expect(anchoredScrollOffset(350, 400, 50, 50, 4, 2)).toBe(175);
  });

  it("accounts for the container rect moving during the reflow", () => {
    // Same zoom as the zoom-in case, but the rect shifted 20px left afterwards.
    expect(anchoredScrollOffset(0, 400, 50, 30, 2, 4)).toBe(330);
  });

  it("is inert when the old scale is zero (the fit sentinel)", () => {
    expect(anchoredScrollOffset(120, 400, 50, 90, 0, 4)).toBe(120);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test:unit src/lib/zoomAnchor.test.ts`
Expected: FAIL — cannot resolve `./zoomAnchor`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/zoomAnchor.ts`:

```ts
/**
 * New scroll offset for one axis that keeps the image-coordinate point under
 * `anchorClient` pinned across a scale change.
 *
 * `rectBefore` / `rectAfter` are the container's bounding-rect edge on this
 * axis before and after the new scale has reflowed — the rect moves because
 * changing the scale resizes the sizer around the Stage.
 *
 * Shared by the wheel path and the pinch path so the two cannot drift apart.
 */
export function anchoredScrollOffset(
  current: number,
  anchorClient: number,
  rectBefore: number,
  rectAfter: number,
  oldScale: number,
  newScale: number,
): number {
  // scale 0 is the store's "re-fit on next paint" sentinel; nothing to pin to.
  if (oldScale <= 0) return current;
  const ratio = newScale / oldScale;
  return (
    current + rectAfter - anchorClient + (anchorClient - rectBefore) * ratio
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test:unit src/lib/zoomAnchor.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Refactor `zoomAtClient` to use the helper**

In `src/components/editor/EditorStage.tsx`, add to the imports near the other `@/lib` imports:

```ts
import { anchoredScrollOffset } from "@/lib/zoomAnchor";
```

Then replace the body of the `zoomAtClient.current` assignment (currently EditorStage.tsx:385-403) with:

```ts
    zoomAtClient.current = (factor: number, clientX: number, clientY: number) => {
      const el = containerRef.current;
      const stage = stageRef.current;
      if (!el || !stage) return;
      const oldScale = useEditor.getState().displayScale || 1;
      const newScale = clampZoom(oldScale * factor);
      if (newScale === oldScale) return;
      const r0 = stage.container().getBoundingClientRect();
      setDisplayScale(newScale);
      requestAnimationFrame(() => {
        const r1 = stage.container().getBoundingClientRect();
        el.scrollLeft = anchoredScrollOffset(
          el.scrollLeft,
          clientX,
          r0.left,
          r1.left,
          oldScale,
          newScale,
        );
        el.scrollTop = anchoredScrollOffset(
          el.scrollTop,
          clientY,
          r0.top,
          r1.top,
          oldScale,
          newScale,
        );
      });
    };
```

This is algebraically the same as the code it replaces: the old form computed
`imgX = (clientX - r0.left) / oldScale`, then `wantLeft = clientX - imgX * newScale`, then `el.scrollLeft += r1.left - wantLeft`. Substituting gives `el.scrollLeft + r1.left - clientX + (clientX - r0.left) * (newScale / oldScale)`, which is the helper.

- [ ] **Step 6: Verify no behaviour change**

Run: `pnpm test:unit`
Expected: PASS, including the existing `src/stores/editor.zoom.test.ts`.

Run: `pnpm test:e2e:web`
Expected: PASS — the existing desktop suite is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/lib/zoomAnchor.ts src/lib/zoomAnchor.test.ts src/components/editor/EditorStage.tsx
git commit -m "refactor(editor): extract zoom anchor math into a pure helper"
```

---

### Task 2: Convert Konva handlers to the pointer namespace

One finger must reach the same code a mouse does. Konva dispatches native `pointerdown` into its own `pointer` namespace, which fires for mouse, touch, and pen alike. **The Stage handlers and all per-shape handlers must convert together** — Konva bubbling is per-namespace, so a half-converted tree silently breaks the 14 `e.cancelBubble = true` guards that stop a shape press from reaching the Stage and deselecting.

**Files:**
- Modify: `src/components/editor/EditorStage.tsx` — Stage props at 1385-1392, `handleMouseDown` at 912, `handleMouseMove` at 1087, `handleMouseUp` at 1105, and all 20 `onMouseDown` sites.

**Interfaces:**
- Consumes: `anchoredScrollOffset` (unused here, from Task 1's commit).
- Produces: Stage props `onPointerDown` / `onPointerMove` / `onPointerUp`; handler names `handlePointerDown` / `handlePointerMove` / `handlePointerUp`; every shape handler prop renamed `onPointerDown` with signature `(e: Konva.KonvaEventObject<PointerEvent>) => void`.

- [ ] **Step 1: Add an e2e test that fails on touch today**

Create `e2e/mobile/` and add `e2e/mobile/draw.spec.ts`. This test uses only single-finger tap/drag, which Playwright can do natively via `page.touchscreen.tap` plus CDP-free mouse-less input — so it can be written before Task 6's CDP helpers exist:

```ts
import { test, expect } from "@playwright/test";

test("one-finger drag with the rect tool creates a shape", async ({ page }) => {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");

  // Load a deterministic image through the app's own paste path.
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#3355ff";
    ctx.fillRect(0, 0, 400, 300);
    const blob: Blob = await new Promise((r) =>
      canvas.toBlob((b) => r(b!), "image/png"),
    );
    window.dispatchEvent(
      new CustomEvent("capz:web-paste", { detail: { blob } }),
    );
  });
  await expect(page.locator("canvas").first()).toBeVisible();

  await page.getByRole("button", { name: /rect|rectangle/i }).first().click();

  const box = (await page.locator("canvas").first().boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const at = (dx: number, dy: number) => [
    { x: box.x + dx, y: box.y + dy, radiusX: 1, radiusY: 1, force: 1, id: 1 },
  ];
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: at(60, 60),
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: at(160, 140),
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  // The rect tool auto-returns to select and selects the new shape, so an
  // annotation now exists: undo becomes available.
  await expect(page.getByRole("button", { name: /undo/i })).toBeEnabled();
});
```

- [ ] **Step 2: Register the `mobile` Playwright project so the test can run**

In `e2e/playwright.config.ts`, insert this entry into the `projects` array immediately after the `web` entry:

```ts
    {
      name: "mobile",
      testMatch: /mobile\/.*\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
    },
```

Then add the matching script to `package.json`, beside the existing `test:e2e:web` on line 22, so this suite is invoked the same way as every other project in the repo:

```json
    "test:e2e:mobile": "playwright test -c e2e/playwright.config.ts --project=mobile",
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `pnpm test:e2e:mobile`
Expected: FAIL — the undo button stays disabled, because `handleMouseDown` is bound to the mouse namespace and a touch never reaches it.

- [ ] **Step 4: Convert the Stage handlers**

In `src/components/editor/EditorStage.tsx`, rename the three functions and widen their event types:

```ts
  function isEmptyTarget(e: Konva.KonvaEventObject<PointerEvent>): boolean {
    const t = e.target;
    return t === t.getStage() || t.name() === "bg-image";
  }

  function handlePointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
```

Inside `handlePointerDown`, replace the primary-button guard (currently `if (e.evt.button !== 0) return;`) with a form that is correct for touch — a `PointerEvent` from a finger reports `button === 0`, but guard defensively for synthetic events that omit it:

```ts
    if ((e.evt.button ?? 0) !== 0) return;
```

Rename `handleMouseMove` → `handlePointerMove` and `handleMouseUp` → `handlePointerUp`. Their bodies take no arguments and need no other change.

Then update the Stage props (currently EditorStage.tsx:1389-1392):

```tsx
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onMouseLeave={() => setBrushPoint(null)}
```

`onMouseLeave` stays as-is: it clears the highlighter brush preview, which is a mouse-only affordance.

- [ ] **Step 5: Convert the per-shape handlers**

Every remaining `onMouseDown` inside `EditorStage.tsx` becomes `onPointerDown`, and every `Konva.KonvaEventObject<MouseEvent>` annotation on those handlers becomes `Konva.KonvaEventObject<PointerEvent>`. The bodies do not change — including all 14 `e.cancelBubble = true` lines, which keep working because both sides of the bubble now live in the pointer namespace.

Find every site with:

```bash
grep -n "onMouseDown" src/components/editor/EditorStage.tsx
```

Expected: 20 sites (including the Stage prop already handled in Step 4, leaving 19 shape sites). Two representative examples, at EditorStage.tsx:1993 and EditorStage.tsx:2699:

```ts
    onPointerDown: (e: Konva.KonvaEventObject<PointerEvent>) => {
      e.cancelBubble = true;
      ctx.onSelect();
    },
```

```tsx
      onPointerDown={(e) => {
        e.cancelBubble = true;
        ctx.onSelect();
      }}
```

Leave `onDblClick`, `onDragMove`, `onDragEnd`, and the `hoverHandlers(ctx)` spread untouched — Konva's drag machinery binds `touchstart.konva` itself and already works with a finger.

- [ ] **Step 6: Verify the grep is clean**

Run: `grep -c "onMouseDown\|KonvaEventObject<MouseEvent>" src/components/editor/EditorStage.tsx`
Expected: `0`.

- [ ] **Step 7: Run the tests**

Run: `pnpm test:unit`
Expected: PASS.

Run: `pnpm test:e2e:mobile`
Expected: PASS — one-finger drawing now works.

Run: `pnpm test:e2e:web`
Expected: PASS — this is the real gate. Pointer events fire from a mouse too, so any breakage in select/draw/drag on desktop surfaces here.

- [ ] **Step 8: Commit**

```bash
git add src/components/editor/EditorStage.tsx e2e/playwright.config.ts e2e/mobile/draw.spec.ts
git commit -m "feat(editor): route Konva input through the pointer namespace

One finger now reaches the same handlers a mouse does. Stage and all
per-shape handlers convert together: Konva bubbling is per-namespace, so
a half-converted tree would break the cancelBubble guards."
```

---

### Task 3: The gesture reducer

A pure state machine over contact points. No DOM, no React, no Konva — so it runs under the existing node-environment Vitest config.

**Files:**
- Create: `src/lib/touchGestures.ts`
- Create: `src/lib/touchGestures.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Contact = { id: number; x: number; y: number }`
  - `type GestureState = { trackedIds: [number, number] | null; lastDistance: number; lastMidX: number; lastMidY: number }`
  - `type GestureResult = { kind: "idle" } | { kind: "single" } | { kind: "cancel" } | { kind: "gesture"; zoomFactor: number; panDx: number; panDy: number; midX: number; midY: number }`
  - `initialGestureState(): GestureState`
  - `stepGesture(state: GestureState, contacts: Contact[]): { state: GestureState; result: GestureResult }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/touchGestures.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  initialGestureState,
  stepGesture,
  type Contact,
  type GestureState,
} from "./touchGestures";

// Feed a sequence of contact snapshots, return every result in order.
function run(frames: Contact[][]) {
  let state: GestureState = initialGestureState();
  return frames.map((contacts) => {
    const out = stepGesture(state, contacts);
    state = out.state;
    return out.result;
  });
}

const c = (id: number, x: number, y: number): Contact => ({ id, x, y });

describe("stepGesture", () => {
  it("reports idle with no contacts", () => {
    expect(run([[]])).toEqual([{ kind: "idle" }]);
  });

  it("reports single for one contact and does not latch", () => {
    const out = run([[c(1, 10, 10)], [c(1, 40, 60)]]);
    expect(out).toEqual([{ kind: "single" }, { kind: "single" }]);
  });

  it("emits exactly one cancel when a second contact arrives", () => {
    const out = run([
      [c(1, 0, 0)],
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 0, 0), c(2, 100, 0)],
    ]);
    expect(out[0]).toEqual({ kind: "single" });
    expect(out[1]).toEqual({ kind: "cancel" });
    expect(out[2].kind).toBe("gesture");
  });

  it("reports zoomFactor > 1 when the contacts spread apart", () => {
    const out = run([
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 0, 0), c(2, 200, 0)],
    ]);
    const last = out[2];
    if (last.kind !== "gesture") throw new Error("expected a gesture");
    expect(last.zoomFactor).toBeCloseTo(2);
    expect(last.panDx).toBeCloseTo(50); // midpoint moved 50 to the right
  });

  it("reports zoomFactor < 1 when the contacts come together", () => {
    const out = run([
      [c(1, 0, 0), c(2, 200, 0)],
      [c(1, 0, 0), c(2, 200, 0)],
      [c(1, 0, 0), c(2, 100, 0)],
    ]);
    const last = out[2];
    if (last.kind !== "gesture") throw new Error("expected a gesture");
    expect(last.zoomFactor).toBeCloseTo(0.5);
  });

  it("reports pure pan with zoomFactor 1 when both contacts translate together", () => {
    const out = run([
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 30, 20), c(2, 130, 20)],
    ]);
    const last = out[2];
    if (last.kind !== "gesture") throw new Error("expected a gesture");
    expect(last.zoomFactor).toBeCloseTo(1);
    expect(last.panDx).toBeCloseTo(30);
    expect(last.panDy).toBeCloseTo(20);
  });

  it("ignores a third contact — no zoom jump when it lands or lifts", () => {
    const out = run([
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 0, 0), c(2, 100, 0), c(3, 500, 500)],
      [c(1, 0, 0), c(2, 100, 0)],
    ]);
    for (const r of out.slice(2)) {
      if (r.kind !== "gesture") throw new Error("expected a gesture");
      expect(r.zoomFactor).toBeCloseTo(1);
      expect(r.panDx).toBeCloseTo(0);
    }
  });

  it("re-anchors instead of jumping when a tracked contact lifts and two remain", () => {
    const out = run([
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 0, 0), c(2, 100, 0), c(3, 400, 0)],
      [c(2, 100, 0), c(3, 400, 0)], // contact 1 lifted; now tracking 2 and 3
    ]);
    const last = out[2];
    if (last.kind !== "gesture") throw new Error("expected a gesture");
    expect(last.zoomFactor).toBeCloseTo(1);
    expect(last.panDx).toBeCloseTo(0);
  });

  it("returns to idle when every contact lifts", () => {
    const out = run([[c(1, 0, 0), c(2, 100, 0)], []]);
    expect(out[1]).toEqual({ kind: "idle" });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test:unit src/lib/touchGestures.test.ts`
Expected: FAIL — cannot resolve `./touchGestures`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/touchGestures.ts`:

```ts
/**
 * Pure gesture recognition over contact points. No DOM, no React, no Konva —
 * the caller supplies snapshots and applies the results.
 *
 * Model: two fingers zoom and pan the canvas; one finger is passed through to
 * the content (select / drag / draw).
 */

export type Contact = { id: number; x: number; y: number };

export type GestureState = {
  /** The two contacts this gesture is anchored to, or null when not gesturing. */
  trackedIds: [number, number] | null;
  lastDistance: number;
  lastMidX: number;
  lastMidY: number;
};

export type GestureResult =
  | { kind: "idle" }
  | { kind: "single" }
  /** One finger became two: abandon any in-progress draw or shape drag. */
  | { kind: "cancel" }
  | {
      kind: "gesture";
      zoomFactor: number;
      panDx: number;
      panDy: number;
      midX: number;
      midY: number;
    };

export function initialGestureState(): GestureState {
  return { trackedIds: null, lastDistance: 0, lastMidX: 0, lastMidY: 0 };
}

function find(contacts: Contact[], id: number): Contact | undefined {
  return contacts.find((p) => p.id === id);
}

function measure(a: Contact, b: Contact) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    distance: Math.hypot(dx, dy),
    midX: (a.x + b.x) / 2,
    midY: (a.y + b.y) / 2,
  };
}

function anchor(a: Contact, b: Contact): GestureState {
  const m = measure(a, b);
  return {
    trackedIds: [a.id, b.id],
    lastDistance: m.distance,
    lastMidX: m.midX,
    lastMidY: m.midY,
  };
}

export function stepGesture(
  state: GestureState,
  contacts: Contact[],
): { state: GestureState; result: GestureResult } {
  if (contacts.length === 0) {
    return { state: initialGestureState(), result: { kind: "idle" } };
  }

  if (contacts.length === 1) {
    return { state: initialGestureState(), result: { kind: "single" } };
  }

  // Keep following the same two contacts for the life of the gesture, so a
  // third finger landing or lifting produces no jump.
  const a = state.trackedIds ? find(contacts, state.trackedIds[0]) : undefined;
  const b = state.trackedIds ? find(contacts, state.trackedIds[1]) : undefined;

  if (!a || !b) {
    // Either the gesture is just starting, or a tracked contact lifted while
    // two or more remain. Re-anchor on the first two and emit no motion this
    // frame — re-anchoring must never be mistaken for a pinch.
    const next = anchor(contacts[0], contacts[1]);
    if (state.trackedIds === null) {
      // One finger just became two: tell the caller to drop what it was doing.
      return { state: next, result: { kind: "cancel" } };
    }
    return {
      state: next,
      result: {
        kind: "gesture",
        zoomFactor: 1,
        panDx: 0,
        panDy: 0,
        midX: next.lastMidX,
        midY: next.lastMidY,
      },
    };
  }

  const m = measure(a, b);
  // A zero previous distance would divide by zero; treat it as no zoom.
  const zoomFactor =
    state.lastDistance > 0 ? m.distance / state.lastDistance : 1;

  return {
    state: {
      trackedIds: state.trackedIds,
      lastDistance: m.distance,
      lastMidX: m.midX,
      lastMidY: m.midY,
    },
    result: {
      kind: "gesture",
      zoomFactor,
      panDx: m.midX - state.lastMidX,
      panDy: m.midY - state.lastMidY,
      midX: m.midX,
      midY: m.midY,
    },
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test:unit src/lib/touchGestures.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/touchGestures.ts src/lib/touchGestures.test.ts
git commit -m "feat(editor): add a pure two-finger gesture reducer"
```

---

### Task 4: Wire the gestures to the canvas

Attach the reducer to the scroll container, coalesce its output into one scroll write per frame, and stop Konva's window-level drag handler from moving a shape mid-pinch.

**Files:**
- Create: `src/hooks/useCanvasGestures.ts`
- Modify: `src/components/editor/EditorStage.tsx` — call the hook, add `touch-action`, add the `gestureActive` early-returns.
- Modify: `src/app/layout.tsx` — add the `viewport` export.

**Interfaces:**
- Consumes: `initialGestureState`, `stepGesture`, `Contact`, `GestureResult` (Task 3); `anchoredScrollOffset` (Task 1); `handlePointerDown` / `handlePointerMove` / `handlePointerUp` (Task 2).
- Produces: `useCanvasGestures(opts: { containerRef: RefObject<HTMLDivElement | null>; stageRef: RefObject<Konva.Stage | null>; onGestureStart: () => void }): RefObject<boolean>` — returns the `gestureActive` ref.

- [ ] **Step 1: Write the failing e2e tests**

Create `e2e/mobile/gestures.ts` — the shared CDP helpers. Playwright 1.60's `Touchscreen` exposes only `tap(x, y)` (checked in `playwright-core@1.60.0/types/types.d.ts`), so multi-finger input has to go through the Chrome DevTools Protocol:

```ts
import type { Page } from "@playwright/test";

type Pt = { x: number; y: number };

const point = (p: Pt, id: number) => ({
  x: p.x,
  y: p.y,
  radiusX: 1,
  radiusY: 1,
  force: 1,
  id,
});

/** Move two contacts from `from` to `to` over `steps` frames. */
export async function twoFingerDrag(
  page: Page,
  from: [Pt, Pt],
  to: [Pt, Pt],
  steps = 10,
) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(from[0], 1), point(from[1], 2)],
  });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const lerp = (a: Pt, b: Pt): Pt => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(lerp(from[0], to[0]), 1), point(lerp(from[1], to[1]), 2)],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

/** Pinch centred on `center`: contacts start `from` apart and end `to` apart. */
export async function pinch(page: Page, center: Pt, from: number, to: number) {
  await twoFingerDrag(
    page,
    [
      { x: center.x - from / 2, y: center.y },
      { x: center.x + from / 2, y: center.y },
    ],
    [
      { x: center.x - to / 2, y: center.y },
      { x: center.x + to / 2, y: center.y },
    ],
  );
}
```

Create `e2e/mobile/zoom-pan.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { pinch, twoFingerDrag } from "./gestures";

async function loadImage(page: import("@playwright/test").Page) {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#3355ff";
    ctx.fillRect(0, 0, 1200, 900);
    const blob: Blob = await new Promise((r) =>
      canvas.toBlob((b) => r(b!), "image/png"),
    );
    window.dispatchEvent(new CustomEvent("capz:web-paste", { detail: { blob } }));
  });
  await expect(page.locator("canvas").first()).toBeVisible();
}

/** The zoom percentage the toolbar reports, e.g. "125%" → 125. */
async function zoomPercent(page: import("@playwright/test").Page) {
  const text = await page.getByText(/\d+\s*%/).first().innerText();
  return Number(text.replace(/[^\d]/g, ""));
}

test("pinching apart increases the zoom level", async ({ page }) => {
  await loadImage(page);
  const before = await zoomPercent(page);
  const box = (await page.locator("canvas").first().boundingBox())!;
  await pinch(
    page,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    80,
    240,
  );
  await expect.poll(() => zoomPercent(page)).toBeGreaterThan(before);
});

test("pinching together decreases the zoom level", async ({ page }) => {
  await loadImage(page);
  const box = (await page.locator("canvas").first().boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await pinch(page, center, 80, 300);
  const zoomed = await zoomPercent(page);
  await pinch(page, center, 300, 80);
  await expect.poll(() => zoomPercent(page)).toBeLessThan(zoomed);
});

test("two-finger drag pans without changing zoom", async ({ page }) => {
  await loadImage(page);
  const box = (await page.locator("canvas").first().boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // Zoom in first so there is somewhere to pan to.
  await pinch(page, center, 60, 320);
  const zoomed = await zoomPercent(page);

  const scrollOf = () =>
    page.evaluate(() => {
      const el = document.querySelector(".overflow-auto") as HTMLElement | null;
      return el ? { left: el.scrollLeft, top: el.scrollTop } : null;
    });
  const before = await scrollOf();

  await twoFingerDrag(
    page,
    [
      { x: center.x - 40, y: center.y },
      { x: center.x + 40, y: center.y },
    ],
    [
      { x: center.x - 140, y: center.y - 80 },
      { x: center.x - 60, y: center.y - 80 },
    ],
  );

  await expect.poll(async () => (await scrollOf())!.left).not.toBe(before!.left);
  expect(await zoomPercent(page)).toBe(zoomed);
});

test("a second finger landing mid-stroke leaves no stray shape", async ({
  page,
}) => {
  await loadImage(page);
  await page.getByRole("button", { name: /rect|rectangle/i }).first().click();
  const box = (await page.locator("canvas").first().boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const pt = (x: number, y: number, id: number) => ({
    x: box.x + x,
    y: box.y + y,
    radiusX: 1,
    radiusY: 1,
    force: 1,
    id,
  });

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [pt(60, 60, 1)],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [pt(90, 90, 1)],
  });
  // Second finger arrives → the partial rect must be abandoned.
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [pt(90, 90, 1), pt(220, 200, 2)],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [pt(70, 70, 1), pt(260, 240, 2)],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  await expect(page.getByRole("button", { name: /undo/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test:e2e:mobile zoom-pan`
Expected: FAIL — nothing listens for the second contact, so zoom never changes.

- [ ] **Step 3: Add the viewport export**

In `src/app/layout.tsx`, add alongside the existing `metadata` export:

```ts
import type { Viewport } from "next";

// The canvas owns pinch-zoom (with a far wider range than the browser's), so
// the browser's own page zoom must not compete with it. This is the root
// layout, so it also covers the Tauri editor window, where it is inert.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};
```

- [ ] **Step 4: Write the hook**

Create `src/hooks/useCanvasGestures.ts`:

```ts
"use client";

import { useEffect, useRef, type RefObject } from "react";
import type Konva from "konva";
import { useEditor, clampZoom } from "@/stores/editor";
import { anchoredScrollOffset } from "@/lib/zoomAnchor";
import {
  initialGestureState,
  stepGesture,
  type Contact,
  type GestureState,
} from "@/lib/touchGestures";

type Options = {
  containerRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<Konva.Stage | null>;
  /** Called once when one contact becomes two: drop any in-progress draw. */
  onGestureStart: () => void;
};

/**
 * Two-finger pinch-zoom and pan on the canvas container.
 *
 * Contacts are tracked with pointer events, the same input model the Konva
 * handlers use. One extra `touchmove` listener exists solely to stop Konva's
 * drag module: it binds `DD._drag` to `window` in the bubble phase
 * (konva/lib/DragAndDrop.js:109), and preventDefault does not stop it —
 * only stopPropagation from an element earlier in the path does.
 *
 * Returns the `gestureActive` ref, which the Stage handlers read to bail out
 * while two fingers are down.
 */
export function useCanvasGestures({
  containerRef,
  stageRef,
  onGestureStart,
}: Options): RefObject<boolean> {
  const gestureActive = useRef(false);
  // Kept in a ref so the effect below never re-subscribes on re-render.
  const onGestureStartRef = useRef(onGestureStart);
  onGestureStartRef.current = onGestureStart;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const contacts = new Map<number, Contact>();
    let state: GestureState = initialGestureState();

    // Accumulated between frames; flushed once per rAF so a burst of
    // pointermove events produces exactly one scale change and one scroll
    // write, in a known order.
    let pendingZoom = 1;
    let pendingPanX = 0;
    let pendingPanY = 0;
    let pendingMidX = 0;
    let pendingMidY = 0;
    let frame = 0;

    const flush = () => {
      frame = 0;
      const stage = stageRef.current;
      if (!el || !stage) return;

      const zoomFactor = pendingZoom;
      const panDx = pendingPanX;
      const panDy = pendingPanY;
      const anchorX = pendingMidX;
      const anchorY = pendingMidY;
      pendingZoom = 1;
      pendingPanX = 0;
      pendingPanY = 0;

      const oldScale = useEditor.getState().displayScale || 1;
      const newScale = clampZoom(oldScale * zoomFactor);
      const r0 = stage.container().getBoundingClientRect();

      if (newScale !== oldScale) {
        useEditor.getState().setDisplayScale(newScale);
      }

      // The container rect moves when the scale reflows the sizer, so the
      // anchor correction has to read it after that paint.
      requestAnimationFrame(() => {
        const r1 = stage.container().getBoundingClientRect();
        el.scrollLeft =
          anchoredScrollOffset(
            el.scrollLeft,
            anchorX,
            r0.left,
            r1.left,
            oldScale,
            newScale,
          ) - panDx;
        el.scrollTop =
          anchoredScrollOffset(
            el.scrollTop,
            anchorY,
            r0.top,
            r1.top,
            oldScale,
            newScale,
          ) - panDy;
      });
    };

    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(flush);
    };

    const endGesture = () => {
      gestureActive.current = false;
      state = initialGestureState();
    };

    const apply = () => {
      const out = stepGesture(state, [...contacts.values()]);
      state = out.state;
      const r = out.result;

      if (r.kind === "idle" || r.kind === "single") {
        endGesture();
        return;
      }

      if (r.kind === "cancel") {
        gestureActive.current = true;
        onGestureStartRef.current();
        // Belt and braces: stopPropagation on touchmove is the primary defence
        // against DD._drag, this drops any drag Konva already started.
        stageRef.current?.stopDrag();
        return;
      }

      gestureActive.current = true;
      pendingZoom *= r.zoomFactor;
      pendingPanX += r.panDx;
      pendingPanY += r.panDy;
      pendingMidX = r.midX;
      pendingMidY = r.midY;
      schedule();
    };

    const onPointerDown = (e: PointerEvent) => {
      contacts.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
      apply();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!contacts.has(e.pointerId)) return;
      contacts.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
      apply();
    };

    const onPointerUp = (e: PointerEvent) => {
      contacts.delete(e.pointerId);
      apply();
    };

    // Only reason this exists: stop Konva's window-level DD._drag mid-pinch.
    const onTouchMove = (e: TouchEvent) => {
      if (!gestureActive.current) return;
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [containerRef, stageRef]);

  return gestureActive;
}
```

- [ ] **Step 5: Call the hook from `EditorStage`**

In `src/components/editor/EditorStage.tsx`, add the import:

```ts
import { useCanvasGestures } from "@/hooks/useCanvasGestures";
```

Then, immediately after the `zoomAtClient` effect (after EditorStage.tsx:404), add:

```ts
  const gestureActive = useCanvasGestures({
    containerRef,
    stageRef,
    onGestureStart: () => {
      // A second finger landed: abandon whatever the first was drawing.
      setDraft(null);
      setBrushPoint(null);
    },
  });
```

- [ ] **Step 6: Bail out of the Stage handlers during a gesture**

Add this line as the first statement of `handlePointerDown`, `handlePointerMove`, and `handlePointerUp`:

```ts
    if (gestureActive.current) return;
```

In `handlePointerDown` it goes above the existing OCR-mode check, so nothing else runs.

- [ ] **Step 7: Take the gestures away from the browser**

In `src/components/editor/EditorStage.tsx`, add `touch-action: none` to the scroll container (currently EditorStage.tsx:1352-1355) so the browser does not claim the gesture before the listeners see it:

```tsx
    <div
      ref={containerRef}
      style={{ touchAction: "none" }}
      className="relative h-full w-full overflow-auto bg-[var(--bg-canvas)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
```

- [ ] **Step 8: Run the tests**

Run: `pnpm test:unit`
Expected: PASS.

Run: `pnpm test:e2e:mobile`
Expected: PASS — all four gesture specs plus the Task 2 draw spec.

Run: `pnpm test:e2e:web`
Expected: PASS. The hook's pointer listeners also fire from a mouse, but a mouse produces one contact, so the reducer reports `single` and nothing changes.

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useCanvasGestures.ts src/components/editor/EditorStage.tsx src/app/layout.tsx e2e/mobile/gestures.ts e2e/mobile/zoom-pan.spec.ts
git commit -m "feat(editor): two-finger pinch-zoom and pan on the web canvas

Gesture output is coalesced into one scale change and one scroll write
per frame. A touchmove listener calls stopPropagation to keep Konva's
window-level DD._drag from moving a shape mid-pinch."
```

---

### Task 5: Make the surrounding UI fit a phone

The `/paste` sidebar is a hard `w-60` (240px), which eats most of a 390px screen. Hide it below `sm` and reach it from a button instead.

**Files:**
- Modify: `src/app/paste/page.tsx:276-283`
- Modify: `src/components/editor/toolbar/ToolButton.tsx:35`
- Create: `e2e/mobile/layout.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Create `e2e/mobile/layout.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("the tool-options panel is off-canvas until opened on a phone", async ({
  page,
}) => {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");

  const panel = page.locator("#tool-options-slot");
  await expect(panel).toBeHidden();

  await page.getByRole("button", { name: /tool options/i }).click();
  await expect(panel).toBeVisible();
});

test("the canvas area gets the full width on a phone", async ({ page }) => {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");
  const main = page.locator("main");
  const box = (await main.boundingBox())!;
  const viewport = page.viewportSize()!;
  // Within a pixel of the full width — no 240px sidebar stealing space.
  expect(box.width).toBeGreaterThan(viewport.width - 2);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test:e2e:mobile layout`
Expected: FAIL — the panel is visible from the start and there is no "Tool options" button.

- [ ] **Step 3: Make the sidebar a slide-over below `sm`**

In `src/app/paste/page.tsx`, add near the other `useState` calls at the top of the component:

```tsx
  const [optionsOpen, setOptionsOpen] = useState(false);
```

Replace the `<aside>` (currently paste/page.tsx:276-283) with:

```tsx
        {/* Tool-options panel — always docked on the right; empty until the
            Toolbar portals contextual controls into it. See the editor page.
            Below `sm` it slides over the canvas instead of stealing 240px. */}
        <button
          type="button"
          aria-label="Tool options"
          onClick={() => setOptionsOpen((v) => !v)}
          className="absolute right-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-overlay)] sm:hidden"
        >
          <SlidersHorizontal className="h-5 w-5" aria-hidden />
        </button>
        <aside
          id="tool-options-slot"
          aria-label="Tool options"
          className={`${
            optionsOpen ? "flex" : "hidden"
          } absolute right-0 top-0 z-10 h-full w-60 flex-none flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-3 sm:static sm:flex`}
        />
```

Add `SlidersHorizontal` to the existing `lucide-react` import at the top of the file.

- [ ] **Step 4: Give the toolbar controls a thumb-sized target**

Every toolbar icon button renders through one shared component, so this is a one-line change. In `src/components/editor/toolbar/ToolButton.tsx:35`, replace the first entry of the class array:

```ts
        "flex h-8 w-8 max-sm:h-11 max-sm:w-11 items-center justify-center rounded-lg border transition-all disabled:opacity-30 disabled:hover:bg-transparent",
```

`h-8 w-8` (32px) is below the 44px touch target minimum; `max-sm:` raises it on phones and leaves desktop untouched. The icon itself stays `h-4 w-4` — the target grows, not the glyph.

- [ ] **Step 5: Run the tests**

Run: `pnpm test:e2e:mobile`
Expected: PASS — layout specs plus everything from Tasks 2 and 4.

Run: `pnpm test:e2e:web`
Expected: PASS — the `sm:static sm:flex` classes restore the original desktop layout exactly.

- [ ] **Step 6: Commit**

```bash
git add src/app/paste/page.tsx src/components/editor/toolbar/ToolButton.tsx e2e/mobile/layout.spec.ts
git commit -m "feat(web): fit the paste editor chrome to a phone screen"
```

---

### Task 6: Wire the mobile suite into CI and document it

**Files:**
- Modify: `e2e/README.md`
- Modify: `.github/workflows/` — the workflow that runs Playwright (locate with the grep in Step 1).

**Interfaces:**
- Consumes: the `mobile` project registered in Task 2.
- Produces: nothing.

- [ ] **Step 1: Find the workflow that runs the e2e suite**

Run: `grep -rln "playwright" .github/workflows/`

- [ ] **Step 2: Add the mobile project to that workflow**

Wherever the workflow invokes `playwright test --project=web`, add a sibling invocation for `--project=mobile`. If it invokes `playwright test` with no `--project`, the new project already runs and no change is needed — confirm by reading the step and note it in the commit message.

- [ ] **Step 3: Document the suite**

Add to `e2e/README.md`:

```markdown
## Mobile project

`--project=mobile` runs `e2e/mobile/*.spec.ts` against `devices["Pixel 5"]`,
which sets `hasTouch`.

Playwright's `page.touchscreen` only exposes `tap(x, y)`, so multi-finger
gestures go through CDP `Input.dispatchTouchEvent` instead. The helpers live in
`e2e/mobile/gestures.ts` (`pinch`, `twoFingerDrag`) — use those rather than
hand-rolling CDP calls. This binds the suite to Chromium, which is already true
of the `web` project.
```

- [ ] **Step 4: Verify the whole suite**

Run: `pnpm test:unit`
Expected: PASS.

Run: `pnpm test:e2e:web && pnpm test:e2e:mobile`
Expected: PASS for `web` and `mobile`. The `tauri` project is tier 2 and stays skipped unless explicitly invoked.

- [ ] **Step 5: Commit**

```bash
git add e2e/README.md .github/workflows/
git commit -m "ci: run the mobile e2e project"
```

---

## Manual verification on a real device

The automated suite drives synthetic CDP touch events, which are not the same as
a finger on glass. Before merging, load the branch's dev server on a phone over
the LAN and confirm by hand:

- Pinch feels smooth and the point between the fingers stays put.
- Two-finger drag pans, and pinch + drag together do not fight each other.
- One finger draws with a tool selected, and drags an existing shape with the
  select tool.
- Starting a stroke and then landing a second finger leaves no stray shape.
- The page itself does not zoom when pinching over the canvas.

These are the spec's open assumptions — chiefly that `stopPropagation()` on
`touchmove` is enough to keep `DD._drag` from moving a shape mid-pinch, and that
CDP touch input produces `pointermove` events at all. If the CDP events turn out
to fire only `touchmove` and not `pointermove`, Task 4's e2e specs fail while
the feature works on device; in that case switch the hook's contact tracking
from pointer events to touch events. The reducer takes plain objects and needs
no change either way.
