import { defineConfig, type Plugin } from "vite";
import { resolve, basename } from "path";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  readdirSync,
} from "fs";

// Single source of truth for HTML entry pages. Used both as rollup inputs and
// by flattenHtmlPlugin to move/flatten them — so the two can never diverge.
// The key becomes the emitted JS entry name (e.g. popup -> popup.js).
const HTML_PAGES: Record<string, string> = {
  popup: "src/popup/popup.html",
  dashboard: "src/dashboard/dashboard.html",
};

// Recursively collect *.html paths under a directory.
function findHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findHtmlFiles(full));
    } else if (entry.name.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

// Plugin to flatten HTML outputs to dist root and fix paths
function flattenHtmlPlugin(): Plugin {
  return {
    name: "flatten-html",
    closeBundle() {
      const distDir = resolve(__dirname, "dist");

      // Move each configured HTML page from its nested dir to dist root.
      for (const from of Object.values(HTML_PAGES)) {
        const srcPath = resolve(distDir, from);
        const destPath = resolve(distDir, basename(from));
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

      // Clean up nested src dir. The configured pages were copied (not moved)
      // to dist root, so their originals still live here and get removed below.
      // But fail loudly if an UNCONFIGURED .html was built into dist/src — that
      // would otherwise be silently deleted instead of flattened.
      const srcDir = resolve(distDir, "src");
      if (existsSync(srcDir)) {
        const expected = new Set(
          Object.values(HTML_PAGES).map((f) => resolve(distDir, f))
        );
        const leftover = findHtmlFiles(srcDir).filter((f) => !expected.has(f));
        if (leftover.length > 0) {
          const rel = leftover.map((f) => f.slice(distDir.length + 1));
          throw new Error(
            `flatten-html: HTML built into dist/src but not in HTML_PAGES: ${rel.join(
              ", "
            )}. Add it to HTML_PAGES in vite.config.ts so it is flattened, not deleted.`
          );
        }
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
        ...Object.fromEntries(
          Object.entries(HTML_PAGES).map(([name, path]) => [
            name,
            resolve(__dirname, path),
          ])
        ),
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
