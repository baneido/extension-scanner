import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// Static regression guards for the privacy fix (Debt Map F-5): the popup must
// not pull fonts (or anything) from a third party, and the manifest CSP must
// enforce that fonts/styles can only load from the extension itself.
const root = process.cwd();

describe("popup has no third-party font dependency", () => {
  const html = readFileSync(resolve(root, "src/popup/popup.html"), "utf-8");

  it("does not reference Google Fonts hosts", () => {
    expect(html).not.toMatch(/fonts\.googleapis\.com/);
    expect(html).not.toMatch(/fonts\.gstatic\.com/);
  });

  it("has no external (http) resource links", () => {
    expect(html).not.toMatch(/href="https?:\/\//i);
  });
});

describe("manifest CSP blocks remote styles and fonts", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(root, "public/manifest.json"), "utf-8")
  );
  const csp: string = manifest.content_security_policy?.extension_pages ?? "";

  it("restricts style-src and font-src to self", () => {
    expect(csp).toMatch(/style-src 'self'/);
    expect(csp).toMatch(/font-src 'self'/);
  });

  it("does not restrict connect-src (the blocklist fetch must keep working)", () => {
    // A connect-src 'self' would break the service worker's blocklist fetch
    // from raw.githubusercontent.com, so it is intentionally omitted.
    expect(csp).not.toMatch(/connect-src/);
  });
});
