import { describe, it, expect } from "vitest";
import { parseBlocklist } from "../src/data/blocklist-fetcher";

describe("parseBlocklist", () => {
  it("maps an array of id strings to blocklist entries", () => {
    const list = parseBlocklist(["aaaa", "bbbb"]);
    expect(list.size).toBe(2);
    expect(list.get("aaaa")).toEqual({
      reason: "Known malicious extension (chrome-mal-ids)",
      source: "chrome-mal-ids",
    });
  });

  it("keeps only non-empty string ids", () => {
    const list = parseBlocklist(["good", "", 123, null, "also-good"]);
    expect([...list.keys()]).toEqual(["good", "also-good"]);
  });

  it("throws on an empty array (would otherwise disable the rule)", () => {
    expect(() => parseBlocklist([])).toThrow();
  });

  it("throws on a non-array payload (e.g. shape change to an object)", () => {
    expect(() => parseBlocklist({ ids: ["x"] })).toThrow();
  });

  it("throws when no entries are valid strings", () => {
    expect(() => parseBlocklist([1, 2, 3])).toThrow();
  });
});
