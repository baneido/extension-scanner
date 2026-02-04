import type { ScanResult } from "../shared/types";
import { loadPreferences } from "../storage/store";

export async function updateBadge(
  summary: ScanResult["summary"]
): Promise<void> {
  if (summary.red > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: "#DC2626" });
    await chrome.action.setBadgeText({ text: String(summary.red) });
  } else if (summary.yellow > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: "#D97706" });
    await chrome.action.setBadgeText({ text: String(summary.yellow) });
  } else {
    await chrome.action.setBadgeBackgroundColor({ color: "#16A34A" });
    await chrome.action.setBadgeText({ text: "OK" });
  }
}

export async function notifyNewThreats(
  previous: ScanResult,
  current: ScanResult
): Promise<void> {
  const prefs = await loadPreferences();
  const previousIds = new Set(previous.extensions.map((e) => e.id));

  for (const ext of current.extensions) {
    if (previousIds.has(ext.id)) continue;
    if (prefs.dismissedExtensionIds.includes(ext.id)) continue;
    if (prefs.customAllowlist.includes(ext.id)) continue;

    if (ext.riskLevel === "red" && prefs.notifyOnNewRedExtension) {
      chrome.notifications.create(`threat-${ext.id}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
        title: "High-Risk Extension Detected",
        message: `"${ext.name}" has been rated as high risk (Score: ${ext.totalScore}). Click to review.`,
        priority: 2,
      });
    } else if (
      ext.riskLevel === "yellow" &&
      prefs.notifyOnNewYellowExtension
    ) {
      chrome.notifications.create(`warning-${ext.id}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
        title: "Suspicious Extension Detected",
        message: `"${ext.name}" has been rated as medium risk (Score: ${ext.totalScore}).`,
        priority: 1,
      });
    }
  }
}
