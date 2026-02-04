import type { ScoringRule } from "../types";
import type { RuleResult } from "../../shared/types";
import type { BlocklistEntry } from "../../data/blocklist-fetcher";

let cachedBlocklist: Map<string, BlocklistEntry> | null = null;

/**
 * Set the blocklist data to be used by this rule.
 * Called from the service worker after fetching the blocklist.
 */
export function setBlocklistData(
  list: Map<string, BlocklistEntry>
): void {
  cachedBlocklist = list;
}

export const blocklistRule: ScoringRule = {
  id: "blocklist",
  category: "blocklist",

  evaluate(ext): RuleResult[] {
    if (!cachedBlocklist) return [];

    const entry = cachedBlocklist.get(ext.id);
    if (entry) {
      return [
        {
          ruleId: "blocklist-match",
          category: "blocklist",
          description: `Known malicious extension: ${entry.reason}`,
          score: 100,
          severity: "critical",
        },
      ];
    }
    return [];
  },
};
