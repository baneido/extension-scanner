export const THRESHOLDS = {
  RED: 70,
  YELLOW: 30,
} as const;

export const SCAN_INTERVAL_MINUTES = 60;
export const BLOCKLIST_UPDATE_INTERVAL_MINUTES = 60 * 24; // 24 hours

export const STORAGE_KEYS = {
  LAST_SCAN: "lastScanResult",
  PREFERENCES: "userPreferences",
  BLOCKLIST_CACHE: "blocklistCache",
  BLOCKLIST_UPDATED_AT: "blocklistUpdatedAt",
} as const;

export const BLOCKLIST_SOURCE_URL =
  "https://raw.githubusercontent.com/nicoleahmed/chrome-mal-ids/refs/heads/main/mal-ids.json";
