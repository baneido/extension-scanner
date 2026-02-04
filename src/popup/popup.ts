import type { ScanResult, ScoredExtension } from "../shared/types";
import { timeAgo } from "../shared/utils";

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

function renderScanResult(result: ScanResult | null): void {
  if (!result) {
    loadingEl.textContent = "No scan results available";
    return;
  }

  // Update scan time
  scanTimeEl.textContent = timeAgo(result.scannedAt);

  // Update badges
  badgeRedEl.querySelector(".badge-count")!.textContent = String(
    result.summary.red
  );
  badgeYellowEl.querySelector(".badge-count")!.textContent = String(
    result.summary.yellow
  );
  badgeGreenEl.querySelector(".badge-count")!.textContent = String(
    result.summary.green
  );

  // Render threat list (red and yellow only)
  const threats = result.extensions.filter(
    (e) => e.riskLevel === "red" || e.riskLevel === "yellow"
  );

  if (threats.length === 0) {
    threatsEl.innerHTML = `<div class="empty-state">No threats detected</div>`;
    return;
  }

  threatsEl.innerHTML = threats.map(renderThreatItem).join("");
}

function renderThreatItem(ext: ScoredExtension): string {
  const iconUrl =
    ext.icons.length > 0
      ? ext.icons[ext.icons.length - 1]!.url
      : "";
  const iconHtml = iconUrl
    ? `<img class="threat-icon" src="${escapeHtml(iconUrl)}" alt="" />`
    : `<div class="threat-icon"></div>`;

  return `
    <div class="threat-item ${ext.riskLevel}">
      ${iconHtml}
      <div class="threat-info">
        <div class="threat-name">${escapeHtml(ext.name)}</div>
        <div class="threat-score">
          Score: <span class="threat-score-value ${ext.riskLevel}">${ext.totalScore}</span>
          · ${ext.ruleResults.length} finding(s)
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Load initial scan result
chrome.runtime.sendMessage({ type: "GET_SCAN_RESULT" }, (result) => {
  renderScanResult(result as ScanResult | null);
});

// Scan Now button
btnScan.addEventListener("click", () => {
  btnScan.disabled = true;
  btnScan.textContent = "Scanning...";
  chrome.runtime.sendMessage({ type: "RUN_SCAN" }, (result) => {
    renderScanResult(result as ScanResult | null);
    btnScan.disabled = false;
    btnScan.textContent = "Scan Now";
  });
});

// Dashboard button
btnDashboard.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
});
