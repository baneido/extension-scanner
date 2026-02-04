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
chrome.runtime.onStartup.addListener(async () => {
  await initBlocklist();
  await performScan();
});

// 3. Alarm-based periodic scanning and blocklist updates
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "periodic-scan") {
    await initBlocklist();
    await performScan();
  }
  if (alarm.name === "blocklist-update") {
    await refreshBlocklist();
  }
});

// 4. React to extension install/uninstall/enable/disable events
chrome.management.onInstalled.addListener(async () => {
  await initBlocklist();
  await performScan();
});
chrome.management.onUninstalled.addListener(async () => {
  await performScan();
});
chrome.management.onEnabled.addListener(async () => {
  await performScan();
});
chrome.management.onDisabled.addListener(async () => {
  await performScan();
});

// 5. Message handler for popup/dashboard
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_SCAN_RESULT") {
    loadScanResult().then(sendResponse);
    return true;
  }
  if (message.type === "RUN_SCAN") {
    initBlocklist()
      .then(() => performScan())
      .then(() => loadScanResult())
      .then(sendResponse);
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

async function initBlocklist(): Promise<void> {
  const list = await getBlocklist();
  setBlocklistData(list);
}

async function performScan(): Promise<void> {
  const previousResult = await loadScanResult();
  const newResult = await runFullScan();
  await saveScanResult(newResult);
  await updateBadge(newResult.summary);
  if (previousResult) {
    await notifyNewThreats(previousResult, newResult);
  }
}
