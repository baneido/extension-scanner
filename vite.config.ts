import { defineConfig, type Plugin } from "vite";
import { resolve } from "path";
import { readFileSync, writeFileSync, renameSync, existsSync, rmSync } from "fs";

// Plugin to flatten HTML outputs to dist root and fix paths
function flattenHtmlPlugin(): Plugin {
  return {
    name: "flatten-html",
    closeBundle() {
      const distDir = resolve(__dirname, "dist");

      // Move HTML files from nested dirs to root
      const htmlMoves = [
        { from: "src/popup/popup.html", to: "popup.html" },
        { from: "src/dashboard/dashboard.html", to: "dashboard.html" },
      ];

      for (const { from, to } of htmlMoves) {
        const srcPath = resolve(distDir, from);
        const destPath = resolve(distDir, to);
        if (existsSync(srcPath)) {
          let content = readFileSync(srcPath, "utf-8");
          // Remove crossorigin attributes (not needed for local extension)
          content = content.replace(/\s*crossorigin/g, "");
          // Fix relative paths: ../../X -> ./X (HTML was in src/popup/ or src/dashboard/)
          content = content.replace(/(?:src|href)="\.\.\/\.\.\//g, (match) =>
            match.replace("../../", "./")
          );
          writeFileSync(destPath, content);
        }
      }

      // Clean up nested src dir
      const srcDir = resolve(distDir, "src");
      if (existsSync(srcDir)) {
        rmSync(srcDir, { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [flattenHtmlPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        "service-worker": resolve(__dirname, "src/background/service-worker.ts"),
        popup: resolve(__dirname, "src/popup/popup.html"),
        dashboard: resolve(__dirname, "src/dashboard/dashboard.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
  publicDir: "public",
});
