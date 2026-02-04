import type { ScoringRule } from "../types";
import type { RuleResult } from "../../shared/types";

const ALL_URLS_PATTERNS = ["<all_urls>", "*://*/*", "http://*/*", "https://*/*"];

const SENSITIVE_DOMAIN_PATTERNS = [
  /bank/i,
  /paypal/i,
  /venmo/i,
  /stripe\.com/i,
  /mail\.google/i,
  /outlook/i,
  /github\.com/i,
  /gitlab\.com/i,
  /coinbase/i,
  /binance/i,
  /crypto/i,
  /facebook\.com/i,
  /twitter\.com/i,
  /x\.com/i,
  /1password/i,
  /lastpass/i,
  /bitwarden/i,
];

export const hostPermissionsRule: ScoringRule = {
  id: "host-permissions",
  category: "host-permissions",

  evaluate(ext): RuleResult[] {
    const results: RuleResult[] = [];
    const hosts = ext.hostPermissions ?? [];

    if (hosts.length === 0) return results;

    // Check for wildcard all-sites access
    const hasAllUrls = hosts.some((h) => ALL_URLS_PATTERNS.includes(h));
    if (hasAllUrls) {
      results.push({
        ruleId: "host-all-urls",
        category: "host-permissions",
        description: "Requests access to all websites",
        score: 25,
        severity: "critical",
      });
    }

    const specificDomains = hosts.filter(
      (h) => !ALL_URLS_PATTERNS.includes(h)
    );

    // Wildcard subdomains
    const wildcardDomains = specificDomains.filter((h) => h.includes("*."));
    if (wildcardDomains.length > 0) {
      results.push({
        ruleId: "host-wildcard-subdomains",
        category: "host-permissions",
        description: `Uses wildcard subdomain access on ${wildcardDomains.length} domain(s)`,
        score: Math.min(wildcardDomains.length * 3, 15),
        severity: "medium",
      });
    }

    // Many specific domains
    if (specificDomains.length > 10) {
      results.push({
        ruleId: "host-excessive-domains",
        category: "host-permissions",
        description: `Requests access to ${specificDomains.length} specific domains - unusually broad`,
        score: 10,
        severity: "high",
      });
    }

    // Sensitive domains
    for (const host of specificDomains) {
      for (const pattern of SENSITIVE_DOMAIN_PATTERNS) {
        if (pattern.test(host)) {
          results.push({
            ruleId: `host-sensitive-${host}`,
            category: "host-permissions",
            description: `Requests access to sensitive domain: "${host}"`,
            score: 8,
            severity: "high",
          });
          break;
        }
      }
    }

    return results;
  },
};
