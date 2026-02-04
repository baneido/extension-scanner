// Minimal hardcoded fallback blocklist for offline/initial use.
// The primary list is fetched from GitHub at runtime.
export const FALLBACK_MALICIOUS_IDS = new Map<
  string,
  { reason: string; source: string }
>([
  // This will be populated with a small set of well-known malicious IDs.
  // The full list is fetched dynamically from chrome-mal-ids repository.
]);
