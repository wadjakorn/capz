import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface GlowTileProps {
  size?: 40 | 56 | 72 | 96 | 128;
  icon?: ReactNode;
  checkmark?: boolean;
  className?: string;
}

const ICON_SIZE: Record<NonNullable<GlowTileProps["size"]>, number> = {
  40: 20,
  56: 28,
  72: 36,
  96: 48,
  128: 64,
};

export function GlowTile({
  size = 56,
  icon,
  checkmark,
  className,
}: GlowTileProps) {
  return (
    <span
      className={cn("glow-tile", className)}
      style={{ width: size, height: size, fontSize: ICON_SIZE[size] }}
    >
      <span className="relative z-10 inline-flex items-center justify-center">
        {icon}
      </span>
      {checkmark && (
        <span
          className="absolute -right-1 -top-1 z-20 h-4 w-4 rounded-full border-2 border-[#1a0533]"
          style={{
            background: "linear-gradient(180deg, #34d399, #10b981)",
            boxShadow: "0 2px 6px rgba(16,185,129,0.5)",
          }}
        />
      )}
    </span>
  );
}
