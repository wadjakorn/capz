"use client";

import { forwardRef, type SVGProps } from "react";

/**
 * Map-pin marker with a "1" in the head. Signals that the Pin tool drops
 * auto-incrementing numbered markers, which a plain location pin (MapPin)
 * doesn't convey. The "1" is static — a live counter in a 16px icon reads as
 * noise, not information. Toolbar affordance only; placed pins render from the
 * canvas layer, not this icon.
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
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <text
          x="12"
          y="10"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="9"
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
