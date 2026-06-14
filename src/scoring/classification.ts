import type { RiskLevel, ScoredExtension } from "../shared/types";

/** Risk levels as a comparable ordinal (higher = worse). */
export function riskOrdinal(level: RiskLevel): number {
  return level === "red" ? 2 : level === "yellow" ? 1 : 0;
}

/**
 * Whether the extension matched the known-malware blocklist. Keyed on the
 * blocklist rule's result id (not a score threshold) so it tracks the actual
 * signal regardless of future scoring changes. Blocklisted extensions are
 * never silenceable by allowlist/dismiss and always notify (Debt Map Q2).
 */
export function isBlocklisted(ext: ScoredExtension): boolean {
  return ext.ruleResults.some((r) => r.ruleId === "blocklist-match");
}
