import type Konva from "konva";

/**
 * Konva `name` for screen-only editor chrome (e.g. the green snap guides).
 * Nodes carrying it are drawn on screen but never captured in a snapshot.
 */
export const SCREEN_CHROME = "screen-chrome";

/**
 * Run `fn` (typically a `stage.toDataURL`) with every visible screen-chrome
 * node hidden, then restore it. Synchronous on purpose: clearing the store is
 * not enough because React only unmounts the nodes on the next render, after
 * the snapshot has already been taken (CP-0079).
 */
export function withScreenChromeHidden<T>(stage: Konva.Stage, fn: () => T): T {
  const hidden = stage.find(`.${SCREEN_CHROME}`).filter((n) => n.visible());
  hidden.forEach((n) => n.visible(false));
  try {
    return fn();
  } finally {
    hidden.forEach((n) => n.visible(true));
  }
}
