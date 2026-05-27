import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Used by Ladle (design system). Next.js ignores this file.
export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  css: {
    // Disable Next-style postcss.config.mjs autoload; @tailwindcss/vite handles CSS.
    postcss: { plugins: [] },
  },
});
