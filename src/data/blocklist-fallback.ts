import type { BlocklistEntry } from "../shared/types";
import {
  BLOCKLIST_SNAPSHOT_IDS,
  BLOCKLIST_SNAPSHOT_GENERATED,
} from "./blocklist-snapshot.generated";

// Fallback blocklist used only when the live feed is unreachable and no cache
// exists (e.g. a fresh install while the source is down). It is a committed,
// validated point-in-time snapshot of chrome-mal-ids so the extension always
// ships baseline coverage instead of failing open (Debt Map F-4). Regenerate
// with `npm run update-blocklist`; the live feed remains the source of truth.
export const FALLBACK_MALICIOUS_IDS = new Map<string, BlocklistEntry>(
  BLOCKLIST_SNAPSHOT_IDS.map((id) => [
    id,
    {
      reason: `Known malicious extension (chrome-mal-ids snapshot ${BLOCKLIST_SNAPSHOT_GENERATED})`,
      source: "chrome-mal-ids snapshot",
    },
  ])
);
