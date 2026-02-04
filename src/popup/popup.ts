import type { ScanResult, ScoredExtension } from "../shared/types";
import { timeAgo } from "../shared/utils";

// DOM elements
const scanTimeEl = document.getElementById("scan-time")!;
const badgeRedEl = document.getElementById("badge-red")!;
const badgeYellowEl = document.getElementById("badge-yellow")!;
const badgeGreenEl = document.getElementById("badge-green")!;
const threatsEl = document.getElementById("threats")!;
const loadingEl = document.getElementById("loading")!;
const btnScan = document.getElementById("btn-scan") as HTMLButtonElement;
const btnDashboard = document.getElementById(
  "btn-dashboard"
) as HTMLButtonElement;

/**
 * Render scan results to the popup UI
 */
function renderScanResult(result: ScanResult | null): void {
  if (!result) {
    threatsEl.innerHTML = `
      <div class="empty-state" role="status">
        No scan results available. Click "Scan Now" to start.
      </div>
    `;
    return;
  }

  // Update scan time
  scanTimeEl.textContent = timeAgo(result.scannedAt);

  // Update status badges with animation
  updateStatusBadge(badgeRedEl, result.summary.red);
  updateStatusBadge(badgeYellowEl, result.summary.yellow);
  updateStatusBadge(badgeGreenEl, result.summary.green);

  // Render threat list (red and yellow only)
  const threats = result.extensions.filter(
    (e) => e.riskLevel === "red" || e.riskLevel === "yellow"
  );

  if (threats.length === 0) {
    threatsEl.innerHTML = `
      <div class="empty-state" role="status">
        <span>All extensions are safe</span>
      </div>
    `;
    return;
  }

  threatsEl.innerHTML = threats.map(renderThreatItem).join("");

  // Add click handlers to threat items for accessibility
  addThreatItemHandlers();
}

/**
 * Update status badge count with smooth transition
 */
function updateStatusBadge(badgeEl: HTMLElement, count: number): void {
  const countEl = badgeEl.querySelector(".status-count");
  if (countEl) {
    const currentCount = parseInt(countEl.textContent || "0");
    if (currentCount !== count) {
      // Animate count change
      countEl.textContent = String(count);
      badgeEl.style.transform = "scale(1.1)";
      setTimeout(() => {
        badgeEl.style.transform = "";
      }, 200);
    }
  }
}

/**
 * Render a single threat item
 */
function renderThreatItem(ext: ScoredExtension): string {
  const iconUrl =
    ext.icons.length > 0 ? ext.icons[ext.icons.length - 1]!.url : "";
  const iconHtml = iconUrl
    ? `<img class="threat-icon" src="${escapeHtml(iconUrl)}" alt="${escapeHtml(ext.name)} icon" />`
    : `<div class="threat-icon"></div>`;

  const riskLevelText = ext.riskLevel === "red" ? "High Risk" : "Medium Risk";
  const findingsText = ext.ruleResults.length === 1 ? "finding" : "findings";

  return `
    <div class="threat-item ${ext.riskLevel}"
         role="button"
         tabindex="0"
         data-extension-id="${escapeHtml(ext.id)}"
         aria-label="${escapeHtml(ext.name)}, ${riskLevelText}, Score ${ext.totalScore}">
      ${iconHtml}
      <div class="threat-info">
        <div class="threat-name">${escapeHtml(ext.name)}</div>
        <div class="threat-score">
          Score: <span class="threat-score-value ${ext.riskLevel}">${ext.totalScore}</span>
          · ${ext.ruleResults.length} ${findingsText}
        </div>
      </div>
    </div>
  `;
}

/**
 * Add click and keyboard handlers to threat items
 */
function addThreatItemHandlers(): void {
  const threatItems = document.querySelectorAll(".threat-item");
  threatItems.forEach((item) => {
    // Click handler
    item.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
    });

    // Keyboard handler (Enter/Space)
    item.addEventListener("keydown", (e) => {
      const event = e as KeyboardEvent;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
      }
    });
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Update button state during scan
 */
function setButtonLoading(loading: boolean): void {
  if (loading) {
    btnScan.disabled = true;
    const btnText = btnScan.querySelector(".btn-text");
    if (btnText) {
      btnText.textContent = "Scanning...";
    }
    btnScan.setAttribute("aria-busy", "true");
  } else {
    btnScan.disabled = false;
    const btnText = btnScan.querySelector(".btn-text");
    if (btnText) {
      btnText.textContent = "Scan Now";
    }
    btnScan.removeAttribute("aria-busy");
  }
}

// === Event Listeners ===

// Load initial scan result
chrome.runtime.sendMessage({ type: "GET_SCAN_RESULT" }, (result) => {
  renderScanResult(result as ScanResult | null);
});

// Scan Now button
btnScan.addEventListener("click", () => {
  setButtonLoading(true);
  chrome.runtime.sendMessage({ type: "RUN_SCAN" }, (result) => {
    renderScanResult(result as ScanResult | null);
    setButtonLoading(false);
  });
});

// Dashboard button
btnDashboard.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Cmd/Ctrl + R to scan
  if ((e.metaKey || e.ctrlKey) && e.key === "r") {
    e.preventDefault();
    btnScan.click();
  }
  // Cmd/Ctrl + D to open dashboard
  if ((e.metaKey || e.ctrlKey) && e.key === "d") {
    e.preventDefault();
    btnDashboard.click();
  }
});
