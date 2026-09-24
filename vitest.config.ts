import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Component tests compile TSX with the automatic runtime, so test files do
  // not have to import React (the app is on React 19 / Next's jsx transform).
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    // Node by default; component tests opt into jsdom with a per-file
    // `// @vitest-environment jsdom` pragma (see SettingRow.test.tsx).
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "worker/src/**/*.test.ts"],
  },
});
