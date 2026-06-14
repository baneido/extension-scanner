import { defineConfig } from "vitest/config";

// Separate from vite.config.ts: tests do not need the extension build pipeline
// (flattenHtmlPlugin, rollup inputs). Node environment is enough — the
// characterization tests cover pure scoring logic plus a stubbed chrome global.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
