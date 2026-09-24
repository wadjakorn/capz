"use client";

import { Label } from "@/components/ui/label";
import { useSettings } from "@/stores/settings";
import { currentPlatform } from "@/lib/shortcuts";
import {
  MACOS_ONLY_RING_MODES,
  RING_MAX_MODES,
  RING_MIN_MODES,
  RING_MODE_IDS,
  RING_MODE_LABELS,
  type RingWedge,
} from "@/lib/commandRing";

/**
 * Which capture modes occupy the hold-ring's slots (CP-0038).
 *
 * Fixed 1-4 slots: the ring cycles through the checked modes in list order,
 * clockwise from the top. Min/max are enforced here by disabling the checkbox
 * that would break them — so the user cannot reach an invalid state rather than
 * being told off after the fact. `validateConfig` re-checks on read, because a
 * hand-edited store never passes through this UI.
 */
export function RingModesField() {
  const config = useSettings((s) => s.config);
  const update = useSettings((s) => s.update);
  const selected = config.ring.modes;
  const isMac = currentPlatform() === "mac";

  // A mode this platform can't run would be a slot that never fires.
  const available = RING_MODE_IDS.filter(
    (m) => isMac || !MACOS_ONLY_RING_MODES.includes(m),
  );

  // A config synced from a Mac can list `systemArea` on Windows, where it has
  // no checkbox. Counting it toward the limits would show fewer ticks than the
  // slot count claims AND block a fourth visible mode with no way to free the
  // slot — the hidden entry can't be unchecked. So the limits apply to what
  // the user can actually see and act on.
  const hidden = selected.filter((m) => !available.includes(m));
  const visible = selected.filter((m) => available.includes(m));

  const toggle = async (mode: RingWedge, checked: boolean) => {
    const nextVisible = checked ? [...visible, mode] : visible.filter((m) => m !== mode);
    if (nextVisible.length < RING_MIN_MODES || nextVisible.length > RING_MAX_MODES) return;
    // Preserve platform-hidden modes so a round-trip through this machine
    // doesn't silently strip them from the Mac's ring — but only while they
    // fit. A choice the user just made on the machine in front of them beats
    // an entry they cannot see.
    const keptHidden = hidden.slice(0, RING_MAX_MODES - nextVisible.length);
    const next = [...nextVisible, ...keptHidden];
    // Keep slots in the canonical list order so the ring layout is a function
    // of *which* modes are on it, not the order they happened to be ticked.
    const ordered = RING_MODE_IDS.filter((m) => next.includes(m));
    await update("ring", { modes: ordered });
  };

  return (
    <div className="grid gap-3">
      <div className="grid max-w-md gap-0.5">
        <Label className="text-foreground">Ring slots</Label>
        <span className="text-xs text-muted-foreground">
          Modes on the hold ring, clockwise from the top. Choose {RING_MIN_MODES}–
          {RING_MAX_MODES}; a cancel slot is always added last.
        </span>
      </div>
      <div className="grid gap-2">
        {available.map((mode) => {
          const checked = visible.includes(mode);
          // Block the toggle that would empty the ring or overfill it.
          const disabled = checked
            ? visible.length <= RING_MIN_MODES
            : visible.length >= RING_MAX_MODES;
          return (
            <label
              key={mode}
              className={`flex items-center gap-2 text-sm ${
                disabled ? "opacity-50" : "cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={checked}
                disabled={disabled}
                onChange={(e) => void toggle(mode, e.target.checked)}
              />
              <span>{RING_MODE_LABELS[mode]}</span>
            </label>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground">
        {visible.length} of {RING_MAX_MODES} slots used
        {visible.length >= RING_MAX_MODES && " — uncheck one to swap in another"}
      </span>
    </div>
  );
}
