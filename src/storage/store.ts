import {
  STORAGE_KEYS,
  SCAN_RESULT_SCHEMA_VERSION,
} from "../shared/constants";
import type { ScanResult, UserPreferences } from "../shared/types";

const DEFAULT_PREFERENCES: UserPreferences = {
  scanIntervalMinutes: 60,
  notifyOnNewRedExtension: true,
  notifyOnNewYellowExtension: false,
  dismissedExtensionIds: [],
  customAllowlist: [],
};

export async function saveScanResult(result: ScanResult): Promise<void> {
  const stamped: ScanResult = {
    ...result,
    schemaVersion: SCAN_RESULT_SCHEMA_VERSION,
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_SCAN]: stamped });
}

export async function loadScanResult(): Promise<ScanResult | null> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.LAST_SCAN);
  const raw = data[STORAGE_KEYS.LAST_SCAN] as unknown;
  // Validate by shape rather than version equality, so results written by the
  // current code (which now carry schemaVersion) AND legacy results (which do
  // not) both load, while genuinely malformed data is discarded (Debt Map D-4).
  return isValidScanResult(raw) ? raw : null;
}

function isValidScanResult(value: unknown): value is ScanResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v["extensions"])) return false;
  if (typeof v["scannedAt"] !== "number") return false;
  const summary = v["summary"];
  if (typeof summary !== "object" || summary === null) return false;
  const s = summary as Record<string, unknown>;
  return (
    typeof s["total"] === "number" &&
    typeof s["red"] === "number" &&
    typeof s["yellow"] === "number" &&
    typeof s["green"] === "number"
  );
}

export async function loadPreferences(): Promise<UserPreferences> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.PREFERENCES);
  return {
    ...DEFAULT_PREFERENCES,
    ...((data[STORAGE_KEYS.PREFERENCES] as Partial<UserPreferences> | undefined) ?? {}),
  };
}

export async function savePreferences(
  prefs: UserPreferences
): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.PREFERENCES]: prefs });
}

/**
 * Load preferences, apply a mutation, and persist the result.
 * Single source of the load-modify-save sequence used by the dashboard.
 */
export async function updatePreferences(
  mutate: (prefs: UserPreferences) => void
): Promise<UserPreferences> {
  const prefs = await loadPreferences();
  mutate(prefs);
  await savePreferences(prefs);
  return prefs;
}
