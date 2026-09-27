import "server-only";

import { createHash } from "crypto";

export const SERVER_DETECTION_OWNER_HASH = createHash("sha256")
  .update("cotescope:server-detections:v1")
  .digest("hex");

export const SYSTEM_QUOTA_OPPORTUNITY_ID = "__system_quota__";
export const SYSTEM_SETTLEMENT_OPPORTUNITY_ID = "__system_settlement__";
export const SYSTEM_RADAR_CYCLE_OPPORTUNITY_ID = "__system_radar_cycle__";
export const SYSTEM_RADAR_PREFIX = "__system_radar__:";
export const SYSTEM_ODDS_SCAN_PREFIX = "__system_odds_scan__:";
