export const PERMISSION_WEIGHTS: Record<string, number> = {
  // Critical (20+ pts)
  debugger: 25,
  desktopCapture: 20,
  pageCapture: 20,

  // High (10-19 pts)
  webRequest: 15,
  webRequestBlocking: 18,
  declarativeNetRequest: 12,
  scripting: 15,
  tabs: 10,
  cookies: 15,
  proxy: 15,
  downloads: 10,
  nativeMessaging: 15,
  clipboardRead: 12,
  history: 12,
  bookmarks: 8,
  topSites: 8,

  // Medium (5-9 pts)
  webNavigation: 7,
  activeTab: 3,
  notifications: 2,
  contextMenus: 1,
  identity: 8,
  management: 10,
  geolocation: 6,

  // Low (0-4 pts)
  storage: 0,
  alarms: 0,
  idle: 1,
  runtime: 0,
  i18n: 0,
  unlimitedStorage: 3,

  // --- Catalog completion (Debt Map F-1) ---
  // Capture / arbitrary injection (critical)
  tabCapture: 20,
  audioCapture: 20,
  videoCapture: 20,
  userScripts: 18,

  // Network intercept / system / identity reach (high)
  declarativeNetRequestWithHostAccess: 15,
  vpnProvider: 15,
  privacy: 12,
  contentSettings: 12,
  certificateProvider: 12,
  platformKeys: 12,
  webAuthenticationProxy: 12,
  declarativeNetRequestFeedback: 10,
  processes: 10,
  loginState: 10,

  // Moderate read/observe (medium)
  browsingData: 8,
  systemLog: 7,
  documentScan: 6,
  declarativeContent: 5,
  gcm: 5,
  printing: 5,
  printerProvider: 5,
  printingMetrics: 5,

  // UI / ergonomic, no data-exfil surface (low / zero)
  search: 4,
  accessibilityFeatures: 4,
  sessions: 3,
  ttsEngine: 2,
  dns: 2,
  input: 2,
  offscreen: 1,
  tabGroups: 1,
  readingList: 1,
  favicon: 1,
  tts: 1,
  audio: 1,
  sidePanel: 0,
  fontSettings: 0,
  power: 0,
  wallpaper: 0,
};

export interface DangerousCombo {
  permissions: string[];
  bonus: number;
  description: string;
}

export const DANGEROUS_COMBOS: DangerousCombo[] = [
  {
    permissions: ["tabs", "scripting"],
    bonus: 15,
    description:
      "Can read tab URLs and inject scripts - able to manipulate all page content",
  },
  {
    permissions: ["cookies", "webRequest"],
    bonus: 20,
    description:
      "Can intercept traffic and steal cookies - session hijacking risk",
  },
  {
    permissions: ["downloads", "scripting"],
    bonus: 10,
    description:
      "Can inject scripts and silently download files - malware distribution risk",
  },
  {
    permissions: ["nativeMessaging", "scripting"],
    bonus: 15,
    description:
      "Can inject scripts and communicate with native apps - OS-level operation risk",
  },
  {
    permissions: ["history", "tabs", "cookies"],
    bonus: 15,
    description:
      "Full access to browsing history, active tabs, and session cookies - surveillance risk",
  },
  {
    permissions: ["proxy", "webRequest"],
    bonus: 20,
    description:
      "Can route and intercept all network traffic - man-in-the-middle attack risk",
  },
  {
    permissions: ["clipboardRead", "scripting"],
    bonus: 10,
    description:
      "Can read clipboard and inject scripts - credential theft risk",
  },
];
