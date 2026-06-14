import { describe, it, expect } from "vitest";
import { FALLBACK_MALICIOUS_IDS } from "../src/data/blocklist-fallback";

// The fallback must never be empty — that was the silent fail-open this whole
// effort exists to prevent (Debt Map F-4). A fresh install with an unreachable
// source still gets baseline coverage from the committed snapshot.
describe("fallback blocklist snapshot", () => {
  it("ships a non-trivial number of known-malicious IDs", () => {
    expect(FALLBACK_MALICIOUS_IDS.size).toBeGreaterThan(100);
  });

  it("entries carry a reason and source", () => {
    const first = [...FALLBACK_MALICIOUS_IDS.values()][0]!;
    expect(typeof first.reason).toBe("string");
    expect(first.reason.length).toBeGreaterThan(0);
    expect(first.source).toBe("chrome-mal-ids snapshot");
  });

  it("keys look like Chrome extension IDs", () => {
    for (const id of FALLBACK_MALICIOUS_IDS.keys()) {
      expect(id).toMatch(/^[a-p]{32}$/);
    }
  });
});
