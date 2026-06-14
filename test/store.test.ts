import { describe, it, expect, beforeEach, vi } from "vitest";
import { saveScanResult, loadScanResult } from "../src/storage/store";
import type { ScanResult } from "../src/shared/types";

let store: Record<string, unknown>;

function installChrome() {
  store = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) =>
          key in store ? { [key]: store[key] } : {}
        ),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        }),
      },
    },
  };
}

const sample: ScanResult = {
  extensions: [],
  summary: { total: 0, red: 0, yellow: 0, green: 0 },
  scannedAt: 123,
};

describe("scan result storage", () => {
  beforeEach(() => installChrome());

  it("returns null when nothing is stored", async () => {
    expect(await loadScanResult()).toBeNull();
  });

  it("round-trips a saved result and stamps schemaVersion", async () => {
    await saveScanResult(sample);
    const loaded = await loadScanResult();
    expect(loaded).toMatchObject(sample);
    expect(loaded?.schemaVersion).toBe(1);
  });

  it("accepts legacy data without schemaVersion (current shape stays valid)", async () => {
    store["lastScanResult"] = {
      extensions: [],
      summary: { total: 1, red: 0, yellow: 0, green: 1 },
      scannedAt: 5,
    };
    const loaded = await loadScanResult();
    expect(loaded).not.toBeNull();
    expect(loaded?.scannedAt).toBe(5);
    expect(loaded?.schemaVersion).toBeUndefined();
  });

  it("discards malformed data (extensions not an array)", async () => {
    store["lastScanResult"] = {
      extensions: "nope",
      summary: { total: 0, red: 0, yellow: 0, green: 0 },
      scannedAt: 1,
    };
    expect(await loadScanResult()).toBeNull();
  });

  it("discards data with a malformed summary", async () => {
    store["lastScanResult"] = {
      extensions: [],
      summary: { total: 0 },
      scannedAt: 1,
    };
    expect(await loadScanResult()).toBeNull();
  });
});
