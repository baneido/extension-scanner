import type { ScoringRule } from "../types";
import type { RuleResult } from "../../shared/types";

const ALL_URLS_PATTERNS = ["<all_urls>", "*://*/*", "http://*/*", "https://*/*"];

// Sensitive registrable domains, matched at host-label boundaries (exact host
// or a subdomain), never as a raw-string substring. This is what kills the
// F-2 false positives (netflix.com no longer matches "x.com", burbankca.gov no
// longer matches "bank") while still flagging real subdomains like
// login.paypal.com and *.bankofamerica.com.
const SENSITIVE_DOMAINS = [
  "paypal.com",
  "venmo.com",
  "stripe.com",
  "coinbase.com",
  "binance.com",
  "github.com",
  "gitlab.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "outlook.com",
  "1password.com",
  "lastpass.com",
  "bitwarden.com",
  "mail.google.com",
];

// Category keyword tokens matched against a whole host label by prefix, so
// "bankofamerica" (label starts with "bank") hits but "burbankca" does not.
const SENSITIVE_LABEL_TOKENS = ["bank", "crypto"];

const SENSITIVE_PER_HOST = 8;
// Strictly below the <all_urls> score (25) so that broad all-sites access
// always dominates narrowly-scoped sensitive access (least-privilege ordering).
const SENSITIVE_CAP = 24;

/** Extract and normalize the host authority from a match pattern, or null. */
function patternHost(pattern: string): string | null {
  const m = /^[a-z*]+:\/\/([^/]+)\//i.exec(pattern);
  if (!m) return null;
  let host = m[1]!.toLowerCase();
  if (host === "*") return null; // host wildcard is not a specific sensitive host
  host = host.replace(/^\*\./, ""); // strip a leading "*." subdomain wildcard
  return host;
}

function isSensitiveHost(host: string): boolean {
  if (
    SENSITIVE_DOMAINS.some((d) => host === d || host.endsWith("." + d))
  ) {
    return true;
  }
  const labels = host.split(".");
  return SENSITIVE_LABEL_TOKENS.some((tok) =>
    labels.some((label) => label.startsWith(tok))
  );
}

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

    // Sensitive domains: parse each pattern to its host, match at label
    // boundaries, and emit ONE aggregated, capped finding so the score can
    // never exceed (or invert) the <all_urls> signal.
    const sensitiveHosts = specificDomains
      .map(patternHost)
      .filter((h): h is string => h !== null)
      .filter(isSensitiveHost);

    if (sensitiveHosts.length > 0) {
      const unique = [...new Set(sensitiveHosts)];
      results.push({
        ruleId: "host-sensitive-domains",
        category: "host-permissions",
        description: `Requests access to ${unique.length} sensitive domain(s): ${unique.join(", ")}`,
        score: Math.min(unique.length * SENSITIVE_PER_HOST, SENSITIVE_CAP),
        severity: "high",
      });
    }

    return results;
  },
};
