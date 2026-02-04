import {
  BLOCKLIST_SOURCE_URL,
  STORAGE_KEYS,
  BLOCKLIST_UPDATE_INTERVAL_MINUTES,
} from "../shared/constants";
import { FALLBACK_MALICIOUS_IDS } from "./blocklist-fallback";

export interface BlocklistEntry {
  reason: string;
  source: string;
}

/**
 * Fetch the latest blocklist from GitHub and cache it in chrome.storage.local.
 * Returns the cached list on failure or if the cache is still fresh.
 */
export async function getBlocklist(): Promise<
  Map<string, BlocklistEntry>
> {
  const cached = await loadCachedBlocklist();
  if (cached && !isCacheExpired(cached.updatedAt)) {
    return cached.list;
  }

  try {
    const freshList = await fetchRemoteBlocklist();
    await saveCachedBlocklist(freshList);
    return freshList;
  } catch {
    // Network error - use cache if available, otherwise fallback
    if (cached) return cached.list;
    return FALLBACK_MALICIOUS_IDS;
  }
}

/**
 * Force-refresh the blocklist from the remote source.
 */
export async function refreshBlocklist(): Promise<
  Map<string, BlocklistEntry>
> {
  try {
    const freshList = await fetchRemoteBlocklist();
    await saveCachedBlocklist(freshList);
    return freshList;
  } catch {
    const cached = await loadCachedBlocklist();
    if (cached) return cached.list;
    return FALLBACK_MALICIOUS_IDS;
  }
}

async function fetchRemoteBlocklist(): Promise<
  Map<string, BlocklistEntry>
> {
  const response = await fetch(BLOCKLIST_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Blocklist fetch failed: ${response.status}`);
  }

  const data: unknown = await response.json();
  const list = new Map<string, BlocklistEntry>();

  // The chrome-mal-ids repo provides a JSON array of extension IDs
  if (Array.isArray(data)) {
    for (const id of data) {
      if (typeof id === "string") {
        list.set(id, { reason: "Known malicious extension (chrome-mal-ids)", source: "chrome-mal-ids" });
      }
    }
  }

  return list;
}

interface CachedBlocklist {
  list: Map<string, BlocklistEntry>;
  updatedAt: number;
}

async function loadCachedBlocklist(): Promise<CachedBlocklist | null> {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.BLOCKLIST_CACHE,
    STORAGE_KEYS.BLOCKLIST_UPDATED_AT,
  ]);

  const raw = data[STORAGE_KEYS.BLOCKLIST_CACHE] as
    | Array<[string, BlocklistEntry]>
    | undefined;
  const updatedAt = data[STORAGE_KEYS.BLOCKLIST_UPDATED_AT] as
    | number
    | undefined;

  if (!raw || !updatedAt) return null;

  return {
    list: new Map(raw),
    updatedAt,
  };
}

async function saveCachedBlocklist(
  list: Map<string, BlocklistEntry>
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.BLOCKLIST_CACHE]: Array.from(list.entries()),
    [STORAGE_KEYS.BLOCKLIST_UPDATED_AT]: Date.now(),
  });
}

function isCacheExpired(updatedAt: number): boolean {
  const ageMs = Date.now() - updatedAt;
  return ageMs > BLOCKLIST_UPDATE_INTERVAL_MINUTES * 60 * 1000;
}
