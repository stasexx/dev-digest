import type { BlastFileFacts, RankedDownstreamImpact } from "@devdigest/shared";

const SETTINGS_ROUTES = "server/src/modules/settings/routes.ts";
const FEATURE_MODELS = "server/src/modules/settings/feature-models.ts";

/** PR #6 shape: 4 symbols, 6 callers, 3 endpoints (all behind settings/routes.ts). */
export const DOWNSTREAM: RankedDownstreamImpact[] = [
  {
    symbol: "rowsToSettings",
    rank: 4,
    callers: [
      { name: "settingsRoutes", file: SETTINGS_ROUTES, line: 65, rank: 3 },
      { name: "getFeatureModelOverride", file: FEATURE_MODELS, line: 45, rank: 1 },
    ],
    endpoints_affected: ["GET /settings", "GET /settings/secrets-status", "PUT /settings"],
    crons_affected: [],
  },
  {
    symbol: "taskLine",
    rank: 2,
    callers: [
      { name: "renderTasks", file: "server/src/modules/reviews/a.ts", line: 10, rank: 1 },
      { name: "renderPlan", file: "server/src/modules/reviews/b.ts", line: 20, rank: 1 },
    ],
    endpoints_affected: [],
    crons_affected: [],
  },
  {
    symbol: "reviewToDto",
    rank: 1,
    callers: [{ name: "reviewRoutes", file: "server/src/modules/reviews/routes.ts", line: 5, rank: 1 }],
    endpoints_affected: [],
    crons_affected: [],
  },
  {
    symbol: "findingRowToDto",
    rank: 1,
    callers: [{ name: "listFindings", file: "server/src/modules/reviews/c.ts", line: 7, rank: 1 }],
    endpoints_affected: [],
    crons_affected: [],
  },
];

export const FACTS: Record<string, BlastFileFacts> = {
  [SETTINGS_ROUTES]: {
    endpoints: ["GET /settings", "GET /settings/secrets-status", "PUT /settings"],
    crons: [],
  },
};
