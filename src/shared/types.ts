export type RiskLevel = "red" | "yellow" | "green";

export interface BlocklistEntry {
  reason: string;
  source: string;
}

export interface RuleResult {
  ruleId: string;
  category: string;
  description: string;
  score: number;
  severity: "critical" | "high" | "medium" | "low" | "info";
}

export interface ScoredExtension {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  installType: string;
  type: string;
  permissions: string[];
  hostPermissions: string[];
  homepageUrl?: string;
  updateUrl?: string;
  icons: Array<{ size: number; url: string }>;
  mayDisable: boolean;

  totalScore: number;
  riskLevel: RiskLevel;
  ruleResults: RuleResult[];
  scannedAt: number;
}

export interface ScanResult {
  extensions: ScoredExtension[];
  summary: {
    total: number;
    red: number;
    yellow: number;
    green: number;
  };
  scannedAt: number;
  // Present on results written by this version onward; absent on legacy data.
  schemaVersion?: number;
}

export interface UserPreferences {
  // Reserved / not yet wired up: scans use the fixed SCAN_INTERVAL_MINUTES
  // constant, not this field. Kept for storage compatibility and a future
  // user-configurable interval (Debt Map C-7 / Q4). See docs/refactor-followups.md.
  scanIntervalMinutes: number;
  notifyOnNewRedExtension: boolean;
  notifyOnNewYellowExtension: boolean;
  dismissedExtensionIds: string[];
  customAllowlist: string[];
}
