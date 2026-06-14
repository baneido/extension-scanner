import { describe, it, expect } from "vitest";
import { parseBlocklist } from "../src/data/blocklist-fetcher";

// Payload shape mirrors chrome-mal-ids current-list.json: { meta, extensions }.
function payload(extensions: unknown[]) {
  return { meta: { total: extensions.length }, extensions };
}

describe("parseBlocklist", () => {
  it("maps chrome and both entries to blocklist entries", () => {
    const list = parseBlocklist(
      payload([
        {
          ext_id: "aaaa",
          browser: "chrome",
          date_added: "2026-01-01",
          source: "https://example.com/report",
        },
        { ext_id: "bbbb", browser: "both" },
      ])
    );
    expect(list.size).toBe(2);
    expect(list.get("aaaa")).toEqual({
      reason: "Listed in the chrome-mal-ids IOC database (added 2026-01-01)",
      source: "https://example.com/report",
    });
    expect(list.get("bbbb")).toEqual({
      reason: "Listed in the chrome-mal-ids IOC database",
      source: "chrome-mal-ids (TPCI)",
    });
  });

  it("skips edge-only entries and malformed rows", () => {
    const list = parseBlocklist(
      payload([
        { ext_id: "keep", browser: "chrome" },
        { ext_id: "edgeonly", browser: "edge" },
        { ext_id: "", browser: "chrome" },
        { browser: "chrome" },
        null,
        "not-an-object",
      ])
    );
    expect([...list.keys()]).toEqual(["keep"]);
  });

  it("throws on a non-object payload (e.g. the old array format)", () => {
    expect(() => parseBlocklist(["aaaa"])).toThrow();
    expect(() => parseBlocklist(null)).toThrow();
  });

  it("throws when extensions is missing or not an array", () => {
    expect(() => parseBlocklist({ meta: {} })).toThrow();
    expect(() => parseBlocklist({ extensions: "nope" })).toThrow();
  });

  it("throws when no entries are importable (empty or all edge)", () => {
    expect(() => parseBlocklist(payload([]))).toThrow();
    expect(() =>
      parseBlocklist(payload([{ ext_id: "x", browser: "edge" }]))
    ).toThrow();
  });
});
