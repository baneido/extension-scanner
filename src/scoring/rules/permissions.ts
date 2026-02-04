import {
  PERMISSION_WEIGHTS,
  DANGEROUS_COMBOS,
} from "../../data/permission-weights";
import type { ScoringRule } from "../types";
import type { RuleResult } from "../../shared/types";

export const permissionsRule: ScoringRule = {
  id: "permissions",
  category: "permissions",

  evaluate(ext): RuleResult[] {
    const results: RuleResult[] = [];
    const perms = new Set(ext.permissions ?? []);

    // Score individual permissions
    for (const perm of perms) {
      const weight = PERMISSION_WEIGHTS[perm];
      if (weight !== undefined && weight > 0) {
        results.push({
          ruleId: `perm-${perm}`,
          category: "permissions",
          description: `Requests "${perm}" permission (+${weight})`,
          score: weight,
          severity: weight >= 15 ? "critical" : weight >= 10 ? "high" : "medium",
        });
      }
      if (weight === undefined) {
        results.push({
          ruleId: `perm-unknown-${perm}`,
          category: "permissions",
          description: `Requests unknown permission "${perm}" (+5)`,
          score: 5,
          severity: "medium",
        });
      }
    }

    // Score dangerous combinations
    for (const combo of DANGEROUS_COMBOS) {
      if (combo.permissions.every((p) => perms.has(p))) {
        results.push({
          ruleId: `combo-${combo.permissions.join("+")}`,
          category: "permissions",
          description: combo.description,
          score: combo.bonus,
          severity: combo.bonus >= 15 ? "critical" : "high",
        });
      }
    }

    // Excessive risky permissions
    const riskyPermCount = [...perms].filter(
      (p) => (PERMISSION_WEIGHTS[p] ?? 5) >= 5
    ).length;
    if (riskyPermCount >= 6) {
      results.push({
        ruleId: "perm-excessive-count",
        category: "permissions",
        description: `Requests ${riskyPermCount} high-risk permissions - excessive scope`,
        score: 10,
        severity: "high",
      });
    }

    return results;
  },
};
