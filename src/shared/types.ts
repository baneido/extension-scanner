export type RiskLevel = "red" | "yellow" | "green";

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
}

export interface UserPreferences {
  scanIntervalMinutes: number;
  notifyOnNewRedExtension: boolean;
  notifyOnNewYellowExtension: boolean;
  dismissedExtensionIds: string[];
  customAllowlist: string[];
}
