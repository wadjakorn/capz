import { ArrowBigUp, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Command, Option, type LucideIcon } from "lucide-react";

/**
 * A keycap. Modifier and arrow glyphs are drawn as icons: the display and mono
 * faces don't carry ⇧ ⌥ or the arrows, and a fallback font renders them tiny.
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
  const icon = ICONS[k];
  if (icon) {
    const [Icon, name] = icon;
    return <kbd aria-label={name}><Icon aria-hidden strokeWidth={2.25} /></kbd>;
  }
  return <kbd className={k.length > 1 ? "wide" : undefined}>{k}</kbd>;
}
