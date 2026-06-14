import { describe, it, expect, beforeEach } from "vitest";
import { makeExt } from "./fixtures";
import { blocklistRule, setBlocklistData } from "../src/scoring/rules/blocklist";
import { permissionsRule } from "../src/scoring/rules/permissions";
import { hostPermissionsRule } from "../src/scoring/rules/host-permissions";
import { installTypeRule } from "../src/scoring/rules/install-type";
import { metadataRule } from "../src/scoring/rules/metadata";

// These tests pin CURRENT behavior (characterization). They are the safety net
// for later phases — they must keep passing unchanged through Phases 3 and 5.
// Where current behavior is a known bug, the test is annotated with the
// Debt Map ID so a future fix updates it deliberately rather than by accident.

describe("blocklistRule", () => {
  beforeEach(() => {
    // Reset the module-global blocklist between tests (see Debt Map A-2).
    setBlocklistData(new Map());
  });

  it("returns no result when the blocklist is uninitialized (null)", () => {
    // Re-create the null state by importing a fresh evaluation path: the rule
    // returns [] both when the map is empty and when it is null. We pin the
    // empty-map case here; the null case is covered by code inspection.
    expect(blocklistRule.evaluate(makeExt())).toEqual([]);
  });

  it("returns no result for an extension not on the blocklist", () => {
    setBlocklistData(
      new Map([["someotherid", { reason: "bad", source: "test" }]])
    );
    expect(blocklistRule.evaluate(makeExt({ id: "cleanid" }))).toEqual([]);
  });

  it("returns a 100-point critical result for a blocklisted extension", () => {
    const id = "maliciousidmaliciousidmalicious1";
    setBlocklistData(
      new Map([[id, { reason: "Known malicious extension (test)", source: "test" }]])
    );
    expect(blocklistRule.evaluate(makeExt({ id }))).toEqual([
      {
        ruleId: "blocklist-match",
        category: "blocklist",
        description: "Known malicious extension: Known malicious extension (test)",
        score: 100,
        severity: "critical",
      },
    ]);
  });
});

describe("permissionsRule", () => {
  it("scores individual permissions and dangerous combos", () => {
    const result = permissionsRule.evaluate(
      makeExt({ permissions: ["cookies", "webRequest"] })
    );
    expect(result).toEqual([
      {
        ruleId: "perm-cookies",
        category: "permissions",
        description: 'Requests "cookies" permission (+15)',
        score: 15,
        severity: "critical",
      },
      {
        ruleId: "perm-webRequest",
        category: "permissions",
        description: 'Requests "webRequest" permission (+15)',
        score: 15,
        severity: "critical",
      },
      {
        ruleId: "combo-cookies+webRequest",
        category: "permissions",
        description:
          "Can intercept traffic and steal cookies - session hijacking risk",
        score: 20,
        severity: "critical",
      },
    ]);
  });

  it("ignores zero-weight permissions and flags unknown ones at +5", () => {
    const result = permissionsRule.evaluate(
      makeExt({ permissions: ["storage", "alarms", "somethingNew"] })
    );
    expect(result).toEqual([
      {
        ruleId: "perm-unknown-somethingNew",
        category: "permissions",
        description: 'Requests unknown permission "somethingNew" (+5)',
        score: 5,
        severity: "medium",
      },
    ]);
  });

  it("adds an excessive-scope finding at 6+ risky permissions", () => {
    const result = permissionsRule.evaluate(
      makeExt({
        permissions: [
          "cookies",
          "webRequest",
          "tabs",
          "scripting",
          "history",
          "proxy",
        ],
      })
    );
    const excessive = result.find((r) => r.ruleId === "perm-excessive-count");
    expect(excessive).toEqual({
      ruleId: "perm-excessive-count",
      category: "permissions",
      description: "Requests 6 high-risk permissions - excessive scope",
      score: 10,
      severity: "high",
    });
  });
});

