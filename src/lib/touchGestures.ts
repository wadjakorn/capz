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
