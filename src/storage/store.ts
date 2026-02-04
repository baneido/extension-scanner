import { STORAGE_KEYS } from "../shared/constants";
import type { ScanResult, UserPreferences } from "../shared/types";

const DEFAULT_PREFERENCES: UserPreferences = {
  scanIntervalMinutes: 60,
  notifyOnNewRedExtension: true,
  notifyOnNewYellowExtension: false,
  dismissedExtensionIds: [],
  customAllowlist: [],
};

export async function saveScanResult(result: ScanResult): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_SCAN]: result });
}

export async function loadScanResult(): Promise<ScanResult | null> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.LAST_SCAN);
  return (data[STORAGE_KEYS.LAST_SCAN] as ScanResult | undefined) ?? null;
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
