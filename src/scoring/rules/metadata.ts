import { SUSPICIOUS_NAME_PATTERNS } from "../../data/suspicious-patterns";
import type { ScoringRule } from "../types";
import type { RuleResult } from "../../shared/types";

export const metadataRule: ScoringRule = {
  id: "metadata",
  category: "metadata",

  evaluate(ext): RuleResult[] {
    const results: RuleResult[] = [];

    // Missing homepage URL
    if (!ext.homepageUrl) {
      results.push({
        ruleId: "meta-no-homepage",
        category: "metadata",
        description: "Homepage URL is not set",
        score: 5,
        severity: "low",
      });
    }

    // Non-standard update URL
    if (
      ext.updateUrl &&
      !ext.updateUrl.includes("clients2.google.com") &&
      !ext.updateUrl.includes("edge.microsoft.com")
    ) {
      results.push({
        ruleId: "meta-custom-update-url",
        category: "metadata",
        description: `Non-standard update URL: ${ext.updateUrl}`,
        score: 15,
        severity: "high",
      });
    }

    // Missing or very short description
    if (!ext.description || ext.description.length < 10) {
      results.push({
        ruleId: "meta-no-description",
        category: "metadata",
        description: "Extension description is missing or very short",
        score: 5,
        severity: "low",
      });
    }

    // Suspicious name patterns
    for (const pattern of SUSPICIOUS_NAME_PATTERNS) {
      if (pattern.regex.test(ext.name)) {
        results.push({
          ruleId: `meta-name-${pattern.id}`,
          category: "metadata",
          description: pattern.description,
          score: pattern.score,
          severity: pattern.severity,
        });
      }
    }

    // Cannot be disabled by user (not admin-installed)
    if (!ext.mayDisable && ext.installType !== "admin") {
      results.push({
        ruleId: "meta-cannot-disable",
        category: "metadata",
        description: "Extension cannot be disabled by user",
        score: 10,
        severity: "high",
      });
    }

    return results;
  },
};
