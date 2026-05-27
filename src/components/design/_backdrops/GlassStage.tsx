import type { ReactNode } from "react";

const BACKDROPS = {
  abstract: "/design-backdrops/abstract_gradient_wallpaper.png",
  nature: "/design-backdrops/nature_wallpaper.png",
} as const;

export type GlassBackdrop = keyof typeof BACKDROPS;

export function GlassStage({
  children,
  variant = "abstract",
}: {
  children: ReactNode;
  variant?: GlassBackdrop;
}) {
  return (
    <div
      className="relative -m-10 min-h-screen overflow-hidden rounded-none p-10"
      style={{
        backgroundImage: `url('${BACKDROPS[variant]}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {children}
    </div>
  );
}
