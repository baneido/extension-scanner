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
