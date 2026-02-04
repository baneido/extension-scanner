import type {
  ScanResult,
  ScoredExtension,
  RiskLevel,
  UserPreferences,
} from "../shared/types";
import { timeAgo } from "../shared/utils";

// --- State ---
let currentResult: ScanResult | null = null;
let currentFilter: "all" | RiskLevel = "all";
let searchQuery = "";

// --- DOM Elements ---
const scanTimeEl = document.getElementById("scan-time")!;
const countTotal = document.getElementById("count-total")!;
const countRed = document.getElementById("count-red")!;
const countYellow = document.getElementById("count-yellow")!;
const countGreen = document.getElementById("count-green")!;
const listEl = document.getElementById("extensions-list")!;
const loadingEl = document.getElementById("loading")!;
const btnScan = document.getElementById("btn-scan") as HTMLButtonElement;
const searchInput = document.getElementById(
  "search-input"
) as HTMLInputElement;
const filterBtns = document.querySelectorAll<HTMLButtonElement>(".filter-btn");

const prefNotifyRed = document.getElementById(
  "pref-notify-red"
) as HTMLInputElement;
const prefNotifyYellow = document.getElementById(
  "pref-notify-yellow"
) as HTMLInputElement;

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
  const iconUrl =
    ext.icons.length > 0 ? ext.icons[ext.icons.length - 1]!.url : "";
  const iconHtml = iconUrl
    ? `<img class="ext-icon" src="${escapeHtml(iconUrl)}" alt="" />`
    : `<div class="ext-icon"></div>`;

  const installLabel = getInstallLabel(ext.installType);

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
          <div class="ext-name">${escapeHtml(ext.name)}</div>
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
          <button class="btn-action" data-action="allowlist" data-ext-id="${ext.id}">
            Add to Allowlist
          </button>
          <button class="btn-action" data-action="dismiss" data-ext-id="${ext.id}">
            Dismiss
          </button>
          ${
            ext.mayDisable && ext.enabled
              ? `<button class="btn-action danger" data-action="disable" data-ext-id="${ext.id}">
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

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Actions ---
async function handleAction(action: string, extId: string): Promise<void> {
  if (action === "disable") {
    await chrome.management.setEnabled(extId, false);
    // Re-scan after disabling
    btnScan.click();
  } else if (action === "dismiss" || action === "allowlist") {
    const data = await chrome.storage.local.get("userPreferences");
    const prefs: UserPreferences = data["userPreferences"] ?? {
      scanIntervalMinutes: 60,
      notifyOnNewRedExtension: true,
      notifyOnNewYellowExtension: false,
      dismissedExtensionIds: [],
      customAllowlist: [],
    };

    if (action === "dismiss") {
      if (!prefs.dismissedExtensionIds.includes(extId)) {
        prefs.dismissedExtensionIds.push(extId);
      }
    } else {
      if (!prefs.customAllowlist.includes(extId)) {
        prefs.customAllowlist.push(extId);
      }
    }

    await chrome.storage.local.set({ userPreferences: prefs });
  }
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

btnScan.addEventListener("click", () => {
  btnScan.disabled = true;
  btnScan.textContent = "Scanning...";
  chrome.runtime.sendMessage({ type: "RUN_SCAN" }, (result) => {
    currentResult = result as ScanResult | null;
    render();
    btnScan.disabled = false;
    btnScan.textContent = "Scan Now";
  });
});

// Preferences
prefNotifyRed.addEventListener("change", () => savePrefs());
prefNotifyYellow.addEventListener("change", () => savePrefs());

async function savePrefs(): Promise<void> {
  const data = await chrome.storage.local.get("userPreferences");
  const prefs: UserPreferences = data["userPreferences"] ?? {
    scanIntervalMinutes: 60,
    notifyOnNewRedExtension: true,
    notifyOnNewYellowExtension: false,
    dismissedExtensionIds: [],
    customAllowlist: [],
  };
  prefs.notifyOnNewRedExtension = prefNotifyRed.checked;
  prefs.notifyOnNewYellowExtension = prefNotifyYellow.checked;
  await chrome.storage.local.set({ userPreferences: prefs });
}

async function loadPrefs(): Promise<void> {
  const data = await chrome.storage.local.get("userPreferences");
  const prefs = data["userPreferences"] as UserPreferences | undefined;
  if (prefs) {
    prefNotifyRed.checked = prefs.notifyOnNewRedExtension;
    prefNotifyYellow.checked = prefs.notifyOnNewYellowExtension;
  }
}

// --- Init ---
chrome.runtime.sendMessage({ type: "GET_SCAN_RESULT" }, (result) => {
  currentResult = result as ScanResult | null;
  render();
});
loadPrefs();
