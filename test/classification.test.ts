import { describe, it, expect } from "vitest";
import { isBlocklisted, riskOrdinal } from "../src/scoring/classification";
import type { ScoredExtension } from "../src/shared/types";

function ext(ruleIds: string[]): ScoredExtension {
  return {
    id: "id",
    name: "Ext",
    version: "1",
    description: "",
    enabled: true,
    installType: "normal",
    type: "extension",
    permissions: [],
    hostPermissions: [],
    icons: [],
    mayDisable: true,
    totalScore: 0,
    riskLevel: "green",
    ruleResults: ruleIds.map((ruleId) => ({
      ruleId,
      category: "x",
      description: "",
      score: 0,
      severity: "info" as const,
    })),
    scannedAt: 0,
  };
}

describe("riskOrdinal", () => {
  it("orders green < yellow < red", () => {
    expect(riskOrdinal("green")).toBeLessThan(riskOrdinal("yellow"));
    expect(riskOrdinal("yellow")).toBeLessThan(riskOrdinal("red"));
  });
});

describe("isBlocklisted", () => {
  it("is true when a blocklist-match result is present", () => {
    expect(isBlocklisted(ext(["blocklist-match"]))).toBe(true);
    expect(isBlocklisted(ext(["perm-cookies", "blocklist-match"]))).toBe(true);
  });

  it("is false otherwise", () => {
    expect(isBlocklisted(ext([]))).toBe(false);
    expect(isBlocklisted(ext(["perm-cookies", "host-all-urls"]))).toBe(false);
  });
});
