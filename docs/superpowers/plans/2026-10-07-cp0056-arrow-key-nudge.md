# CP-0056 — Arrow-key nudge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arrow = 1 px, Shift+Arrow = 10 px nudge of the selected annotation, one undo entry per run, in the desktop editor and `/paste`.

**Architecture:** A pure key→delta helper (`src/lib/nudge.ts`), a `nudge` store action that reuses `shiftAnnotation` and coalesces history with a transient `nudgeRun` marker (same id + same `annotations` reference + ≤1000 ms), and one small branch in `useEditorShortcuts`.

**Tech Stack:** Next.js 15 static export, TypeScript strict, Zustand 5, Vitest (+ jsdom / @testing-library/react for the hook test). pnpm only.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-07-cp0056-arrow-key-nudge-design.md`.
- Worktree: `/home/wadjakorn/development/capz-arrow-nudge`, branch `feat/arrow-key-nudge`, based on `origin/main` (v0.15.0).
- Headless Linux box: no Tauri GUI. Gates here: `pnpm test:unit`, `pnpm exec tsc --noEmit`, `pnpm build`. No lint script exists.
- CP-0057 (duplicate) edits `useEditorShortcuts.ts` in parallel — keep the hook change to one import + one self-contained block.
- No Rust changes. No localStorage. Conventional commits with the `Co-Authored-By` trailer.

---

## File Structure

- `src/lib/nudge.ts` — **new**: `NUDGE_STEP`, `NUDGE_STEP_LARGE`, `NUDGE_COALESCE_MS`, `nudgeDelta(key, shift)`. *(Task 1)*
- `src/lib/nudge.test.ts` — **new**. *(Task 1)*
- `src/stores/editor.ts` — export `shiftAnnotation`; add `nudgeRun` state + `nudge` action. *(Task 2)*
- `src/stores/editor.nudge.test.ts` — **new**. *(Task 2)*
- `src/hooks/useEditorShortcuts.ts` — arrow-key branch. *(Task 3)*
- `src/hooks/useEditorShortcuts.nudge.test.tsx` — **new** (jsdom). *(Task 3)*
- `PROGRESS-FEATURE.md` — tracker entry. *(Task 4)*

---

## Task 1: Pure key → delta helper

**Files:** Create `src/lib/nudge.ts`, `src/lib/nudge.test.ts`.

- [ ] **Step 1: Failing test** — `nudgeDelta("ArrowLeft", false)` → `{dx:-1,dy:0}`; `"arrowdown"` + shift → `{dx:0,dy:10}`; all four directions; `"a"`, `"Enter"` → `null`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/nudge.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement**

```ts
export const NUDGE_STEP = 1;
export const NUDGE_STEP_LARGE = 10;
export const NUDGE_COALESCE_MS = 1000;
const DIRS: Record<string, [number, number]> = {
  arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1],
};
export function nudgeDelta(key: string, shift: boolean): { dx: number; dy: number } | null {
  const d = DIRS[key.toLowerCase()];
  if (!d) return null;
  const s = shift ? NUDGE_STEP_LARGE : NUDGE_STEP;
  return { dx: d[0] * s, dy: d[1] * s };
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(editor): arrow-key nudge delta helper (CP-0056)`.

## Task 2: `nudge` store action with undo coalescing

**Files:** Modify `src/stores/editor.ts`; create `src/stores/editor.nudge.test.ts`.

- [ ] **Step 1: Failing tests**
  - `shiftAnnotation` translates rect/text/sticker/pin/blur/image `x,y`; arrow `x1..y2` and `cx,cy` only when present; pen/highlighter `points`; magnify `sx,sy,x,y`.
  - `nudge(id, 1, 0, t)` moves the element and pushes exactly one `past` entry; clears `future`.
  - Repeated nudges within 1000 ms of each other (t, t+30, t+60…) → still one `past` entry; one `undo()` restores the original position.
  - Nudge after > 1000 ms idle → second `past` entry.
  - Nudge, then `update`/`add` on anything, then nudge (same id, within window) → new entry.
  - Nudge `a`, then nudge `b` → new entry.
  - Nudge, `undo`, nudge → new entry (past length 1, original restorable).
  - Unknown id or `(0, 0)` → no change, no history.
- [ ] **Step 2: Run** `pnpm exec vitest run src/stores/editor.nudge.test.ts` → FAIL.
- [ ] **Step 3: Implement**
  - `export function shiftAnnotation(...)` (unchanged body).
  - `State`: `nudgeRun: { id: string; at: number; annotations: Annotation[] } | null;` and `nudge: (id: string, dx: number, dy: number, now?: number) => void;` Initial `nudgeRun: null`.
  - Action:

```ts
nudge: (id, dx, dy, now = Date.now()) => {
  if (!dx && !dy) return;
  const { annotations, nextPinNumber, past, imageCrop, nudgeRun } = get();
  if (!annotations.some((a) => a.id === id)) return;
  const next = annotations.map((a) => (a.id === id ? shiftAnnotation(a, dx, dy) : a));
  const continuing =
    nudgeRun !== null &&
    nudgeRun.id === id &&
    nudgeRun.annotations === annotations &&
    now - nudgeRun.at <= NUDGE_COALESCE_MS;
  set({
    annotations: next,
    ...(continuing ? {} : { past: pushHistory(past, { annotations, nextPinNumber, imageCrop }) }),
    future: [],
    nudgeRun: { id, at: now, annotations: next },
  });
},
```

- [ ] **Step 4: Run** → PASS; run full `pnpm test:unit`.
- [ ] **Step 5: Commit** `feat(editor): nudge store action with coalesced undo (CP-0056)`.

## Task 3: Keyboard binding

**Files:** Modify `src/hooks/useEditorShortcuts.ts`; create `src/hooks/useEditorShortcuts.nudge.test.tsx` (`// @vitest-environment jsdom`, `renderHook` from `@testing-library/react`, dispatch `KeyboardEvent` on `window` / on a focused `<input>`).

- [ ] **Step 1: Failing tests**
  - Selected rect + `ArrowRight` → x+1, event `defaultPrevented`.
  - `Shift+ArrowUp` → y−10.
  - No selection → nothing moves, event NOT default-prevented.
  - `tool = "crop"` → nothing moves.
  - Event from a focused `<input>` / `<textarea>` → nothing moves.
  - `Ctrl+ArrowRight`, `Alt+ArrowRight` → nothing moves.
  - Pre-`defaultPrevented` event → nothing moves.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — import `nudgeDelta`; after the Delete/Backspace block:

```ts
// CP-0056: arrow-key nudge of the selected element (1px, Shift = 10px).
const nudge = nudgeDelta(key, e.shiftKey);
if (nudge) {
  const s = useEditor.getState();
  if (s.selectedId && s.tool !== "crop" && !e.altKey && !e.defaultPrevented) {
    e.preventDefault();
    s.nudge(s.selectedId, nudge.dx, nudge.dy);
  }
  return;
}
```

- [ ] **Step 4: Run** → PASS; `pnpm test:unit`, `pnpm exec tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(editor): arrow keys nudge the selected element (CP-0056)`.

## Task 4: Tracker + full gates

- [ ] Add a `[x] **Arrow-key nudge (CP-0056)**` entry to `PROGRESS-FEATURE.md` → Open (same format as neighbours: what, files, verification, "interactive Mac check pending").
- [ ] `pnpm test:unit && pnpm exec tsc --noEmit && pnpm build`.
- [ ] Commit `docs(progress): CP-0056 arrow-key nudge`.
- [ ] Push, open PR against `main` (summary, inbox issue #9, CP-0056, test plan noting headless box).
