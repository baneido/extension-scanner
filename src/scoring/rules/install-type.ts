import type { ScoringRule } from "../types";
import type { RuleResult } from "../../shared/types";

export const installTypeRule: ScoringRule = {
  id: "install-type",
  category: "install-type",

  evaluate(ext): RuleResult[] {
    const results: RuleResult[] = [];

    switch (ext.installType) {
      case "sideload":
        results.push({
          ruleId: "install-sideload",
          category: "install-type",
          description:
            "Sideloaded extension (installed outside Chrome Web Store)",
          score: 25,
          severity: "critical",
        });
        break;
      case "development":
        results.push({
          ruleId: "install-development",
          category: "install-type",
          description: "Extension loaded in developer mode (unpacked)",
          score: 15,
          severity: "high",
        });
        break;
      case "admin":
        results.push({
          ruleId: "install-admin",
          category: "install-type",
          description: "Extension force-installed by enterprise policy",
          score: 5,
          severity: "info",
        });
        break;
      case "normal":
        // Chrome Web Store from - lowest risk
        break;
    }

    return results;
  },
};
