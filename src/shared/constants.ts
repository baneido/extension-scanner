export const THRESHOLDS = {
  RED: 70,
  YELLOW: 30,
} as const;

export const SCAN_INTERVAL_MINUTES = 60;
export const BLOCKLIST_UPDATE_INTERVAL_MINUTES = 60 * 24; // 24 hours

// Bumped when the persisted ScanResult shape changes incompatibly, so future
// versions can migrate or discard old data deliberately.
export const SCAN_RESULT_SCHEMA_VERSION = 1;

export const STORAGE_KEYS = {
  LAST_SCAN: "lastScanResult",
  PREFERENCES: "userPreferences",
  BLOCKLIST_CACHE: "blocklistCache",
  BLOCKLIST_UPDATED_AT: "blocklistUpdatedAt",
} as const;

// Authoritative, actively-maintained successor to the original mallorybowes /
// nicoleahmed chrome-mal-ids list, now curated by The Privacy Commons Institute
// (3000+ Chrome IOCs, daily updates, CC BY 4.0). Served with
// Access-Control-Allow-Origin: * so the worker can fetch it cross-origin
// without host_permissions. See docs/refactor-followups.md (Q1).
export const BLOCKLIST_SOURCE_URL =
  "https://raw.githubusercontent.com/The-Privacy-Commons-Institute/chrome-mal-ids/refs/heads/master/data/current-list.json";
