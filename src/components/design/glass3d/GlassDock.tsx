import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface GlassDockProps {
  children: ReactNode;
  className?: string;
}

export function GlassDock({ children, className }: GlassDockProps) {
  return (
    <div
      className={cn(
        "glass-pill inline-flex items-center gap-2 px-3 py-2",
        className
      )}
      style={{
        boxShadow:
          "0 18px 40px -10px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
      }}
    >
      {children}
    </div>
  );
}
