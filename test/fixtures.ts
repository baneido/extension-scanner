// Test fixtures for scoring characterization tests.
// makeExt() returns a complete chrome.management.ExtensionInfo with safe,
// low-risk defaults; pass overrides to exercise specific rules.

export function makeExt(
  overrides: Partial<chrome.management.ExtensionInfo> = {}
): chrome.management.ExtensionInfo {
  const base: chrome.management.ExtensionInfo = {
    id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    name: "Test Extension",
    shortName: "Test",
    description: "A normal test extension with a sufficiently long description",
    version: "1.0.0",
    mayDisable: true,
    enabled: true,
    isApp: false,
    type: "extension",
    homepageUrl: "https://example.com",
    offlineEnabled: false,
    optionsUrl: "",
    permissions: [],
    hostPermissions: [],
    installType: "normal",
    icons: [],
  };
  return { ...base, ...overrides };
}
