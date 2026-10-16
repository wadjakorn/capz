# Editor Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user capture a chosen subset of one image's edits (annotations, crop, backdrop on/off, backdrop look) and re-apply them at exact pixel positions. The target can be the active image or other open workspaces. The edits are applied either directly or from templates saved in a new sidebar tab.

**Architecture:**
- **Pure core:** `src/lib/template.ts` computes a `TemplatePatch` for one target.
- **Orchestrator:** `src/lib/applyTemplateTo.ts` is synchronous and routes each target either to the live editor (`useEditor.applyPatch`) or to a non-active doc (`useWorkspaces.patchDoc`).
- **Image sizes:** a session-only cache keyed by the exact stage `src`.
- **Storage:** templates live in their own lazily loaded `templates.json` store.
- **UI:** a new sidebar tab holds cards, a shared item picker, save and apply popovers, and pointer-drag onto the canvas or onto tiles.

**Tech Stack:** Next.js 15 static export, TypeScript 5 strict, Zustand 5, react-konva, tauri-plugin-store, tauri-plugin-fs, Sonner, Vitest (+ Testing Library, jsdom per file), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-editor-templates-design.md` (rev 4.1). Read it first. The § references below point to it.

## Global Constraints

- **Base:** `git fetch origin && git worktree add ../capz-editor-templates -b feat/editor-templates origin/main && cd ../capz-editor-templates && pnpm install`. Copy the spec and this plan in with the first commit.
  - `origin/main` already contains #130 (`autoForPaste` / `autoForImport`, schema v6).
  - **Line numbers in this plan were taken before #130.** Treat them as hints and find each spot by the symbol named.
- **Desktop only.** The Tauri gate lives in exactly two places:
  - the tab and panel mount in `src/app/editor/page.tsx`. The page keeps a `tauriUi` state set in an effect, `useEffect(() => setTauriUi(isTauriRuntime()), [])`, the same as `Toolbar.tsx:164`. **Never call `isTauriRuntime()` during render**, because the page is prerendered and the result would cause a hydration mismatch;
  - the store's *default* persistence backend.

  Components and stores take no other runtime checks, so they stay testable in Vitest. No `/paste` changes.
- No new keyboard shortcuts. Do not touch `useEditorShortcuts.ts`.
- No `localStorage` / `sessionStorage`. No config schema change and no `CONFIG_SCHEMA_VERSION` bump.
- Do not touch `src-tauri/**`, `panels/CaptureHistorySection.tsx` or `src/lib/elementClipboard.ts`.
- **i18n:**
  - Every visible string goes through `t()` / `useT()`, with flat `editor.templates.*` keys in `src/i18n/locales/en/editor.ts` and Thai in `th/editor.ts`, following `src/i18n/GLOSSARY.md`.
  - `tsc` fails on a missing Thai key, so **add each key, in both languages, in the task that first uses it.**
  - The translate-function type is `(k: TKey, v?: TVars) => string`, using `TKey` and `TVars` from `src/i18n/store.ts`.
- **Limits:** warn at 2 MB and refuse at 5 MB of serialised template. The Apply popover warns when image bytes × targets > 10 MB. Image-size decodes time out after 4 s.
- **Backdrop look:**
  - `BackdropLook` is an explicit `Pick` of `style | presetId | solidColor | padding | cornerRadius | shadow`, never an `Omit` of the `autoFor*` keys.
  - It is unchecked by default in every picker, and the fast paths never apply it.
- **Pins:** keep the template's numbers. `pins.lastUsedNumber` is never lowered.
- **Every commit:** `pnpm test:unit` passes and `pnpm exec tsc --noEmit` is clean. There is no `pnpm lint` script.
- **Commit style:** conventional, `feat(templates): …`, with the attribution trailer the session specifies.

## Review Focus

1. **The same workspace gets a new image.** `fillEmpty` after a clear reuses `<id>.png` (CP-0074), and `replaceActive` reuses the id. Apply must use the new image's size, never one cached for the old image. Owned by Task 4.
2. **Apply while the user is mid-edit:** text editor open, element selected, or crop tool active. Text must be committed first, uncommitted live edits must not be lost, and the tool must end up on `select` if the crop changed. Owned by Tasks 3 and 4.
3. **Applying to the image the template came from.** Items are duplicated on top with fresh ids and no collisions, and one Ctrl+Z removes them. Owned by Task 1.
4. **A template saved with the backdrop off.** Its targets get the backdrop turned off, and the picker shows "Backdrop: off". Owned by Tasks 1 and 6.
5. **Saving before the templates file has finished loading, or while it is corrupt.** Existing templates must never be overwritten, and a corrupt file is backed up first. Owned by Task 5.

---

### Task 1: Pure template core

**Files:**
- Create: `src/lib/template.ts`
- Test: `src/lib/template.test.ts`

**Interfaces:**
- **Consumes:**
  - from `@/stores/editor`: `Annotation`, `ImageCrop`, `EditorDoc`, `shiftAnnotation`, and `cloneAnnotation(a, id, dx, dy)`;
  - from `@/lib/annotationBounds`: `annotationAABB` (may return `null`);
  - from `@/lib/uid`: `uid`;
  - from `@/lib/config`: `AppConfig`.
- **Produces:**
  ```ts
  export type BackdropLook = Pick<AppConfig["general"]["backdrop"], "style" | "presetId" | "solidColor" | "padding" | "cornerRadius" | "shadow">;
  export type EditTemplate = { id: string; name: string; createdAt: number; sourceSize: {w:number;h:number}; crop?: ImageCrop; backdropOn?: boolean; backdropLook?: BackdropLook; annotations: Annotation[]; thumb: string };
  export type TemplateSelection = { crop: boolean; backdropOn: boolean; backdropLook: boolean; annotationIds: ReadonlySet<string> };
  export type TemplatePatch = { annotations: Annotation[]; nextPinNumber: number; imageCrop: ImageCrop | null; backdropOn: boolean; cropChanged: boolean; maxPinNumber: number | null };
  export type ApplyResult = { patch: TemplatePatch; cropSkipped: boolean; scaleMismatch: boolean };
  export type ApplyTarget = Pick<EditorDoc, "annotations" | "nextPinNumber" | "imageCrop" | "backdropOn">;
  export function pickBackdropLook(b: AppConfig["general"]["backdrop"]): BackdropLook;
  export function captureTemplate(doc: ApplyTarget, sourceSize: {w:number;h:number}, backdrop: AppConfig["general"]["backdrop"], sel: TemplateSelection, meta: { id: string; name: string; createdAt: number; thumb: string }): EditTemplate;
  export function applyTemplate(target: ApplyTarget, tpl: EditTemplate, sel: TemplateSelection, targetSize: {w:number;h:number}): ApplyResult;
  export function templateItemCount(tpl: EditTemplate): number;
  export function templateBytes(tpl: EditTemplate): number;         // JSON.stringify(tpl).length
  export function imageAnnotationBytes(tpl: EditTemplate): number;  // sum of image-annotation `src` lengths
  ```
- **Id rule (fixed):** `captureTemplate` **keeps the source annotation ids**, and `applyTemplate` mints fresh ids with `cloneAnnotation(a, uid(), dx, dy)`. A selection made over a live doc's ids therefore stays valid for the template captured from that doc.
- **"Fully outside":**
  - Compute the AABB normalised to non-negative w/h (min/max of the corners).
  - The item is *outside* when `x + w < 0 || y + h < 0 || x > area.w || y > area.h`. Touching an edge counts as inside.
  - A `null` AABB is never moved.
  - To bring an item in, use the smallest delta that puts it inside, with the top-left pinned when the item is larger than the area. This is the same axis rule as `clampIntoBounds` (`elementClipboard.ts:70`). Copy the small helper rather than importing it.
- **"Same working area":** `targetSize` deep-equals `tpl.sourceSize` **and** the resulting crop deep-equals `tpl.crop ?? null`.

- [ ] **Step 1: Write failing tests** in `src/lib/template.test.ts`. Use helpers `rect(id, x, y, w, h)` and `pin(id, x, y, number)`. The source is `{w:1000,h:800}` and uncropped unless a test says otherwise.
  - `captureTemplate normalises to base space and keeps ids`: source crop `{x:100,y:50,w:500,h:400}` and rect "a" at (10,10). The stored rect has id "a" and sits at (110,60).
  - `captureTemplate includes only selected items`: with `{crop:false, backdropOn:true, backdropLook:false, ids:{"a"}}`, `crop` is undefined, `backdropOn` equals the doc's value, `backdropLook` is undefined, and there is 1 annotation.
  - `captureTemplate deep-copies`: mutating the template does not change the source.
  - `pickBackdropLook excludes every autoFor* key`: given a backdrop with all five `autoFor*` keys set, the result's keys are exactly the six picked keys.
  - `applies crop to uncropped target and rebases existing`: target the same size, existing rect at (300,200). `imageCrop` becomes the template crop, the rect moves to (200,150), and `cropChanged` is true.
  - `replaces a different target crop, rebasing by old − new`: target crop `{x:0,y:0,w:600,h:600}`, existing rect at (300,200). After applying the template crop `{x:100,y:50,w:500,h:400}`, the rect is at (200,150).
  - `crop that does not fit has no effect`: on a 400×300 target, `imageCrop` is unchanged, `cropSkipped` is true and `cropChanged` is false.
  - `same size + same working area: overhang kept`: a rect at (-20,10) stays at (-20,10).
  - `same size, different target crop, crop unchecked: fully-outside moved in`: target crop `{x:600,y:0,w:400,h:800}`, template rect at base (10,10,50,50). The result lies within `[0,0,400,800]`.
  - `smaller target: only fully-outside move`: on 500×400, (600,100,50,50) moves inside and (480,100,50,50) is unchanged.
  - `zero-width arrow fully outside is moved; touching edge is not`.
  - `pins keep numbers`: pins 1 and 2 applied with `nextPinNumber` 5 give numbers [1,2], `nextPinNumber` 5 and `maxPinNumber` 2. With `nextPinNumber` 1, it becomes 3.
  - `self-apply: count doubles, all ids unique` (Review Focus 3).
  - `backdropOn false is applied when selected; kept when not` (Review Focus 4).
  - `round trip`: capture from a cropped source, then apply to the same-size uncropped target with the crop unchecked. The annotations land on the same **base** pixels, i.e. the source's crop-relative position plus the source crop offset.
  - `scaleMismatch`: 2×, 2.03× and 0.5× give true; 1.5× gives false.
  - `annotation subset`: only the selected ids are appended.
- [ ] **Step 2: Run** `pnpm test:unit src/lib/template.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3: Implement `src/lib/template.ts`** following spec §4.1–§4.2 and the rules above.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(templates): pure capture/apply core`. This commit also adds the spec and plan.

---

### Task 2: Image size sources

**Files:**
- Create: `src/lib/imageSizeCache.ts`; Test: `src/lib/imageSizeCache.test.ts`
- Modify: `src/lib/stageBridge.ts`, next to `setStageImageSize`
- Modify: `src/components/editor/EditorStage.tsx`, in a new layout effect declared **before** the one that calls `notifyStageImageReady`
- Modify: `src/hooks/useWorkspaceSession.ts`, to export the existing private `loadConvertFileSrc` and the private `type ConvertFileSrc` (`srcForDoc` is already exported)

**Interfaces:**
- **Produces:**
  ```ts
  // imageSizeCache.ts — keyed by the exact stage src (srcForDoc), never by path or id
  export function getImageSize(src: string): { w: number; h: number } | undefined;
  export function ensureImageSizes(srcs: string[], load?: (src: string) => Promise<{w:number;h:number}>): Promise<{ failed: string[] }>;
  export function __resetImageSizeCache(): void;
  // stageBridge.ts
  export function setStageSourceSize(size: { w: number; h: number } | null): void; // also updates useStageSourceSize
  export function getStageSourceSize(): { w: number; h: number } | null;
  export const useStageSourceSize: UseBoundStore<StoreApi<{ size: { w: number; h: number } | null }>>; // reactive mirror for UI disabled states
  // useWorkspaceSession.ts
  export async function loadConvertFileSrc(): Promise<ConvertFileSrc | null>;
  export type ConvertFileSrc = (path: string) => string;   // export the existing type
  ```
- **Default loader:**
  - Uses `new Image()` and sets **`img.crossOrigin = "anonymous"` before `src`**, the same as `imagePreload.ts:41-42` and `useImage(src, "anonymous")`. Otherwise WebKit can cache a non-CORS entry for the URL and taint the stage canvas when the user later switches to that workspace.
  - Resolves on `onload` with `naturalWidth/Height`, and rejects on `onerror`.
  - Does not use `preloadImage`.
- **Timeout:** the 4 s timeout lives in `ensureImageSizes`, which races each `load(src)` against it. It is not in the default loader, so the test, which uses an injected loader, exercises it.
- **EditorStage:** a `useLayoutEffect` on `[image]` that runs `setStageSourceSize(image ? {w: image.naturalWidth, h: image.naturalHeight} : null)`, and whose cleanup runs `setStageSourceSize(null)`.

- [ ] **Step 1: Write failing tests**, injecting a fake `load` and using fake timers for the timeout:
  - `caches by src`
  - `only loads missing srcs`
  - `failures reported and not cached`
  - `concurrent calls share one in-flight load`
  - `4 s timeout counts as failure`
- [ ] **Step 2: Run** `pnpm test:unit src/lib/imageSizeCache.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use a module `Map` for the cache and a second `Map<src, Promise>` for in-flight loads.
- [ ] **Step 4: Run** `pnpm test:unit && pnpm exec tsc --noEmit`. Expected: PASS and clean.
- [ ] **Step 5: Commit:** `feat(templates): src-keyed image-size cache and stage source size`.

---

### Task 3: Store mutations — `applyPatch`, `patchDoc`, hover outline kept out of tiles

**Files:**
- Modify: `src/stores/editor.ts`. Export `Snapshot`, `HISTORY_LIMIT` and `pushHistory`, and add the `applyPatch` action.
- Modify: `src/stores/workspaces.ts`. Add the `patchDoc` action, and in `renderThumb` hide the hover Transformer.
- Modify: `src/components/editor/EditorStage.tsx`. Add `name="hover-tr"` to the hover Transformer (`hoverTrRef`).
- Test: `src/stores/editor.applyPatch.test.ts`, plus additions to `src/stores/workspaces.test.ts`.

**Interfaces:**
- **Consumes:** `TemplatePatch` (Task 1). Use `import type` in both `editor.ts` and `workspaces.ts`. `template.ts` imports runtime values from `@/stores/editor`, so a value import would create a cycle.
- **Produces:**
  ```ts
  applyPatch: (patch: TemplatePatch) => void;                               // useEditor
  patchDoc: (id: string, patch: TemplatePatch, pre: Snapshot) => boolean;   // useWorkspaces; false = unknown id
  ```
- **`applyPatch`:**
  - Pushes `{annotations, nextPinNumber, imageCrop}` with `pushHistory` and sets `future: []`.
  - Copies **exactly** `annotations`, `nextPinNumber`, `imageCrop` and `backdropOn` from the patch. Never spread `...patch`: `cropChanged` and `maxPinNumber` must not leak into state or `workspaces.json`.
  - When `cropChanged`, also sets `displayScale: 0, userZoomed: false, selectedId: null, tool: "select", nudgeRun: null`.
- **`patchDoc`:**
  - Copies the same four fields explicitly (no spread) and sets `updatedAt: Date.now()`.
  - When `cropChanged`, also sets `displayScale: 0, userZoomed: false, scroll: null`.
  - **Keeps `thumb`.**
  - Sets `historyStacks.set(id, {past: pushHistory((prev?.past ?? []) as Snapshot[], pre), future: []})`.
  - Schedules a persist through the same debounced persist function the other actions call (find it in `workspaces.ts`).
- **`renderThumb`:** finds `stage.findOne(".hover-tr")`, saves its `nodes()`, sets `nodes([])` before `toDataURL`, and restores the saved nodes in a `finally`.

- [ ] **Step 1: Write failing tests.**
  - `applyPatch pushes one snapshot; undo restores pre-apply annotations and crop`.
  - `applyPatch with cropChanged resets view and tool`: starting from `tool: "crop"` and `displayScale: 1.5`, the result is `select` and `0`.
  - `applyPatch without cropChanged keeps tool and zoom`.
  - In `workspaces.test.ts`:
    - `patchDoc merges, keeps thumb, resets view on crop change`
    - `patchDoc caps history at HISTORY_LIMIT`: call it 101 times. `historyStacks` is private, so observe the cap through `switchNow(id)`, then `hydrate`, `restoreHistory(id)`, and assert `useEditor.getState().past.length === HISTORY_LIMIT`.
    - `patchDoc does not store cropChanged/maxPinNumber on the doc`.
    - `patchDoc unknown id → false, no write`
    - `undo after switching to a patched workspace restores pre-apply state`: use the file's `switchNow(id)` helper, then call `useEditor.getState().hydrate(doc)` and `restoreHistory(id)` yourself, then `undo()`.
  - `renderThumb restores hover-tr nodes even when toDataURL throws`:
    - Build the fake stage as `{findOne: () => fakeTr, scaleX: () => 1, toDataURL: () => { throw … } }`, register it with `setStage`, call `setStageExportBox({x:0,y:0,w:100,h:80})`, and use `swapping: false`.
    - Assert that `fakeTr.nodes` ends with its original array.
- [ ] **Step 2: Run** `pnpm test:unit src/stores`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test:unit && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(templates): applyPatch, patchDoc, keep hover outline out of tiles`.

---

### Task 4: Orchestrator `applyTemplateTo` and its toast

**Files:**
- Create: `src/lib/applyTemplateTo.ts`; Test: `src/lib/applyTemplateTo.test.ts`
- Modify: `src/i18n/locales/{en,th}/editor.ts` to add the toast keys `editor.templates.toast.applied` ("Applied to {n} images"), `.skipped` ("{n} skipped"), `.cropSkipped` ("crop didn't fit {n}"), `.scaleMismatch` ("Some images look like a different screen scale"), `.aborted` ("Workspace is switching — try again"), and `.revertBackdrop` ("Revert backdrop") and `.undoHint` ("Ctrl+Z on each image undoes annotations and crop").

**Interfaces:**
- **Consumes:**
  - Task 1: `applyTemplate`, `BackdropLook`.
  - Task 2: `getImageSize`, `getStageSourceSize`, and `srcForDoc` / `ConvertFileSrc` from `@/hooks/useWorkspaceSession`.
  - Task 3: `applyPatch`, `patchDoc`, `Snapshot`.
  - `runPrepareExport` (`@/lib/stageBridge`), `useSettings.getState().update`, and `BACKDROP_PRESETS` (`@/lib/backdrop`; check whether it is an array or a record and test membership accordingly).
- **Produces:**
  ```ts
  export const ACTIVE = "active" as const;
  export type ApplySummary = { applied: number; skipped: number; cropSkipped: number; scaleMismatch: number; aborted: boolean; previousLook: BackdropLook | null };
  export function applyTemplateTo(targetIds: string[], tpl: EditTemplate, sel: TemplateSelection, cfs: ConvertFileSrc | null): ApplySummary; // synchronous
  export function resolveTargetIds(): string[];   // order-sorted ids whose doc has an image; [ACTIVE] when workspaces disabled
  export function targetSrcs(cfs: ConvertFileSrc | null): string[]; // srcForDoc of every non-active target, for ensureImageSizes
  export function showApplyToast(s: ApplySummary, t: (k: TKey, v?: TVars) => string): void; // Sonner, id "templates-apply"; action "Revert backdrop" (8 s) when previousLook; description always includes toast.undoHint
  export function prepareApply(): Promise<ConvertFileSrc | null>; // loadConvertFileSrc → ensureImageSizes(targetSrcs(cfs)) → cfs; the ONLY way callers obtain cfs
  ```
- **Callers:**
  - Multi-target paths: `const cfs = await prepareApply()`, then `applyTemplateTo(…, cfs)`.
  - Active-only paths ("Apply to this", canvas drop): call `applyTemplateTo([activeId ?? ACTIVE], …, null)` synchronously. The active path never reads `cfs`.
- **The active target** requires `hasImage` and a non-null `getStageSourceSize()`. Otherwise it is skipped and counted.
- **A non-active target** uses `getImageSize(srcForDoc(doc, cfs))`.
- **Re-entrancy:** a module-level `applying` flag, reset in a `finally`.

- [ ] **Step 1: Write failing tests.** Seed the stores with `setState`, and seed the cache with `ensureImageSizes` and a fake loader. Use `cfs = (p) => "asset://" + p`.
  - `aborts when pendingId set` and `aborts when swapping`: `aborted` is true and the stores are deep-equal to before.
  - `re-entrant call is rejected`: `setPrepareExport(() => { inner = applyTemplateTo(...) })`. The inner call returns `aborted: true`, and the outer call applies normally.
  - `prepare runs before the live editor is read`: `setPrepareExport(() => useEditor.setState({annotations: [...cur, rect("typed")]}))`. After the apply, "typed" is still present beneath the applied items (Review Focus 2).
  - `active target uses live editor, not docs[activeId]`: an annotation that exists only in `useEditor` survives.
  - `active skipped when hasImage false or source size null` (counted).
  - `ACTIVE sentinel when workspaces disabled`.
  - **CP-0074:** `same id refilled with a new image does not reuse the old size`.
    - Workspace W has the path `/ws/W.png`, `sourcePath: "/tmp/one.png"`, and a size of 1000×800. Seed the cache **through `ensureImageSizes(targetSrcs(cfs))`**, never with hand-built strings, using a fake loader that maps each `sourcePath` to its size.
    - **First assert** that applying to W succeeds (`applied: 1`, crop applied).
    - Then refill W: same id and same path, `sourcePath: "/tmp/two.png"`, which the loader reports as 400×300 and which is not yet cached.
    - Applying now skips W.
    - Rerun after `ensureImageSizes(targetSrcs(cfs))`: the result uses 400×300, giving `cropSkipped: 1` for a crop that only fits 1000×800.
    - This covers Review Focus 1.
  - `skips closed or imageless targets and counts them`.
  - `backdrop look merges; autoForFull/Area/Window/Paste/Import all survive`; `unknown presetId keeps current presetId`; `previousLook returned when look applied`.
  - `lastUsedNumber never lowered`: 12 and a template max of 3 give 12; 1 and 3 give 3.
  - `revert action restores all six look fields`: capture the Sonner `action.onClick` from the mock, call it, and check that `general.backdrop` deep-equals the pre-apply look on all six fields, with the `autoFor*` flags untouched.
- [ ] **Step 2: Run** `pnpm test:unit src/lib/applyTemplateTo.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** following spec §4.3. Mock `sonner` in tests that call `showApplyToast`.
- [ ] **Step 4: Run** `pnpm test:unit && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(templates): synchronous multi-target apply`.

---

### Task 5: Templates store

**Files:**
- Create: `src/stores/templates.ts`; Test: `src/stores/templates.test.ts`
- Modify: the i18n files, to add `editor.templates.defaultName` ("Template {n}"), `.corruptBackup` ("Couldn't read saved templates — a backup was kept") and `.saveFailed` ("Couldn't save templates — will retry").

**Interfaces:**
- **Consumes:** `EditTemplate`, `BackdropLook` and `pickBackdropLook` (Task 1).
- **Produces:**
  ```ts
  export type TemplatesBackend = { load(): Promise<{ has: boolean; value: unknown }>; set(v: EditTemplate[]): Promise<void>; save(): Promise<void>; fileExists(): Promise<boolean>; backup(): Promise<void> };
  export function __setTemplatesBackend(b: TemplatesBackend | null): void;
  export const useTemplates: UseBoundStore<StoreApi<{ templates: EditTemplate[]; loaded: boolean;
    ensureLoaded(): Promise<void>; save(t: EditTemplate): Promise<void>; rename(id: string, name: string): Promise<void>;
    remove(id: string): Promise<void>; flush(): Promise<void> }>>;
  export function reviveTemplate(raw: unknown, currentLook: BackdropLook): EditTemplate | null;
  export function nextTemplateName(existing: EditTemplate[], t: (k: TKey, v?: TVars) => string): string;
  ```
- **Default backend:**
  - It is used only when `isTauriRuntime()`. Otherwise it is a memory-only no-op.
  - It calls `load("templates.json", { autoSave: false, defaults: {} })` from `@tauri-apps/plugin-store`, with key `"templates"`.
  - `fileExists` and `backup` use `exists` and `copyFile` from `@tauri-apps/plugin-fs`, with `BaseDirectory.AppData` and the backup name `templates.corrupt.json`.
- **Every mutation (`save`, `rename`, `remove`) first awaits `ensureLoaded()`** (Review Focus 5). `ensureLoaded` memoises its promise.
- **`flush` returns immediately when not dirty, before it touches the load gate.** A window blur must never trigger the first load.
- **Writes:**
  - debounced 800 ms, gated by a dirty flag;
  - the corrupt guard runs once, before the first write: if `fileExists() && !loaded.has`, it calls `backup()` and then shows a toast;
  - on a write failure it shows the `saveFailed` toast and stays dirty.
- **`reviveTemplate`:**
  - Requires a string `id` and `name`, a finite `createdAt`, a `sourceSize` with positive w/h, and an array of `annotations`.
  - `crop` must have 4 finite numbers. `backdropOn` must be a boolean when present. `thumb` must be a string, otherwise `""`.
  - **`backdropLook` is checked by hand, field by field:**
    - `style ∈ {"gradient","solid"}`;
    - `presetId` and `solidColor` are strings;
    - `padding` and `cornerRadius` are finite numbers ≥ 0;
    - `shadow` is a boolean.

    Each invalid or missing field takes the value from `currentLook`.

- [ ] **Step 1: Write failing tests**, using a fake backend with controllable promises and a mocked `sonner`:
  - `ensureLoaded loads once`
  - `save during a slow load keeps existing templates`: the backend `load` resolves after `save` is called, and the final `set` receives the old templates plus the new one.
  - `reviveTemplate drops malformed entries`
  - `reviveTemplate repairs backdropLook from currentLook`
  - `flush with nothing dirty does not write and does not call backend.load`
  - `corrupt guard backs up before first set, once`: `fileExists` is true and `has` is false, so `backup` is called before `set` and the toast is shown once.
  - `no backup when file absent`
  - `write failure toasts and retries on next change`
  - `nextTemplateName picks the next free N`
- [ ] **Step 2: Run** `pnpm test:unit src/stores/templates.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test:unit && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(templates): lazy templates.json store with load gate and corrupt backup`.

---

### Task 6: Item picker

**Files:**
- Create: `src/components/editor/templates/pickerItems.ts` (pure) and `src/components/editor/templates/TemplateItemPicker.tsx`
- Test: `src/components/editor/templates/pickerItems.test.ts` and `TemplateItemPicker.test.tsx` (`// @vitest-environment jsdom`, as in `src/components/settings/SettingRow.test.tsx`)
- Modify: the i18n files, to add `editor.templates.picker.*`: `all`, `image`, `annotations`, `crop` ("Crop {w}×{h} at ({x}, {y})"), `backdropOn` ("Backdrop: on"), `backdropOff` ("Backdrop: off"), `backdropLook`, `changesAll`, `group` ("{type} ({n})"), and one `type.<annotationType>` key per annotation type.

**Interfaces:**
- **Produces:**
  ```ts
  export type PickerItem =
    | { kind: "crop"; crop: ImageCrop }
    | { kind: "backdropOn"; value: boolean }
    | { kind: "backdropLook"; look: BackdropLook }
    | { kind: "annotation"; id: string; type: Annotation["type"]; text?: string; pinNumber?: number; emoji?: string; swatch?: string; bytes?: number; w?: number; h?: number };
  export function itemsFromDoc(doc: ApplyTarget, backdrop: AppConfig["general"]["backdrop"]): PickerItem[];
  export function itemsFromTemplate(tpl: EditTemplate): PickerItem[];
  export function defaultSelection(items: PickerItem[]): TemplateSelection;  // everything, backdropLook false
  export function TemplateItemPicker(props: { items: PickerItem[]; value: TemplateSelection; onChange(v: TemplateSelection): void; onHover?(id: string | null): void }): JSX.Element;
  ```
- **What each function returns:**
  - `itemsFromDoc` lists `crop` only when `imageCrop` is non-null, and always lists `backdropOn` and `backdropLook`.
  - `itemsFromTemplate` lists only what the template contains.
- **Annotation rows:**
  - shown topmost first, i.e. reversed array order;
  - text is truncated to 24 characters;
  - 2 or more items of one type collapse into a group row.
- **Keyboard:**
  - Space toggles the focused row;
  - → expands a group;
  - ← collapses it.

- [ ] **Step 1: Write failing tests.**
  - Pure functions:
    - `itemsFromDoc omits crop when uncropped`
    - `itemsFromTemplate omits absent fields`
    - `defaultSelection leaves backdropLook unchecked`
    - `topmost first`
  - Component:
    - `3 blurs collapse; group checkbox toggles all three`
    - `All is indeterminate when partial`
    - `backdrop row shows "Backdrop: off"` (Review Focus 4)
    - `hover calls onHover(id) then onHover(null)`
    - `Space toggles; →/← expand/collapse a group`
- [ ] **Step 2: Run** `pnpm test:unit src/components/editor/templates`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test:unit && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(templates): item picker`.

---

### Task 7: Templates tab, panel, cards, "Apply to this"

**Files:**
- Create:
  - `src/components/editor/templates/TemplatesPanel.tsx`
  - `src/components/editor/templates/TemplateCard.tsx`
- Modify:
  - `src/components/editor/SidebarTabs.tsx`: add `"templates"` to `SidebarTab`, and a tab with the `LayoutTemplate` icon from `lucide-react` (fall back to `LayoutGrid` if it is not exported) placed between History and the tool tab.
  - `src/app/editor/page.tsx`: widen the `rememberedTab` type, and add the tabpanel `#sidebar-panel-templates`, rendered only when `isTauriRuntime()`.
- Test: `src/components/editor/templates/TemplateCard.test.tsx` and `TemplatesPanel.test.tsx` (jsdom).
- i18n: add `editor.sidebar.templates`, `editor.templates.empty`, `.applyHere`, `.applyTo`, `.rename`, `.delete`, `.confirmDelete`, `.items` ("{n} items"), `.fromSize` ("{w}×{h}") and `.undoHelp`.

**Interfaces:**
- **Consumes:**
  - Task 4: `applyTemplateTo`, `ACTIVE`, `showApplyToast`, `targetSrcs`.
  - Task 2: `ensureImageSizes` and `loadConvertFileSrc`.
  - Task 5: `useTemplates`.
  - Task 6: `defaultSelection` and `itemsFromTemplate`.
- **Produces:**
  - `<TemplateCard tpl onRename onDelete />`. The card owns "Apply to this" (the `applyTemplateTo` call, the toast and the 400 ms disable) and, in Task 9, the "Apply to…" popover trigger. There is **no** `onApplyTo` prop.
  - `page.tsx` passes `active={activeTab === "templates"}` to the panel. Both the panel and `showTemplates` are gated on the page's effect-set `tauriUi` state.
  - `<TemplatesPanel active={boolean} />`.
  - Drag handlers are added in **Task 10**.
- **`SidebarTabs`** gains a `showTemplates: boolean` prop. `page.tsx` passes `isTauriRuntime()`, because the Tauri gate may live only in `page.tsx`.
- **Popovers** in Tasks 8 and 9 use the Popover from `@base-ui/react`, already installed at 1.5. There is no Popover in `src/components/ui`.
- **Panel:**
  - Sidebar tabpanels are always mounted and only hidden, so the panel calls `ensureLoaded()` in an effect **the first time `active` becomes true**, never on mount. This keeps the spec's "nothing is loaded at startup".
  - On mount it wires `flush` to the window `blur` and `beforeunload` events. `flush` awaits the load gate, so this is safe before the first load.
  - It shows the empty state, inline rename, and delete with an inline confirmation.
- **"Apply to this"** runs `applyTemplateTo([activeId ?? ACTIVE], tpl, defaultSelection(itemsFromTemplate(tpl)), null)` synchronously, then `showApplyToast`.
  - It is disabled while `!hasImage` or `useStageSourceSize().size === null`, and for 400 ms after a click.

- [ ] **Step 1: Write failing tests** (`TemplateCard.test.tsx` and `TemplatesPanel.test.tsx`). Mock `@/lib/applyTemplateTo` and `@/stores/templates` as needed.
  - `Apply to this passes picker defaults (backdropLook false)`.
  - `panel loads templates only when first active, not on mount`.
  - `disabled without image`.
  - `double click within 400 ms applies once`.
  - `delete asks for confirmation`.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test:unit && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(templates): sidebar tab, panel and cards`.

---

### Task 8: Save popover and hover highlight

**Files:**
- Create:
  - `src/stores/templatePreview.ts`
  - `src/components/editor/templates/SaveTemplatePopover.tsx`
- Modify:
  - `TemplatesPanel.tsx`: add the "Save as template" button.
  - `src/components/editor/EditorStage.tsx`: the hover Transformer shows `highlightId ?? hoveredId`.
  - `src/hooks/useWorkspaceSession.ts`: clear `highlightId` on a switch.
- Test: `src/components/editor/templates/SaveTemplatePopover.test.tsx` (jsdom).
- i18n: add `editor.templates.save`, `.name`, `.sizeWarn` ("Large template ({mb} MB)"), `.sizeRefuse` ("Too large to save (max 5 MB)") and `.cropToolActive`.

**Interfaces:**
- **Consumes:**
  - Tasks 1, 5 and 6;
  - `renderThumb` from `@/stores/workspaces`;
  - `runPrepareExport` and `getStageSourceSize`.
- **Produces:** `useTemplatePreview: { highlightId: string | null; setHighlight(id: string | null): void }`.
- **On open:** call `runPrepareExport()`.
  - The button is disabled while `tool === "crop"`, `!hasImage`, or `useStageSourceSize().size` is null. Use the **reactive** store, never `getStageSourceSize()`, in disabled conditions.
- **Save button:**
  - disabled when the selection is empty or `templateBytes ≥ 5_000_000`;
  - shows a warning at `≥ 2_000_000`.
- **On click:**
  - `thumb = renderThumb(160)`;
  - `captureTemplate(useEditor.getState(), getStageSourceSize()!, settings.general.backdrop, sel, {id: uid(), name, createdAt: Date.now(), thumb})`;
  - then `useTemplates.save`.
- **Closing the popover** calls `setHighlight(null)`.

- [ ] **Step 1: Write failing tests.**
  - `opening calls runPrepareExport` (register a fake via `setPrepareExport`)
  - `save disabled with empty selection`
  - `≥ 5 MB refuses; ≥ 2 MB warns` (use an image annotation with a long `src`)
  - `saved template is in base space` (cropped editor; the stored annotation includes the crop offset)
  - `closing clears highlightId`
  - `disabled while crop tool active`
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test:unit && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(templates): save popover and hover highlight`.

---

### Task 9: Apply popovers

**Files:**
- Create: `src/components/editor/templates/ApplyTemplatePopover.tsx`
- Modify:
  - `TemplateCard.tsx`: "Apply to…".
  - `TemplatesPanel.tsx`: "Apply this image's edits to…".
- Test: `src/components/editor/templates/ApplyTemplatePopover.test.tsx` (jsdom).
- i18n: add `editor.templates.applyFromImage`, `.where`, `.allOpen`, `.sizing`, `.decodeFailed`, `.bulkSizeWarn` ("About {mb} MB will be added across images") and `.confirm`.

**Interfaces:**
- **Consumes:** Tasks 1, 2, 4 and 6.
- **Produces:** `<ApplyTemplatePopover source={{kind: "template"; tpl: EditTemplate} | {kind: "live"}} onClose />`.
  - It is mounted inside `TemplateCard` as a base-ui Popover Trigger/Popup pair ("Apply to…"), and inside `TemplatesPanel` for "Apply this image's edits to…".
- **On open:** keep `const ready = prepareApply()`.
  - A row shows a spinner while `getImageSize(src)` is undefined and `ready` is pending. It becomes disabled with `decodeFailed` once `ready` resolves and the src is still missing.
  - **Confirm** awaits `ready`, then calls `applyTemplateTo` with the resulting `cfs`. It is disabled while the live source's `useStageSourceSize().size` is null.
- **"Where":**
  - lists `resolveTargetIds()` with each tile's thumbnail, plus an "All open images" toggle;
  - the active target is pre-checked for `template`, and excluded for `live`;
  - the whole section is hidden when workspaces are disabled.
- **`live` source:**
  - Opening runs `runPrepareExport()`. "What" is `itemsFromDoc(useEditor.getState(), backdrop)`.
  - Confirm builds `captureTemplate(useEditor.getState(), getStageSourceSize()!, backdrop, sel, {id: uid(), name: "", createdAt: Date.now(), thumb: ""})`.
  - It applies with `sel` unchanged, which is valid because `captureTemplate` keeps the ids (Task 1).
  - The "Apply this image's edits to…" button is hidden when workspaces are disabled or no other workspace has an image.
- **Warning:** shown when `imageAnnotationBytes × checkedTargets > 10_000_000`.

- [ ] **Step 1: Write failing tests.** Mock `@/lib/imageSizeCache` with `vi.mock` in every test except the unmocked one. jsdom has no canvas, so image `onload` never fires. Mock `loadConvertFileSrc` so it returns `null`.
  - `live source excludes active from targets`
  - `row disabled when size load fails`
  - `10 MB warning with 3 targets × 4 MB image`
  - `backdropLook unchecked by default even when template has it`
  - **Unmocked:** `live flow applies the selected live items to B`. Use real stores and the real `applyTemplateTo`. Seed the cache with a fake loader via `ensureImageSizes(targetSrcs(null))`; with `cfs` null that key is B's raw path. B's doc ends with the selected items under fresh ids, and the template list is unchanged.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test:unit && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(templates): apply-to popover and apply-from-image`.

---

### Task 10: Drag a card onto the canvas or a tile

**Files:**
- Create:
  - `src/components/editor/templates/useTemplateDrag.ts`
  - `src/stores/templateDrag.ts`
- Modify:
  - `TemplateCard.tsx`: `onPointerDown` on the card body.
  - `src/components/editor/CanvasDropHint.tsx`: a third `data-mode="template"`, with its copy.
  - `src/components/editor/WorkspaceBar.tsx`: on tiles carrying `data-ws-tile`, show a ring when `dropTargetId === id` and a 600 ms "applied" flash when `flashId === id`.
- Test: `src/components/editor/templates/useTemplateDrag.test.ts` (the pure resolver, with `// @vitest-environment jsdom` so that real elements provide `closest`).
- i18n: add `editor.templates.dropHint`.

**Interfaces:**
- **Consumes:** Tasks 2, 4 and 6.
- **Produces:**
  ```ts
  export type DropTarget = { kind: "canvas" } | { kind: "tile"; id: string } | null;
  export function resolveDropTarget(el: Element | null, overCanvas: boolean, tileHasImage: (id: string) => boolean): DropTarget; // tile wins over canvas
  export function useTemplateDrag(tpl: EditTemplate): { onPointerDown: (e: React.PointerEvent) => void };
  // templateDrag store
  { dropTargetId: string | null; flashId: string | null; setDropTarget(id: string | null): void; flash(id: string): void }
  ```
- **Mechanics** (mirror `panels/CaptureHistorySection.tsx:531-626`, but do not import from it):
  - window `pointermove`/`pointerup`;
  - a 4 px threshold;
  - a `pointer-events:none` ghost;
  - `user-select:none` on `document.body` for the duration of the drag.
- **Hit testing:**
  - over-canvas uses `document.getElementById("canvas-area")`'s rect;
  - tiles use `document.elementFromPoint(x, y)?.closest("[data-ws-tile]")`.
- **Drag start:** `onPointerDown` attaches the window listeners **synchronously**. It then starts `prepareApply()` **without awaiting**, and keeps that promise for the drop handler. A fast pointer-up therefore cannot be missed.
- **Pointer-down:** ignored when `(e.target as Element).closest("button")`. The card thumbnail `<img>` has `draggable={false}`, as History's does (`CaptureHistorySection.tsx:322`); otherwise a native image drag fires `pointercancel`.
- **Canvas hint:** shown only when `hasImage`.
- **Drop:**
  1. await that promise (it comes from `prepareApply()`);
  2. `applyTemplateTo([dt.kind === "canvas" ? (activeId ?? ACTIVE) : dt.id], tpl, defaultSelection(itemsFromTemplate(tpl)), cfs)`;
  3. `showApplyToast`;
  4. `flash(id)` if the drop was on a tile.
  - A canvas drop when `!hasImage` is ignored.

- [ ] **Step 1: Write failing tests:**
  - `tile with image`
  - `tile without image → null`
  - `canvas`
  - `tile wins over canvas`
  - `nothing → null`
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test:unit && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(templates): drag cards onto canvas or workspace tiles`.

---

### Task 11: e2e, tracker, desktop verification, PR

**Files:**
- Create: `e2e/web/templates.spec.ts`.
- Modify:
  - `e2e/fixtures/tauri-mock.ts`: add a `persist_workspace_image` handler that returns `` `/ws/${id}-${path.split("/").pop()}` ``. Handlers are stringified and rebuilt with `new Function`, so inline the code and do not call outside helpers. Read `workspaces.ts` for the argument names it sends.
  - `PROGRESS-FEATURE.md`: a new entry in the existing CP format.

**Steps:**

- [ ] **Step 1: Write the spec file.**
  - **Setup, via an extra `page.addInitScript` registered after `installTauriMock`** (the mock's own init script creates `__capzStoreData`):
    - `__capzStoreData.set("app", { ...DEFAULT_CONFIG, workspaces: { ...DEFAULT_CONFIG.workspaces, enabled: true } })`. The config key is `CONFIG_STORE_KEY = "app"` (`config.ts:483`), not `"config"`. The bag is one flat map shared by every store file.
    - `__capzStoreData.set("templates", [])`. This keeps the corrupt guard quiet, because the mock's `fs|exists` is always true.
  - **Images:**
    - a `page.route(/asset\.localhost/)` handler that branches on the path and serves **SVG** with explicit `width`/`height` (`image/svg+xml`): 1000×800 for `a.png`, 600×400 for `b.png`. Nothing in the repo generates PNGs of those sizes;
    - load them with `emitTauriEvent("editor:load-image", {path, source: "area"})`;
    - never use the file-save path.
  - **Tests:**
    - `rect-only template dropped on another workspace lands at the same position`
    - `one Ctrl+Z removes the applied items`. Press Escape or select the Select tool before clicking the canvas for focus, so the click doesn't draw.
    - `apply-to multiple workspaces`
    - `apply this image's edits to B without saving`
    - `tile drop applies without switching`
  - Read positions through `window.__capzStage`, following the helpers in `e2e/visual/helpers.ts`.
- [ ] **Step 2: Run** `pnpm test:e2e:web -- templates`. Use `PLAYWRIGHT_CHANNEL=chrome` on this Linux box. Expected: PASS.
- [ ] **Step 3: Run the full gates:** `pnpm test:unit`, `pnpm exec tsc --noEmit` and `pnpm build`. Expected: all clean. `cargo clippy` is not needed, because no Rust changes.
- [ ] **Step 4: Desktop check on the Mac via the `mac-app-build` skill.**
  - Confirm the log contains "Finished 2 bundles". The script can exit 0 on failure.
  - In `pnpm tauri dev`, verify:
    - templates persist across a restart;
    - a hand-corrupted `templates.json` is backed up to `templates.corrupt.json`;
    - the Thai tab bar fits, or else make the tab icon-only with a tooltip;
    - "Revert backdrop" works;
    - a rail-mode tile drop works.
- [ ] **Step 5: Commit, push and open the PR.**
  - Commit: `test(templates): e2e + tracker`.
  - Push, then switch the gh account to `wadjakorn` (`gh auth switch`).
  - Open the PR. If `gh pr edit` fails on projects-classic, PATCH the body with `gh api`.
  - Put the Mac-check results in the PR body, and link the PR to the thread.
