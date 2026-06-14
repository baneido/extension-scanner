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
          severity:
            weight >= 15
              ? "critical"
              : weight >= 10
                ? "high"
                : weight >= 5
                  ? "medium"
                  : "low",
        });
      }
      if (weight === undefined) {
        // A permission Chrome added that we have not yet catalogued. Flag it so
        // it stays visible for triage, but at a low weight that cannot push a
        // benign extension over a threshold on its own (Debt Map F-1). Once
        // observed, dangerous ones get a real weight in PERMISSION_WEIGHTS.
        results.push({
          ruleId: `perm-unknown-${perm}`,
          category: "permissions",
          description: `Requests unrecognized permission "${perm}" (+3)`,
          score: 3,
          severity: "low",
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

    // Excessive risky permissions. Only catalogued permissions at the
    // webNavigation/identity/management tier and above (>=7) count; unknowns
    // default to 0 so they no longer auto-inflate this count (Debt Map F-1).
    const riskyPermCount = [...perms].filter(
      (p) => (PERMISSION_WEIGHTS[p] ?? 0) >= 7
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
