import { describe, it, expect } from "vitest";
import { escapeHtml, largestIconUrl } from "../src/shared/utils";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters including quotes", () => {
    expect(escapeHtml(`<a href="x" id='y'>&`)).toBe(
      "&lt;a href=&quot;x&quot; id=&#39;y&#39;&gt;&amp;"
    );
  });

  it("escapes a double quote so a name cannot break out of an attribute", () => {
    // A malicious extension named like this must not inject extra attributes.
    expect(escapeHtml('Evil" style="display:none')).toBe(
      "Evil&quot; style=&quot;display:none"
    );
  });

  it("leaves benign text unchanged", () => {
    expect(escapeHtml("My Extension 1.0")).toBe("My Extension 1.0");
  });
});

describe("largestIconUrl", () => {
  it("returns the last (largest) icon url", () => {
    expect(
      largestIconUrl([
        { size: 16, url: "a" },
        { size: 48, url: "b" },
      ])
    ).toBe("b");
  });

  it("returns empty string when there are no icons", () => {
    expect(largestIconUrl([])).toBe("");
  });
});
