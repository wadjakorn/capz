"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { onStageViewSettled } from "@/lib/stageBridge";
import { useWorkspaces } from "@/stores/workspaces";

type WsState = ReturnType<typeof useWorkspaces.getState>;

/** Gap kept around the flying card — the same inset EditorStage fits within. */
const FIT_INSET = 32;
/** Show the loading shimmer only once a switch has visibly stalled. */
const SHIMMER_AFTER_MS = 260;
/** After the image is ready, how long to wait for the view to settle. */
const SETTLE_GRACE_MS = 700;
/** Hard ceiling: never leave the canvas hidden longer than this. */
const MAX_HIDDEN_MS = 6000;

const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** A touch of overshoot, so the card lands rather than stops. */
const EASE_LAND = "cubic-bezier(0.22, 1.12, 0.36, 1)";

function imageKey(s: WsState): string {
  const doc = s.activeId ? s.docs[s.activeId] : undefined;
  const img = doc?.image;
  return `${s.activeId ?? ""}|${img ? (img.kind === "file" ? img.path : img.url) : ""}`;
}

/**
 * Hides the canvas while a workspace swap is in flight and covers the gap
 * with a transition, so the user never sees the stage's intermediate frames
 * (old image with new annotations, an empty stage, the fit/centre jump).
 *
 * Two variants:
 * - **lift** (switching to an existing workspace): the target's tile
 *   thumbnail lifts out of the workspace bar and grows into the canvas. If the
 *   bitmap is still decoding when it lands, a shimmer sweeps across it so a
 *   slow machine reads as loading rather than stuck. When the real canvas is
 *   ready it fades in as the blurred card fades out — a focus pull from the
 *   preview to the real thing.
 * - **develop** (a capture arriving, a close, a reopen): no tile to lift from,
 *   so the canvas simply fades out and settles back in from a slight zoom.
 *
 * `prefers-reduced-motion` reduces both to a short crossfade.
 *
 * Everything is driven imperatively through the Web Animations API from a
 * store subscription: none of it is React state, so a transition never causes
 * the editor to re-render.
 */
export function WorkspaceSwapOverlay({
  enabled,
  canvasRef,
}: {
  enabled: boolean;
  /** The element that wraps EditorStage / EmptyState. */
  canvasRef: RefObject<HTMLDivElement | null>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // The one piece of React state: block pointer input on the canvas while it
  // is hidden, so a click never lands on a workspace that is on its way out.
  const [blocking, setBlocking] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!enabled || !root || !canvas) return;
    const ctl = new SwapController(root, canvas, setBlocking);
    const unsub = useWorkspaces.subscribe((s, prev) => ctl.onStore(s, prev));
    return () => {
      unsub();
      ctl.dispose();
    };
  }, [enabled, canvasRef]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="absolute inset-0 z-10 overflow-hidden"
      style={{ pointerEvents: blocking ? "auto" : "none" }}
    />
  );
}

type Kind = "lift" | "develop";

