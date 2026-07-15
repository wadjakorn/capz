"use client";

import { forwardRef, type SVGProps } from "react";

/**
 * Numbered circle marker: a ring with a "1" in it. Signals that the Pin tool
 * drops auto-incrementing numbered markers, which a plain location pin doesn't
 * convey. Circle (not a map-pin teardrop) so the badge reads clearly at 16px
 * and matches the round numbered markers the tool places. The "1" is static — a
 * live counter in a 16px icon reads as noise, not information. Toolbar
 * affordance only; placed pins render from the canvas layer, not this icon.
 *
 * Shaped to be interchangeable with a lucide icon (forwardRef + SVGProps), so
 * it slots into the same `icon` fields and is sized/colored by className +
 * currentColor exactly like the rest of the palette.
 */
export const NumberedPinIcon = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(
  function NumberedPinIcon(props, ref) {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        <circle cx="12" cy="12" r="9" />
        <text
          x="12"
          y="12"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="11"
          fontWeight="700"
          fill="currentColor"
          stroke="none"
        >
          1
        </text>
      </svg>
    );
  },
);
