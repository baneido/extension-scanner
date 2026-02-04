import type { RuleResult } from "../shared/types";

export interface ScoringRule {
  id: string;
  category: string;
  evaluate(ext: chrome.management.ExtensionInfo): RuleResult[];
}
