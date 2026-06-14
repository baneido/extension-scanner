import type { ScanResult, ScoredExtension, RiskLevel } from "../shared/types";
import {
  sendExtMessage,
  type BlocklistStatusResponse,
} from "../shared/messages";
import { isBlocklisted } from "../scoring/classification";
import {
  timeAgo,
  largestIconUrl,
  escapeHtml,
  mustGetElement,
  isBlocklistStale,
} from "../shared/utils";
import { loadPreferences, updatePreferences } from "../storage/store";

// --- State ---
let currentResult: ScanResult | null = null;
let currentFilter: "all" | RiskLevel = "all";
let searchQuery = "";
// Suppression state mirrored from preferences for rendering tags/undo.
let dismissedIds = new Set<string>();
let allowlistIds = new Set<string>();

async function refreshSuppressionState(): Promise<void> {
  const prefs = await loadPreferences();
  dismissedIds = new Set(prefs.dismissedExtensionIds);
  allowlistIds = new Set(prefs.customAllowlist);
}

// --- DOM Elements ---
const scanTimeEl = mustGetElement("scan-time");
const countTotal = mustGetElement("count-total");
const countRed = mustGetElement("count-red");
const countYellow = mustGetElement("count-yellow");
const countGreen = mustGetElement("count-green");
const listEl = mustGetElement("extensions-list");
const loadingEl = mustGetElement("loading");
const btnScan = mustGetElement<HTMLButtonElement>("btn-scan");
const searchInput = mustGetElement<HTMLInputElement>("search-input");
const filterBtns = document.querySelectorAll<HTMLButtonElement>(".filter-btn");

const prefNotifyRed = mustGetElement<HTMLInputElement>("pref-notify-red");
const prefNotifyYellow = mustGetElement<HTMLInputElement>("pref-notify-yellow");
const blocklistStatusEl = mustGetElement("blocklist-status");

async function renderBlocklistStatus(): Promise<void> {
  let status: BlocklistStatusResponse | null = null;
  try {
    status = (await sendExtMessage({
      type: "GET_BLOCKLIST_STATUS",
    })) as BlocklistStatusResponse | null;
  } catch (error) {
    console.error("[ExtScanner] Failed to load blocklist status:", error);
  }
  if (!status) {
    blocklistStatusEl.textContent = "";
    return;
  }
  const stale = isBlocklistStale(status, Date.now());
  const updated =
    status.updatedAt !== null ? timeAgo(status.updatedAt) : "never";
  blocklistStatusEl.textContent = `Blocklist: ${status.count} entries · updated ${updated}${
    stale ? " · ⚠ stale or unavailable" : ""
  }`;
  blocklistStatusEl.classList.toggle("stale", stale);
}

// --- Rendering ---
function render(): void {
  if (!currentResult) {
    loadingEl.textContent = "No scan results available";
    return;
  }

  scanTimeEl.textContent = `Last scan: ${timeAgo(currentResult.scannedAt)}`;
  countTotal.textContent = String(currentResult.summary.total);
  countRed.textContent = String(currentResult.summary.red);
  countYellow.textContent = String(currentResult.summary.yellow);
  countGreen.textContent = String(currentResult.summary.green);

  const filtered = currentResult.extensions
    .filter((ext) => {
      if (currentFilter !== "all" && ext.riskLevel !== currentFilter) return false;
      if (searchQuery && !ext.name.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      return true;
    })
    .sort((a, b) => b.totalScore - a.totalScore);

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="loading">No matching extensions found</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(renderExtCard).join("");

  // Attach expand handlers
  listEl.querySelectorAll<HTMLElement>(".ext-card-header").forEach((header) => {
    header.addEventListener("click", () => {
      header.parentElement!.classList.toggle("expanded");
    });
  });

  // Attach action handlers
  listEl
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset["action"];
        const extId = btn.dataset["extId"]!;
        handleAction(action!, extId);
      });
    });
}

