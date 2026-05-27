"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

export function useOverflowSlots<T>(
  items: T[],
  containerRef: RefObject<HTMLDivElement | null>,
  reservedWidth: number,
  slotWidth: number,
  forceIndex?: number,
): { visible: T[]; overflow: T[] } {
  const [width, setWidth] = useState<number>(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  if (width === 0) return { visible: items, overflow: [] };

  // First pass: assume no overflow → all fits
  const allCount = items.length;
  const allWidth = reservedWidth + allCount * slotWidth;
  if (allWidth <= width) return { visible: items, overflow: [] };

  // Reserve space for the overflow trigger itself
  const slots = Math.max(
    0,
    Math.floor((width - reservedWidth - slotWidth) / slotWidth),
  );
  if (slots >= allCount) return { visible: items, overflow: [] };

  const visible = items.slice(0, slots);
  const overflow = items.slice(slots);

  // Force-include a specific item (e.g. active tool) in visible.
  if (
    typeof forceIndex === "number" &&
    forceIndex >= 0 &&
    forceIndex < items.length &&
    !visible.includes(items[forceIndex])
  ) {
    if (visible.length === 0) {
      return { visible: [items[forceIndex]], overflow: items.filter((_, i) => i !== forceIndex) };
    }
    // Swap forced into the last visible slot; push displaced into overflow head.
    const displaced = visible[visible.length - 1];
    const newVisible = [...visible.slice(0, -1), items[forceIndex]];
    const newOverflow = overflow.filter((x) => x !== items[forceIndex]);
    newOverflow.unshift(displaced);
    return { visible: newVisible, overflow: newOverflow };
  }

  return { visible, overflow };
}
