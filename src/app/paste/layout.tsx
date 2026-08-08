import { canvasViewport } from "@/lib/canvasViewport";

// Scoped here, not in the root layout, so the landing page at `/` keeps browser
// zoom. See src/lib/canvasViewport.ts.
export const viewport = canvasViewport;

export default function PasteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
