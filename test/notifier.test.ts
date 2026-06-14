import { describe, it, expect, beforeEach, vi } from "vitest";
import { notifyNewThreats } from "../src/alerts/notifier";
import type { ScanResult, ScoredExtension } from "../src/shared/types";

// Characterization of notifyNewThreats. Pins the CURRENT id-only diff behavior
// (Debt Map A-7): only extensions absent from the previous scan can notify, so
// risk escalations of existing extensions never notify, and dismiss/allowlist
// only take effect for never-before-seen ids.

function scored(over: Partial<ScoredExtension>): ScoredExtension {
  return {
    id: "id",
    name: "Ext",
    version: "1.0.0",
    description: "",
    enabled: true,
    installType: "normal",
    type: "extension",
    permissions: [],
    hostPermissions: [],
    icons: [],
    mayDisable: true,
    totalScore: 80,
    riskLevel: "red",
    ruleResults: [],
    scannedAt: 0,
    ...over,
  };
}

function result(exts: ScoredExtension[]): ScanResult {
  return {
    extensions: exts,
    summary: { total: exts.length, red: 0, yellow: 0, green: 0 },
    scannedAt: 0,
  };
}

let createSpy: ReturnType<typeof vi.fn>;

function installChrome(prefs: Record<string, unknown> = {}) {
  // create() returns Promise<string> in MV3; mirror that so .catch() works.
  createSpy = vi.fn(async () => "notification-id");
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async () => ({ userPreferences: prefs })),
      },
    },
    notifications: { create: createSpy },
    runtime: { getURL: (p: string) => `chrome-extension://test/${p}` },
  };
}

describe("notifyNewThreats", () => {
  beforeEach(() => {
    installChrome();
  });

  it("notifies for a newly appeared red extension (default prefs)", async () => {
    const prev = result([]);
    const curr = result([scored({ id: "new1", riskLevel: "red" })]);
    await notifyNewThreats(prev, curr);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0]).toBe("threat-new1");
  });

  it("Debt Map A-7: notifies an escalation of an existing extension (yellow -> red)", async () => {
    const prev = result([scored({ id: "keep", riskLevel: "yellow", totalScore: 40 })]);
    const curr = result([scored({ id: "keep", riskLevel: "red", totalScore: 80 })]);
    await notifyNewThreats(prev, curr);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0]).toBe("escalation-keep");
  });

  it("does NOT re-notify an unchanged existing red extension (fatigue fix)", async () => {
    const prev = result([scored({ id: "keep", riskLevel: "red" })]);
    const curr = result([scored({ id: "keep", riskLevel: "red" })]);
    await notifyNewThreats(prev, curr);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("notifies an escalation even when the extension is allowlisted (state changed)", async () => {
    installChrome({ customAllowlist: ["esc"] });
    const prev = result([scored({ id: "esc", riskLevel: "yellow", totalScore: 35 })]);
    const curr = result([scored({ id: "esc", riskLevel: "red", totalScore: 75 })]);
    await notifyNewThreats(prev, curr);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0]).toBe("escalation-esc");
  });

  it("Q2 guardrail: a blocklisted extension notifies even if allowlisted+dismissed", async () => {
    installChrome({ customAllowlist: ["bad"], dismissedExtensionIds: ["bad"] });
    const prev = result([]);
    const curr = result([
      scored({
        id: "bad",
        riskLevel: "red",
        ruleResults: [
          {
            ruleId: "blocklist-match",
            category: "blocklist",
            description: "",
            score: 100,
            severity: "critical",
          },
        ],
      }),
    ]);
    await notifyNewThreats(prev, curr);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0]).toBe("threat-bad");
  });

  it("does not notify for a new yellow extension under default prefs", async () => {
    const prev = result([]);
    const curr = result([scored({ id: "y1", riskLevel: "yellow", totalScore: 40 })]);
    await notifyNewThreats(prev, curr);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("notifies for a new yellow extension when notifyOnNewYellowExtension is enabled", async () => {
    installChrome({ notifyOnNewYellowExtension: true });
    const prev = result([]);
    const curr = result([scored({ id: "y2", riskLevel: "yellow", totalScore: 40 })]);
    await notifyNewThreats(prev, curr);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0]).toBe("warning-y2");
  });

  it("suppresses a NEW red extension that is dismissed (A-7: works only for new ids)", async () => {
    installChrome({ dismissedExtensionIds: ["d1"] });
    const prev = result([]);
    const curr = result([scored({ id: "d1", riskLevel: "red" })]);
    await notifyNewThreats(prev, curr);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("suppresses a NEW red extension that is allowlisted", async () => {
    installChrome({ customAllowlist: ["a1"] });
    const prev = result([]);
    const curr = result([scored({ id: "a1", riskLevel: "red" })]);
    await notifyNewThreats(prev, curr);
    expect(createSpy).not.toHaveBeenCalled();
  });
});
