import { describe, it, expect, beforeEach, vi } from "vitest";
import { isBlocklistStale } from "../src/shared/utils";
import { getBlocklistStatus } from "../src/data/blocklist-fetcher";
import { BLOCKLIST_STALE_AFTER_MS } from "../src/shared/constants";
import type { BlocklistStatus } from "../src/shared/types";

const NOW = 1_000_000_000_000;

function status(over: Partial<BlocklistStatus>): BlocklistStatus {
  return {
    updatedAt: NOW,
    count: 3000,
    lastFetchOk: true,
    lastAttemptAt: NOW,
    ...over,
  };
}

describe("isBlocklistStale", () => {
  it("is fresh when recently updated and the last fetch succeeded", () => {
    expect(isBlocklistStale(status({}), NOW)).toBe(false);
  });

  it("is stale when never updated", () => {
    expect(isBlocklistStale(status({ updatedAt: null }), NOW)).toBe(true);
  });

  it("is stale when older than the staleness budget", () => {
    const old = NOW - BLOCKLIST_STALE_AFTER_MS - 1;
    expect(isBlocklistStale(status({ updatedAt: old }), NOW)).toBe(true);
  });

  it("is stale when the most recent fetch failed (early warning)", () => {
    expect(isBlocklistStale(status({ lastFetchOk: false }), NOW)).toBe(true);
  });
});

describe("getBlocklistStatus", () => {
  beforeEach(() => {
    (globalThis as any).chrome = {
      storage: { local: { get: vi.fn(async () => ({})) } },
    };
  });

  it("returns safe defaults when nothing is stored", async () => {
    expect(await getBlocklistStatus()).toEqual({
      updatedAt: null,
      count: 0,
      lastFetchOk: false,
      lastAttemptAt: null,
    });
  });

  it("merges defaults over a partial stored status", async () => {
    (globalThis as any).chrome.storage.local.get = vi.fn(async () => ({
      blocklistStatus: { updatedAt: 5, count: 10 },
    }));
    const s = await getBlocklistStatus();
    expect(s.updatedAt).toBe(5);
    expect(s.count).toBe(10);
    expect(s.lastFetchOk).toBe(false);
  });
});
