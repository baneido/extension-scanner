import { describe, it, expect, beforeEach } from "vitest";
import { makeExt } from "./fixtures";
import { scoreExtension } from "../src/scoring/engine";
import { setBlocklistData } from "../src/scoring/rules/blocklist";

// Characterization of scoreExtension's aggregate score and risk classification.
// Risk thresholds (constants.ts): green < 30, yellow 30-69, red >= 70.

describe("scoreExtension", () => {
  beforeEach(() => {
    // Clear the blocklist so it contributes 0 to these score totals.
    setBlocklistData(new Map());
  });

  it("classifies a clean normal extension as green with score 0", () => {
    const scored = scoreExtension(makeExt());
    expect(scored.totalScore).toBe(0);
    expect(scored.riskLevel).toBe("green");
    expect(Array.isArray(scored.ruleResults)).toBe(true);
  });

  it("copies through extension metadata and maps icons", () => {
    const scored = scoreExtension(
      makeExt({
        id: "abcdefghijklmnopabcdefghijklmnop",
        name: "Demo",
        version: "2.3.4",
        icons: [{ size: 48, url: "https://example.com/i.png" }],
      })
    );
    expect(scored.id).toBe("abcdefghijklmnopabcdefghijklmnop");
    expect(scored.name).toBe("Demo");
    expect(scored.version).toBe("2.3.4");
    expect(scored.icons).toEqual([
      { size: 48, url: "https://example.com/i.png" },
    ]);
  });

  // Exact boundary fixtures (score noted alongside each).
  it("score 29 (tabs+history+webNavigation) is green", () => {
    const scored = scoreExtension(
      makeExt({ permissions: ["tabs", "history", "webNavigation"] })
    );
    expect(scored.totalScore).toBe(29);
    expect(scored.riskLevel).toBe("green");
  });

  it("score 30 (cookies+history+unlimitedStorage) is yellow", () => {
    const scored = scoreExtension(
      makeExt({ permissions: ["cookies", "history", "unlimitedStorage"] })
    );
    expect(scored.totalScore).toBe(30);
    expect(scored.riskLevel).toBe("yellow");
  });

  it("score 69 (cookies+webRequest+history+webNavigation incl. combo) is yellow", () => {
    const scored = scoreExtension(
      makeExt({
        permissions: ["cookies", "webRequest", "history", "webNavigation"],
      })
    );
    expect(scored.totalScore).toBe(69);
    expect(scored.riskLevel).toBe("yellow");
  });

  it("score 70 (previous set + idle) is red", () => {
    const scored = scoreExtension(
      makeExt({
        permissions: ["cookies", "webRequest", "history", "webNavigation", "idle"],
      })
    );
    expect(scored.totalScore).toBe(70);
    expect(scored.riskLevel).toBe("red");
  });

  it("adds the 100-point blocklist hit to the total", () => {
    const id = "blockedblockedblockedblockedbloc";
    setBlocklistData(new Map([[id, { reason: "bad", source: "test" }]]));
    const scored = scoreExtension(makeExt({ id }));
    expect(scored.totalScore).toBe(100);
    expect(scored.riskLevel).toBe("red");
  });
});
