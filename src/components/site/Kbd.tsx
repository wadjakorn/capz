"use client";

import { useKeyPlat } from "./keyPlatform";
import { ArrowBigUp, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Command, Option, type LucideIcon } from "lucide-react";

/** Windows keyboards print the modifier names, not glyphs. */
const WIN: Record<string, string> = { "⌘": "Ctrl", "⌥": "Alt", "⇧": "Shift" };

/**
 * A keycap, written once in Mac glyphs. On the Mac keyboard, modifier and
 * arrow glyphs are drawn as icons (the display and mono faces don't carry ⇧ ⌥
 * or the arrows); on the Windows keyboard the modifiers become Ctrl/Alt/Shift.
 */
const ICONS: Record<string, [LucideIcon, string]> = {
  "⌘": [Command, "Command"],
  "⌥": [Option, "Option"],
  "⇧": [ArrowBigUp, "Shift"],
  "←": [ArrowLeft, "Left"],
  "↑": [ArrowUp, "Up"],
  "↓": [ArrowDown, "Down"],
  "→": [ArrowRight, "Right"],
};

export function Kbd({ k }: { k: string }) {
  const { plat } = useKeyPlat();
  if (plat === "win" && WIN[k]) return <kbd className="wide">{WIN[k]}</kbd>;
  const icon = ICONS[k];
  if (icon) {
    const [Icon, name] = icon;
    return <kbd aria-label={name}><Icon aria-hidden strokeWidth={2.25} /></kbd>;
  }
  return <kbd className={k.length > 1 ? "wide" : undefined}>{k}</kbd>;
}