class SwapController {
  /** Bumped per transition step; stale async work checks it and bails. */
  private gen = 0;
  private active = false;
  private kind: Kind = "develop";
  /** Active image when the transition began — did the canvas content change? */
  private startKey = "";
  private settled = false;
  private hideAnim: Animation | null = null;
  private card: HTMLDivElement | null = null;
  private cardIn: Promise<unknown> = Promise.resolve();
  private offSettled: (() => void) | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private root: HTMLDivElement,
    private canvas: HTMLDivElement,
    private setBlocking: (v: boolean) => void,
  ) {}

  private get reduced(): boolean {
    return (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    );
  }

  onStore(s: WsState, prev: WsState) {
    if (s.pendingId && s.pendingId !== prev.pendingId) {
      this.begin(prev, "lift", s);
    } else if (s.swapping && !prev.swapping && !s.pendingId) {
      this.begin(prev, "develop", s);
    }
    if (this.active && !s.swapping && prev.swapping) void this.maybeReveal();
  }

  private begin(prev: WsState, kind: Kind, s: WsState) {
    const gen = ++this.gen;
    // Per step, not per transition: a settle from a workspace the user has
    // already moved on from must not reveal the next one early.
    this.settled = false;
    if (!this.active) {
      this.active = true;
      this.startKey = imageKey(prev);
      this.offSettled = onStageViewSettled(() => {
        this.settled = true;
        void this.maybeReveal();
      });
      this.setBlocking(true);
      this.later(() => this.reveal(), MAX_HIDDEN_MS);
    }
    this.kind = kind;
    this.hideCanvas(kind);
    this.dropCard();
    if (kind === "lift" && s.pendingId && !this.reduced) {
      this.cardIn = this.launchCard(s, s.pendingId, gen);
    } else {
      this.cardIn = Promise.resolve();
    }
  }

  private hideCanvas(kind: Kind) {
    if (this.hideAnim) return; // already hidden by an earlier step
    const lift = kind === "lift" && !this.reduced;
    this.hideAnim = this.canvas.animate(
      [
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: lift ? "scale(0.96)" : "scale(1)" },
      ],
      { duration: this.reduced ? 100 : lift ? 160 : 110, easing: EASE_OUT, fill: "forwards" },
    );
  }

  /** Fly the target's thumbnail from its tile into the canvas. */
  private async launchCard(s: WsState, id: string, gen: number): Promise<unknown> {
    const doc = s.docs[id];
    const area = this.root.getBoundingClientRect();
    const order = s.order;
    const dir = Math.sign(order.indexOf(id) - order.indexOf(s.activeId ?? "")) || 1;

    let aspect = 16 / 10;
    let img: HTMLImageElement | null = null;
    if (doc?.thumb) {
      img = document.createElement("img");
      img.src = doc.thumb;
      try {
        await img.decode();
        if (img.naturalWidth && img.naturalHeight) aspect = img.naturalWidth / img.naturalHeight;
      } catch {
        img = null;
      }
    }
    if (this.gen !== gen) return;
    // An empty workspace (or one never thumbnailed) has nothing to show; the
    // canvas fade alone carries that switch.
    if (!img) return;

    const availW = Math.max(area.width - FIT_INSET * 2, 1);
    const availH = Math.max(area.height - FIT_INSET * 2, 1);
    const w = Math.min(availW, availH * aspect);
    const h = w / aspect;
    const x = (area.width - w) / 2;
    const y = (area.height - h) / 2;

    const card = document.createElement("div");
    Object.assign(card.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
      borderRadius: "8px",
      overflow: "hidden",
      transformOrigin: "0 0",
      willChange: "transform, opacity",
      boxShadow: "0 18px 50px -12px rgba(0,0,0,0.45), 0 0 0 1px var(--border)",
      background: "var(--bg-canvas)",
    } satisfies Partial<CSSStyleDeclaration>);
    Object.assign(img.style, {
      width: "100%",
      height: "100%",
      display: "block",
      objectFit: "cover",
      // The thumbnail is ~160px wide; at canvas size it would look pixelated.
      // A soft blur makes it read as "preview, sharpening soon" instead.
      filter: "blur(4px) saturate(1.05)",
      transform: "scale(1.04)", // hide the blur's soft edge
    } satisfies Partial<CSSStyleDeclaration>);
    card.appendChild(img);
    this.root.appendChild(card);
    this.card = card;

    const tile = document
      .querySelector(`[data-ws-tile="${CSS.escape(id)}"]`)
      ?.getBoundingClientRect();
    let from: Keyframe;
    if (tile && tile.width > 0) {
      // FLIP, uniform scale by width so the thumbnail is never squashed; the
      // card starts centred on the tile.
      const k = tile.width / w;
      const tx = tile.left - area.left - x;
      const ty = tile.top - area.top - y + (tile.height - h * k) / 2;
      from = { transform: `translate(${tx}px, ${ty}px) scale(${k})`, opacity: 0.85, borderRadius: `${6 / k}px` };
    } else {
      // Bar hidden: slide in from the side the target sits on.
      from = { transform: `translate(${dir * 48}px, 0) scale(0.97)`, opacity: 0 };
    }
    const anim = card.animate(
      [from, { transform: "none", opacity: 1, borderRadius: "8px" }],
      { duration: 300, easing: EASE_LAND, fill: "forwards" },
    );

    this.later(() => {
      if (this.gen !== gen || this.card !== card) return;
      this.addShimmer(card);
    }, SHIMMER_AFTER_MS);

    return anim.finished.catch(() => undefined);
  }

  /** A soft highlight sweeping across the card: "still loading, not stuck". */
  private addShimmer(card: HTMLDivElement) {
    const sheen = document.createElement("div");
    Object.assign(sheen.style, {
      position: "absolute",
      inset: "0",
      background:
        "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.22) 50%, transparent 65%)",
      backgroundSize: "250% 100%",
      mixBlendMode: "overlay",
    } satisfies Partial<CSSStyleDeclaration>);
    card.appendChild(sheen);
    sheen.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: "forwards" });
    sheen.animate(
      [{ backgroundPosition: "120% 0" }, { backgroundPosition: "-120% 0" }],
      { duration: 1200, iterations: Infinity, easing: "ease-in-out" },
    );
  }

  private dropCard() {
    const card = this.card;
    if (!card) return;
    this.card = null;
    const a = card.animate(
      [{ opacity: getComputedStyle(card).opacity }, { opacity: 0 }],
      { duration: 120, easing: EASE_OUT, fill: "forwards" },
    );
    a.finished.catch(() => undefined).finally(() => card.remove());
  }

  /** Reveal once the card has landed AND the canvas is in its final state. */
  private async maybeReveal() {
    const gen = this.gen;
    const s = useWorkspaces.getState();
    if (!this.active || s.swapping || s.pendingId) return;
    await this.cardIn;
    if (this.gen !== gen || !this.active) return;
    const doc = s.activeId ? s.docs[s.activeId] : undefined;
    // A new bitmap goes through fit → measure → centre after it decodes; wait
    // for that to finish. Nothing to wait for when the image did not change
    // (an abandoned switch) or the target is empty.
    const waitForView = imageKey(s) !== this.startKey && !!doc?.image;
    if (waitForView && !this.settled) {
      this.later(() => this.gen === gen && this.reveal(), SETTLE_GRACE_MS);
      return;
    }
    this.reveal();
  }

  private reveal() {
    if (!this.active) return;
    this.active = false;
    this.gen++;
    this.clearTimers();
    this.offSettled?.();
    this.offSettled = null;

    const develop = this.kind === "develop" && !this.reduced;
    this.hideAnim?.cancel();
    this.hideAnim = null;
    const canvasIn = this.canvas.animate(
      [
        {
          opacity: 0,
          transform: this.reduced ? "none" : develop ? "scale(1.015)" : "scale(0.99)",
        },
        { opacity: 1, transform: "none" },
      ],
      { duration: this.reduced ? 120 : develop ? 240 : 200, easing: EASE_OUT },
    );
    canvasIn.finished.catch(() => undefined);

    const card = this.card;
    this.card = null;
    if (card) {
      const img = card.querySelector("img");
      img?.animate(
        [{ filter: "blur(4px) saturate(1.05)" }, { filter: "blur(14px) saturate(1)" }],
        { duration: 220, easing: EASE_OUT, fill: "forwards" },
      );
      card
        .animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 220,
          easing: EASE_OUT,
          fill: "forwards",
        })
        .finished.catch(() => undefined)
        .finally(() => card.remove());
    }
    this.setBlocking(false);
  }

  private later(fn: () => void, ms: number) {
    this.timers.push(setTimeout(fn, ms));
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  dispose() {
    this.gen++;
    this.active = false;
    this.clearTimers();
    this.offSettled?.();
    this.hideAnim?.cancel();
    this.root.replaceChildren();
    this.setBlocking(false);
  }
}
