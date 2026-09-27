import "server-only";

import { createHash } from "crypto";

export const SERVER_DETECTION_OWNER_HASH = createHash("sha256")
  .update("cotescope:server-detections:v1")
  .digest("hex");

export const SYSTEM_QUOTA_OPPORTUNITY_ID = "__system_quota__";
