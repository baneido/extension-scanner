import { allRules } from "./rules/index";
import { THRESHOLDS } from "../shared/constants";
import type { ScoredExtension, RiskLevel, ScanResult } from "../shared/types";

export function scoreExtension(
  ext: chrome.management.ExtensionInfo
): ScoredExtension {
  const ruleResults = allRules.flatMap((rule) => rule.evaluate(ext));
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
