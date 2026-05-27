import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DeepGlassCardProps {
  children?: ReactNode;
  className?: string;
  radius?: number;
}

export function DeepGlassCard({
  children,
  className,
  radius = 24,
}: DeepGlassCardProps) {
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{
        borderRadius: radius,
        background: "rgba(255,255,255,0.06)",
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow:
          "0 30px 60px -20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.24), inset 0 -1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 60%)",
          borderRadius: `${radius}px ${radius}px 0 0`,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
