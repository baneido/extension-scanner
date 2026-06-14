import { runFullScan } from "../scoring/engine";
import { setBlocklistData } from "../scoring/rules/blocklist";
import { getBlocklist, refreshBlocklist } from "../data/blocklist-fetcher";
import { saveScanResult, loadScanResult } from "../storage/store";
import { updateBadge, notifyNewThreats } from "../alerts/notifier";
import {
  SCAN_INTERVAL_MINUTES,
  BLOCKLIST_UPDATE_INTERVAL_MINUTES,
} from "../shared/constants";

// ---- All listeners registered synchronously at top level (MV3 requirement) ----

console.log("[ExtScanner] Service Worker loaded");

// 1. On install/update: run initial scan and set up alarms
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[ExtScanner] onInstalled triggered");
  try {
    await initBlocklist();
    console.log("[ExtScanner] Blocklist initialized");
    await performScan();
    console.log("[ExtScanner] Initial scan completed");

    chrome.alarms.create("periodic-scan", {
      periodInMinutes: SCAN_INTERVAL_MINUTES,
    });
    chrome.alarms.create("blocklist-update", {
      periodInMinutes: BLOCKLIST_UPDATE_INTERVAL_MINUTES,
    });
    console.log("[ExtScanner] Alarms created");
  } catch (error) {
    console.error("[ExtScanner] onInstalled error:", error);
  }
});

// 2. On browser startup: ensure alarms exist and blocklist is loaded
chrome.runtime.onStartup.addListener(() =>
  safeRun("onStartup", async () => {
    await initBlocklist();
    await performScan();
  })
);

// 3. Alarm-based periodic scanning and blocklist updates
chrome.alarms.onAlarm.addListener((alarm) =>
  safeRun(`alarm:${alarm.name}`, async () => {
    if (alarm.name === "periodic-scan") {
      await initBlocklist();
      await performScan();
    }
    if (alarm.name === "blocklist-update") {
      // Propagate the freshly fetched list into the scoring rule and re-evaluate
      // installed extensions immediately, instead of waiting for the next
      // periodic scan to pick it up via the cache (Debt Map A-3).
      const fresh = await refreshBlocklist();
      setBlocklistData(fresh);
      await performScan();
    }
  })
);

// 4. React to extension install/uninstall/enable/disable events
chrome.management.onInstalled.addListener(() =>
  safeRun("management.onInstalled", async () => {
    await initBlocklist();
    await performScan();
  })
);
chrome.management.onUninstalled.addListener(() =>
  safeRun("management.onUninstalled", () => performScan())
);
chrome.management.onEnabled.addListener(() =>
  safeRun("management.onEnabled", () => performScan())
);
chrome.management.onDisabled.addListener(() =>
  safeRun("management.onDisabled", () => performScan())
);

// 5. Message handler for popup/dashboard
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_SCAN_RESULT") {
    loadScanResult()
      .then(sendResponse)
      .catch((error) => {
        console.error("[ExtScanner] GET_SCAN_RESULT failed:", error);
        sendResponse(null);
      });
    return true;
  }
  if (message.type === "RUN_SCAN") {
    // performScan() initializes the blocklist itself (see A-2). The catch
    // guarantees sendResponse fires even on failure, so the popup's Scan
    // button is never left stuck on "Scanning..." (Debt Map B-1).
    performScan()
      .then(() => loadScanResult())
      .then(sendResponse)
      .catch((error) => {
        console.error("[ExtScanner] RUN_SCAN failed:", error);
        sendResponse(null);
      });
    return true;
  }
  if (message.type === "OPEN_DASHBOARD") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("dashboard.html"),
    });
  }
  return false;
});

// ---- Internal functions ----

/**
 * Run an async event-handler body, logging any rejection instead of leaving it
 * as a silent unhandled rejection (Debt Map B-4). Listeners are still
 * registered synchronously at top level (MV3 requirement); only the body runs
 * inside this wrapper.
 */
async function safeRun(
  label: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error(`[ExtScanner] ${label} failed:`, error);
  }
}

async function initBlocklist(): Promise<void> {
  const list = await getBlocklist();
  setBlocklistData(list);
}

let scanInFlight: Promise<void> | null = null;

/**
 * Run a full scan, coalescing concurrent callers. Overlapping management/alarm
 * events and the dashboard's post-disable rescan would otherwise launch
 * parallel scans that race on the saved result and duplicate notifications
 * (Debt Map A-6). While one scan runs, additional callers join it.
 */
function performScan(): Promise<void> {
  if (scanInFlight) return scanInFlight;
  scanInFlight = doScan().finally(() => {
    scanInFlight = null;
  });
  return scanInFlight;
}

async function doScan(): Promise<void> {
  // Always (re)load the blocklist into the scoring rule before scanning. MV3
  // terminates the worker between events, so module state may be empty; without
  // this, scans woken by management on{Enabled,Disabled,Uninstalled} would run
  // with the 100-point blocklist rule disabled (Debt Map A-2). getBlocklist()
  // serves the cache when fresh, so this is a storage read, not a refetch.
  await initBlocklist();
  const previousResult = await loadScanResult();
  const newResult = await runFullScan();
  await saveScanResult(newResult);
  await updateBadge(newResult.summary);
  if (previousResult) {
    await notifyNewThreats(previousResult, newResult);
  }
}
