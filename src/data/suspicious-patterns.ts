import type { RuleResult } from "../shared/types";

export interface SuspiciousPattern {
  id: string;
  regex: RegExp;
  description: string;
  score: number;
  severity: RuleResult["severity"];
  // "non-store": only apply for non-Web-Store installs. Brand-name
  // impersonation is the real vector for sideloaded/dev extensions; genuine
  // first-party extensions ship from the store, so applying it there only
  // produces false positives (Debt Map F-3).
  scope?: "non-store";
}

export const SUSPICIOUS_NAME_PATTERNS: SuspiciousPattern[] = [
  {
    id: "impersonation-google",
    regex: /^google\s/i,
    description: "Name starts with 'Google' on a non-store install - possible impersonation",
    score: 10,
    severity: "high",
    scope: "non-store",
  },
  {
    id: "impersonation-chrome",
    regex: /^chrome\s/i,
    description: "Name starts with 'Chrome' on a non-store install - possible impersonation",
    score: 10,
    severity: "high",
    scope: "non-store",
  },
  {
    id: "generic-vpn",
    regex: /\b(free\s+vpn|vpn\s+free)\b/i,
    description: "'Free VPN' pattern - often used for data collection",
    score: 15,
    severity: "high",
  },
  {
    id: "generic-update",
    regex: /\b(flash\s+player|update\s+required|browser\s+update)\b/i,
    description: "Social engineering name pattern",
    score: 20,
    severity: "critical",
  },
  {
    id: "obfuscated-name",
    regex: /^[a-z]{20,}$/i,
    description: "Unusually long word name - possibly auto-generated",
    score: 8,
    severity: "medium",
  },
];
