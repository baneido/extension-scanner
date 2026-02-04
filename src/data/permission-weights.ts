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
