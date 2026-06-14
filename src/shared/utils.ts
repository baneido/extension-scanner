/**
 * Escape a string for safe interpolation into HTML, including inside
 * double- or single-quoted attribute values. Extension names/ids are
 * attacker-controlled, so quotes MUST be escaped to prevent attribute
 * injection (e.g. a name containing a double quote breaking out of an
 * attribute). Order matters: ampersand first.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Get a required DOM element by id, throwing a self-describing error if it is
 * absent. Replaces scattered `getElementById(id)!` / `as HTMLElement` casts,
 * which are erased at build and surface a missing element as an opaque later
 * null-deref. Fail-fast on our own static HTML fixtures (Debt Map B-7).
 */
export function mustGetElement<T extends HTMLElement = HTMLElement>(
  id: string
): T {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`Missing required DOM element: #${id}`);
  }
  return el as T;
}

/**
 * Pick the icon URL to display for an extension. Chrome returns icons sorted
 * by ascending size, so the last entry is the largest. Returns "" when none.
 */
export function largestIconUrl(
  icons: Array<{ size: number; url: string }>
): string {
  return icons.length > 0 ? icons[icons.length - 1]!.url : "";
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds} second(s) ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute(s) ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour(s) ago`;
  const days = Math.floor(hours / 24);
  return `${days} day(s) ago`;
}
