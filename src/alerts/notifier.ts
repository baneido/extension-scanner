import type { ScanResult, ScoredExtension } from "../shared/types";
import { loadPreferences } from "../storage/store";
import { isBlocklisted, riskOrdinal } from "../scoring/classification";

/**
 * Create a notification, logging failures instead of leaving the promise
 * rejection unhandled (Debt Map B-5).
 */
function createNotification(
  id: string,
  options: chrome.notifications.NotificationOptions
): void {
  void chrome.notifications.create(id, options).catch((error) => {
    console.error("[ExtScanner] Failed to create notification:", error);
  });
}

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
  const previousById = new Map(previous.extensions.map((e) => [e.id, e]));

  for (const ext of current.extensions) {
    // Only red (or yellow, if the user opted in) extensions are notifiable.
    const isThreat =
      (ext.riskLevel === "red" && prefs.notifyOnNewRedExtension) ||
      (ext.riskLevel === "yellow" && prefs.notifyOnNewYellowExtension);
    if (!isThreat) continue;

    const prev = previousById.get(ext.id);
    const firstSeen = prev === undefined;
    // Notify on first sight or when the risk LEVEL worsened vs the last scan.
    // Unchanged threats are not re-notified every scan (fatigue fix), and this
    // is what makes green->red / yellow->red escalations notify (Debt Map A-7).
    const worsened =
      firstSeen || riskOrdinal(ext.riskLevel) > riskOrdinal(prev.riskLevel);
    if (!worsened) continue;

    // Known-malware always notifies, bypassing any dismiss/allowlist entry —
    // the suppression controls can never hide a blocklisted extension (Q2).
    if (!isBlocklisted(ext)) {
      // Otherwise, dismiss/allowlist suppress only the FIRST-seen alert; an
      // escalation of a suppressed extension still notifies (its state changed).
      const suppressed =
        prefs.dismissedExtensionIds.includes(ext.id) ||
        prefs.customAllowlist.includes(ext.id);
      if (firstSeen && suppressed) continue;
    }

    notifyThreat(ext, firstSeen, prev);
  }
}

function notifyThreat(
  ext: ScoredExtension,
  firstSeen: boolean,
  prev: ScoredExtension | undefined
): void {
  const iconUrl = chrome.runtime.getURL("icons/icon-128.png");
  const escalationSuffix =
    !firstSeen && prev
      ? ` (was ${prev.riskLevel}, score ${prev.totalScore} -> ${ext.totalScore})`
      : "";

  if (ext.riskLevel === "red") {
    createNotification(
      firstSeen ? `threat-${ext.id}` : `escalation-${ext.id}`,
      {
        type: "basic",
        iconUrl,
        title: firstSeen
          ? "High-Risk Extension Detected"
          : "Extension Risk Increased",
        message: firstSeen
          ? `"${ext.name}" has been rated as high risk (Score: ${ext.totalScore}). Click to review.`
          : `"${ext.name}" rose to high risk${escalationSuffix}. Click to review.`,
        priority: 2,
      }
    );
  } else {
    createNotification(
      firstSeen ? `warning-${ext.id}` : `escalation-${ext.id}`,
      {
        type: "basic",
        iconUrl,
        title: firstSeen
          ? "Suspicious Extension Detected"
          : "Extension Risk Increased",
        message: firstSeen
          ? `"${ext.name}" has been rated as medium risk (Score: ${ext.totalScore}).`
          : `"${ext.name}" rose to medium risk${escalationSuffix}.`,
        priority: 1,
      }
    );
  }
}
