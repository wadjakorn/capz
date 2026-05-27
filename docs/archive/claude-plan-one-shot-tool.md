# UX Changes Implementation Plan — CAPZ Editor

## Summary
Implement two UX improvements to Konva editor:
1. **Auto-switch to select tool** after placing one-shot elements (arrow, rect, text, blur, sticker)
2. **Text commit on outside click** — clicking outside textarea while editing commits text instead of canceling

## Status: READY TO IMPLEMENT

All exploration complete. Locations mapped, logic identified.

## UX Change #1: Auto-switch to Select

After placing one-shot elements, call `setTool("select")` at:

| File | Line | Context | Action |
|------|------|---------|--------|
| src/components/editor/EditorStage.tsx | 538 | After `add(a)` for sticker | Add `setTool("select");` |
| src/components/editor/EditorStage.tsx | 554 | After `add(a)` for pin | Add `setTool("select");` |
| src/components/editor/EditorStage.tsx | 593 | After `add(a)` for text | Add `setTool("select");` |
| src/components/editor/EditorStage.tsx | 655 | After `add(a)` for rect (handleMouseUp) | Add `setTool("select");` |
| src/components/editor/EditorStage.tsx | 673 | After `add(a)` for blur (handleMouseUp) | Add `setTool("select");` |
| src/components/editor/EditorStage.tsx | 690 | After `add(a)` for arrow (handleMouseUp) | Add `setTool("select");` |

**Note:** Pin tool should NOT auto-switch (user typically places multiple numbered pins in sequence).

## UX Change #2: Text Commit on Outside Click

Status: **LIKELY ALREADY WORKING**
- `onBlur` handler at line 888 calls `commitTextEditor()`
- Standard HTML textarea fires `onBlur` when user clicks outside
- Test required to verify behavior

## Implementation Steps

1. Modify EditorStage.tsx at 6 locations (add `setTool("select");` after each `add()`)
2. Test UX Change #1 end-to-end
3. Test UX Change #2 by clicking outside textarea while editing text
4. Commit changes

## Code Context

Store location: `src/stores/editor.ts`
- Line 169-170: `setTool()` function

Component location: `src/components/editor/EditorStage.tsx`
- Lines 116-124: Store hooks
- Line 133: `const setTool = useEditor((s) => s.setTool);`
- Lines 493-572: `handleMouseDown()` event handler
- Lines 637-695: `handleMouseUp()` event handler
- Lines 574-597: `commitTextEditor()` function
- Lines 864-920: Textarea overlay JSX