function renderExtCard(ext: ScoredExtension): string {
  const iconUrl = largestIconUrl(ext.icons);
  const iconHtml = iconUrl
    ? `<img class="ext-icon" src="${escapeHtml(iconUrl)}" alt="" />`
    : `<div class="ext-icon"></div>`;

  const installLabel = getInstallLabel(ext.installType);
  const blocklisted = isBlocklisted(ext);
  const isAllowlisted = allowlistIds.has(ext.id);
  const isDismissed = dismissedIds.has(ext.id);

  const tags = [
    blocklisted
      ? `<span class="ext-tag blocklisted">Known malware</span>`
      : "",
    isAllowlisted ? `<span class="ext-tag allowlisted">Allowlisted</span>` : "",
    isDismissed ? `<span class="ext-tag dismissed">Dismissed</span>` : "",
  ].join("");

  const findings = [...ext.ruleResults]
    .sort((a, b) => b.score - a.score)
    .map(
      (r) => `
    <div class="finding-item">
      <span class="finding-severity ${r.severity}">${r.severity}</span>
      <span class="finding-desc">${escapeHtml(r.description)}</span>
      <span class="finding-score">+${r.score}</span>
    </div>
  `
    )
    .join("");

  const permTags = ext.permissions
    .map((p) => `<span class="perm-tag">${escapeHtml(p)}</span>`)
    .join("");

  const hostTags = ext.hostPermissions
    .map((h) => `<span class="perm-tag">${escapeHtml(h)}</span>`)
    .join("");

  return `
    <div class="ext-card ${ext.riskLevel}">
      <div class="ext-card-header">
        ${iconHtml}
        <div class="ext-main">
          <div class="ext-name">${escapeHtml(ext.name)}${tags}</div>
          <div class="ext-meta">
            v${escapeHtml(ext.version)} · ${installLabel} ·
            ${ext.permissions.length} permission(s)
            ${!ext.enabled ? " · <strong>Disabled</strong>" : ""}
          </div>
        </div>
        <span class="ext-score-badge ${ext.riskLevel}">
          ${ext.totalScore}
        </span>
        <span class="ext-chevron">&#9654;</span>
      </div>
      <div class="ext-details">
        ${
          ext.permissions.length > 0
            ? `
          <div class="findings-title">API Permissions</div>
          <div class="perm-list">${permTags}</div>
        `
            : ""
        }
        ${
          ext.hostPermissions.length > 0
            ? `
          <div class="findings-title">Host Permissions</div>
          <div class="perm-list">${hostTags}</div>
        `
            : ""
        }
        ${
          ext.ruleResults.length > 0
            ? `
          <div class="findings-title">Findings (${ext.ruleResults.length})</div>
          ${findings}
        `
            : `<div class="findings-title">No issues detected</div>`
        }
        <div class="ext-actions">
          ${
            blocklisted
              ? `<span class="ext-actions-note">Known malware — cannot be allowlisted or dismissed.</span>`
              : `
          <button class="btn-action" data-action="${
            isAllowlisted ? "un-allowlist" : "allowlist"
          }" data-ext-id="${escapeHtml(ext.id)}">
            ${isAllowlisted ? "Remove from Allowlist" : "Add to Allowlist"}
          </button>
          <button class="btn-action" data-action="${
            isDismissed ? "un-dismiss" : "dismiss"
          }" data-ext-id="${escapeHtml(ext.id)}">
            ${isDismissed ? "Undo Dismiss" : "Dismiss"}
          </button>`
          }
          ${
            ext.mayDisable && ext.enabled
              ? `<button class="btn-action danger" data-action="disable" data-ext-id="${escapeHtml(
                  ext.id
                )}">
              Disable Extension
            </button>`
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

function getInstallLabel(installType: string): string {
  switch (installType) {
    case "normal":
      return "Chrome Web Store";
    case "sideload":
      return "Sideloaded";
    case "development":
      return "Developer Mode";
    case "admin":
      return "Admin Policy";
    default:
      return installType;
  }
}

// --- Actions ---
async function handleAction(action: string, extId: string): Promise<void> {
  if (action === "disable") {
    await chrome.management.setEnabled(extId, false);
    // Re-scan after disabling
    btnScan.click();
    return;
  }

  if (action === "allowlist" || action === "dismiss") {
    // Guardrail: a known-malware extension can never be silenced (Debt Map Q2).
    const ext = currentResult?.extensions.find((e) => e.id === extId);
    if (ext && isBlocklisted(ext)) {
      window.alert(
        "This extension is on the known-malware blocklist and cannot be allowlisted or dismissed. Use Disable Extension instead."
      );
      return;
    }
    await updatePreferences((prefs) => {
      const list =
        action === "dismiss"
          ? prefs.dismissedExtensionIds
          : prefs.customAllowlist;
      if (!list.includes(extId)) {
        list.push(extId);
      }
    });
  } else if (action === "un-allowlist" || action === "un-dismiss") {
    await updatePreferences((prefs) => {
      if (action === "un-dismiss") {
        prefs.dismissedExtensionIds = prefs.dismissedExtensionIds.filter(
          (id) => id !== extId
        );
      } else {
        prefs.customAllowlist = prefs.customAllowlist.filter(
          (id) => id !== extId
        );
      }
    });
  } else {
    return;
  }

  // Reflect the change immediately (tags, button labels).
  await refreshSuppressionState();
  render();
}

// --- Event handlers ---
filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = (btn.dataset["filter"] as typeof currentFilter) ?? "all";
    render();
  });
});

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value;
  render();
});

btnScan.addEventListener("click", async () => {
  btnScan.disabled = true;
  btnScan.textContent = "Scanning...";
  try {
    const result = await sendExtMessage({ type: "RUN_SCAN" });
    currentResult = result as ScanResult | null;
    render();
    void renderBlocklistStatus();
  } catch (error) {
    console.error("[ExtScanner] Scan failed:", error);
  } finally {
    btnScan.disabled = false;
    btnScan.textContent = "Scan Now";
  }
});

// Preferences
prefNotifyRed.addEventListener("change", () => savePrefs());
prefNotifyYellow.addEventListener("change", () => savePrefs());

async function savePrefs(): Promise<void> {
  await updatePreferences((prefs) => {
    prefs.notifyOnNewRedExtension = prefNotifyRed.checked;
    prefs.notifyOnNewYellowExtension = prefNotifyYellow.checked;
  });
}

async function loadPrefs(): Promise<void> {
  const prefs = await loadPreferences();
  prefNotifyRed.checked = prefs.notifyOnNewRedExtension;
  prefNotifyYellow.checked = prefs.notifyOnNewYellowExtension;
}

// --- Init ---
(async () => {
  try {
    await refreshSuppressionState();
  } catch (error) {
    console.error("[ExtScanner] Failed to load preferences:", error);
  }
  try {
    const result = await sendExtMessage({ type: "GET_SCAN_RESULT" });
    currentResult = result as ScanResult | null;
  } catch (error) {
    console.error("[ExtScanner] Failed to load scan result:", error);
    currentResult = null;
  }
  render();
  void renderBlocklistStatus();
})();
loadPrefs();
