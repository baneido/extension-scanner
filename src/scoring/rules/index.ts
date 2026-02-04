import { blocklistRule } from "./blocklist";
import { permissionsRule } from "./permissions";
import { hostPermissionsRule } from "./host-permissions";
import { installTypeRule } from "./install-type";
import { metadataRule } from "./metadata";
import type { ScoringRule } from "../types";

export const allRules: ScoringRule[] = [
  blocklistRule,
  permissionsRule,
  hostPermissionsRule,
  installTypeRule,
  metadataRule,
];
