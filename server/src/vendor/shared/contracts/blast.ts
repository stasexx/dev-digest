import { z } from 'zod';
import { BlastRadius, BlastCaller, DownstreamImpact, PrHistory } from './brief.js';

/**
 * Blast Radius (`GET /pulls/:id/blast`) and Prior PRs responses.
 *
 * Additive: `.extend()`s the existing `BlastRadius` / `PrHistory` schemas, so a
 * `BlastRadiusResponse` value always passes `BlastRadius.safeParse`.
 */

export const BlastDegradedReason = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

// NOT "IndexStatus" - that name already exists in platform.ts.
export const BlastIndexStatus = z.enum(['full', 'partial', 'degraded', 'failed']);
export type BlastIndexStatus = z.infer<typeof BlastIndexStatus>;

export const RankedBlastCaller = BlastCaller.extend({
  rank: z.number(), // file_rank of the caller file
});
export type RankedBlastCaller = z.infer<typeof RankedBlastCaller>;

export const RankedDownstreamImpact = DownstreamImpact.extend({
  callers: z.array(RankedBlastCaller),
  rank: z.number(), // sort key = sum of caller ranks
});
export type RankedDownstreamImpact = z.infer<typeof RankedDownstreamImpact>;

export const BlastStats = z.object({
  symbols: z.number().int().nonnegative(),
  callers: z.number().int().nonnegative(),
  endpoints: z.number().int().nonnegative(),
  crons: z.number().int().nonnegative(),
});
export type BlastStats = z.infer<typeof BlastStats>;

export const BlastFileFacts = z.object({
  endpoints: z.array(z.string()),
  crons: z.array(z.string()),
});
export type BlastFileFacts = z.infer<typeof BlastFileFacts>;

export const BlastLimits = z.object({
  max_callers_per_symbol: z.number().int().positive(),
  bfs_depth: z.number().int().positive(),
});
export type BlastLimits = z.infer<typeof BlastLimits>;

export const BlastRadiusResponse = BlastRadius.extend({
  downstream: z.array(RankedDownstreamImpact), // only symbols with >=1 caller, rank-sorted
  stats: BlastStats,
  impacted_endpoints: z.array(z.string()), // facade flat union (kept for the ripgrep path)
  facts_by_file: z.record(z.string(), BlastFileFacts), // caller files only; {} on the degraded path
  degraded: z.boolean(),
  reason: BlastDegradedReason.nullable(),
  index_status: BlastIndexStatus,
  commit_sha: z.string().nullable(), // sha the caller lines refer to (index last_indexed_sha)
  limits: BlastLimits, // straight from repo-intel/constants.ts
  truncated: z.boolean(), // facade hit MAX_CALLERS_PER_SYMBOL - more callers may exist
});
export type BlastRadiusResponse = z.infer<typeof BlastRadiusResponse>;

export const PriorPrsResponse = PrHistory.extend({
  source: z.literal('git'),
  clone_available: z.boolean(),
  commits_scanned: z.number().int().nonnegative(),
});
export type PriorPrsResponse = z.infer<typeof PriorPrsResponse>;
