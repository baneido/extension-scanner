import { allRules } from "./rules/index";
import type { ScoringRule } from "./types";
import { THRESHOLDS } from "../shared/constants";
import type {
  ScoredExtension,
  RiskLevel,
  ScanResult,
  RuleResult,
} from "../shared/types";

/**
 * Evaluate one rule, isolating failures. A throwing rule (e.g. a future rule
 * added per CLAUDE.md) must not abort the whole scan, which would leave the
 * worker with no saved result and a stale badge (Debt Map A-5). The failure is
 * logged loudly and surfaced as an info finding so an under-scored result is
 * not mistaken for a clean one.
 */
export function safeEvaluate(
  rule: ScoringRule,
  ext: chrome.management.ExtensionInfo
): RuleResult[] {
  try {
    return rule.evaluate(ext);
  } catch (error) {
    console.error(
      `[ExtScanner] Rule "${rule.id}" failed for extension ${ext.id}:`,
      error
    );
    return [
      {
        ruleId: `${rule.id}-error`,
        category: rule.category,
        description: `Rule "${rule.id}" failed to evaluate`,
        score: 0,
        severity: "info",
      },
    ];
  }
}

export function scoreExtension(
  ext: chrome.management.ExtensionInfo
): ScoredExtension {
  const ruleResults = allRules.flatMap((rule) => safeEvaluate(rule, ext));
  const totalScore = ruleResults.reduce((sum, r) => sum + r.score, 0);
  const riskLevel = classifyRisk(totalScore);

  return {
    id: ext.id,
    name: ext.name,
    version: ext.version,
    description: ext.description ?? "",
    enabled: ext.enabled,
    installType: ext.installType,
    type: ext.type,
    permissions: ext.permissions ?? [],
    hostPermissions: ext.hostPermissions ?? [],
    homepageUrl: ext.homepageUrl,
    updateUrl: ext.updateUrl,
    icons: (ext.icons ?? []).map((icon) => ({
      size: icon.size,
      url: icon.url,
    })),
    mayDisable: ext.mayDisable,
    totalScore,
    riskLevel,
    ruleResults,
    scannedAt: Date.now(),
  };
}

function classifyRisk(score: number): RiskLevel {
  if (score >= THRESHOLDS.RED) return "red";
  if (score >= THRESHOLDS.YELLOW) return "yellow";
  return "green";
}

export async function runFullScan(): Promise<ScanResult> {
  const allExtensions = await chrome.management.getAll();

  // Only score extensions (not themes), exclude ourselves
  const extensions = allExtensions.filter(
    (ext) => ext.type === "extension" && ext.id !== chrome.runtime.id
  );

  const scored = extensions.map(scoreExtension);

  // Sort by score descending
  scored.sort((a, b) => b.totalScore - a.totalScore);

  return {
    extensions: scored,
    summary: {
      total: scored.length,
      red: scored.filter((e) => e.riskLevel === "red").length,
      yellow: scored.filter((e) => e.riskLevel === "yellow").length,
      green: scored.filter((e) => e.riskLevel === "green").length,
    },
    scannedAt: Date.now(),
  };
}
