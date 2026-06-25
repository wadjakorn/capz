import type { ReactNode } from "react";

export function GlassStage({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-[320px] flex-wrap items-center justify-center gap-6 rounded-2xl p-10"
      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
    >
      {children}
    </div>
  );
}
