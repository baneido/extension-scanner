import type { ScanResult } from "./types";

// Message protocol between the popup/dashboard and the service worker.
// The string `type` values are part of the contract and must not change.
export type ExtMessage =
  | { type: "GET_SCAN_RESULT" }
  | { type: "RUN_SCAN" }
  | { type: "OPEN_DASHBOARD" };

// GET_SCAN_RESULT and RUN_SCAN respond with the latest scan result, or null
// when none is available or the scan failed.
export type ScanResultResponse = ScanResult | null;

/** Send a typed message to the service worker. */
export function sendExtMessage(message: ExtMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}
