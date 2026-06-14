import {
  BLOCKLIST_SOURCE_URL,
  STORAGE_KEYS,
  BLOCKLIST_UPDATE_INTERVAL_MINUTES,
} from "../shared/constants";
import type { BlocklistEntry } from "../shared/types";
import { FALLBACK_MALICIOUS_IDS } from "./blocklist-fallback";

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
  } catch (error) {
    // Network/parse error - use cache if available, otherwise fallback.
    // Logged (not swallowed) so a persistently failing source is visible.
    console.warn(
      "[ExtScanner] Blocklist fetch failed; using cache/fallback:",
      error
    );
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
  } catch (error) {
    console.warn(
      "[ExtScanner] Blocklist refresh failed; using cache/fallback:",
      error
    );
    const cached = await loadCachedBlocklist();
    if (cached) return cached.list;
    return FALLBACK_MALICIOUS_IDS;
  }
}

// Reject obviously-wrong responses before they overwrite a good cache.
const MAX_BLOCKLIST_BYTES = 5_000_000;

/** One entry of the chrome-mal-ids `extensions` array we rely on. */
interface RawBlocklistEntry {
  ext_id?: unknown;
  browser?: unknown;
  date_added?: unknown;
  source?: unknown;
}

/**
 * Parse the chrome-mal-ids `current-list.json` payload into a Map. Shape:
 * `{ meta: {...}, extensions: [{ ext_id, browser, date_added, source, ... }] }`.
 * Edge-only IOCs are skipped (they cannot match a Chrome install). Throws on a
 * payload that is not an object with a non-empty extensions array, so an empty
 * or wrong-shaped response is treated as a failure (preserving the last good
 * cache) rather than a successful empty blocklist (Debt Map A-4 / Q1).
 */
export function parseBlocklist(data: unknown): Map<string, BlocklistEntry> {
  if (typeof data !== "object" || data === null) {
    throw new Error("Blocklist response was not a JSON object");
  }

  const extensions = (data as { extensions?: unknown }).extensions;
  if (!Array.isArray(extensions)) {
    throw new Error("Blocklist response had no extensions array");
  }

  const list = new Map<string, BlocklistEntry>();
  for (const raw of extensions) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as RawBlocklistEntry;
    const id = entry.ext_id;
    if (typeof id !== "string" || id.length === 0) continue;
    if (entry.browser === "edge") continue;

    const dateAdded =
      typeof entry.date_added === "string" ? entry.date_added : null;
    list.set(id, {
      reason: dateAdded
        ? `Listed in the chrome-mal-ids IOC database (added ${dateAdded})`
        : "Listed in the chrome-mal-ids IOC database",
      source:
        typeof entry.source === "string" && entry.source.length > 0
          ? entry.source
          : "chrome-mal-ids (TPCI)",
    });
  }

  if (list.size === 0) {
    throw new Error("Blocklist response contained no valid extension IDs");
  }

  return list;
}

async function fetchRemoteBlocklist(): Promise<
  Map<string, BlocklistEntry>
> {
  const response = await fetch(BLOCKLIST_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Blocklist fetch failed: ${response.status}`);
  }

  const text = await response.text();
  if (text.length > MAX_BLOCKLIST_BYTES) {
    throw new Error(`Blocklist response too large: ${text.length} bytes`);
  }

  return parseBlocklist(JSON.parse(text));
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
