import { canvasViewport } from "@/lib/canvasViewport";

// Scoped here, not in the root layout, so the landing page at `/` keeps browser
// zoom. See src/lib/canvasViewport.ts. Inert in the Tauri editor window, which
// has no browser pinch-zoom to suppress.
export const viewport = canvasViewport;

export default function EditorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