describe("hostPermissionsRule", () => {
  it("flags <all_urls> at 25 critical", () => {
    expect(
      hostPermissionsRule.evaluate(makeExt({ hostPermissions: ["<all_urls>"] }))
    ).toEqual([
      {
        ruleId: "host-all-urls",
        category: "host-permissions",
        description: "Requests access to all websites",
        score: 25,
        severity: "critical",
      },
    ]);
  });

  it("flags wildcard subdomains and sensitive domains", () => {
    const result = hostPermissionsRule.evaluate(
      makeExt({ hostPermissions: ["https://*.bankofamerica.com/*"] })
    );
    expect(result).toEqual([
      {
        ruleId: "host-wildcard-subdomains",
        category: "host-permissions",
        description: "Uses wildcard subdomain access on 1 domain(s)",
        score: 3,
        severity: "medium",
      },
      {
        ruleId: "host-sensitive-https://*.bankofamerica.com/*",
        category: "host-permissions",
        description:
          'Requests access to sensitive domain: "https://*.bankofamerica.com/*"',
        score: 8,
        severity: "high",
      },
    ]);
  });

  it("KNOWN BUG (Debt Map F-2): netflix.com matches the /x.com/ substring pattern", () => {
    const result = hostPermissionsRule.evaluate(
      makeExt({ hostPermissions: ["https://netflix.com/*"] })
    );
    expect(result).toEqual([
      {
        ruleId: "host-sensitive-https://netflix.com/*",
        category: "host-permissions",
        description:
          'Requests access to sensitive domain: "https://netflix.com/*"',
        score: 8,
        severity: "high",
      },
    ]);
  });

  it("returns nothing when there are no host permissions", () => {
    expect(hostPermissionsRule.evaluate(makeExt({ hostPermissions: [] }))).toEqual(
      []
    );
  });
});

describe("installTypeRule", () => {
  it("scores sideload, development, admin; ignores normal", () => {
    expect(installTypeRule.evaluate(makeExt({ installType: "normal" }))).toEqual(
      []
    );
    expect(
      installTypeRule.evaluate(makeExt({ installType: "sideload" }))
    ).toEqual([
      {
        ruleId: "install-sideload",
        category: "install-type",
        description: "Sideloaded extension (installed outside Chrome Web Store)",
        score: 25,
        severity: "critical",
      },
    ]);
    expect(
      installTypeRule.evaluate(makeExt({ installType: "development" }))
    ).toEqual([
      {
        ruleId: "install-development",
        category: "install-type",
        description: "Extension loaded in developer mode (unpacked)",
        score: 15,
        severity: "high",
      },
    ]);
    expect(installTypeRule.evaluate(makeExt({ installType: "admin" }))).toEqual([
      {
        ruleId: "install-admin",
        category: "install-type",
        description: "Extension force-installed by enterprise policy",
        score: 5,
        severity: "info",
      },
    ]);
  });
});

describe("metadataRule", () => {
  it("returns nothing for a well-formed normal extension", () => {
    expect(metadataRule.evaluate(makeExt())).toEqual([]);
  });

  it("flags a missing homepage", () => {
    expect(
      metadataRule.evaluate(makeExt({ homepageUrl: undefined }))
    ).toEqual([
      {
        ruleId: "meta-no-homepage",
        category: "metadata",
        description: "Homepage URL is not set",
        score: 5,
        severity: "low",
      },
    ]);
  });

  it("flags a non-standard update URL", () => {
    const result = metadataRule.evaluate(
      makeExt({ updateUrl: "https://evil.example.com/update.xml" })
    );
    expect(result).toContainEqual({
      ruleId: "meta-custom-update-url",
      category: "metadata",
      description: "Non-standard update URL: https://evil.example.com/update.xml",
      score: 15,
      severity: "high",
    });
  });

  it("flags a short description", () => {
    expect(metadataRule.evaluate(makeExt({ description: "short" }))).toContainEqual(
      {
        ruleId: "meta-no-description",
        category: "metadata",
        description: "Extension description is missing or very short",
        score: 5,
        severity: "low",
      }
    );
  });

  it("flags impersonation name patterns", () => {
    expect(metadataRule.evaluate(makeExt({ name: "Google Docs" }))).toContainEqual(
      {
        ruleId: "meta-name-impersonation-google",
        category: "metadata",
        description: "Name starts with 'Google' - possible impersonation",
        score: 10,
        severity: "high",
      }
    );
  });

  it("flags an extension the user cannot disable", () => {
    expect(metadataRule.evaluate(makeExt({ mayDisable: false }))).toContainEqual({
      ruleId: "meta-cannot-disable",
      category: "metadata",
      description: "Extension cannot be disabled by user",
      score: 10,
      severity: "high",
    });
  });
});
