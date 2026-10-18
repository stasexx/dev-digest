import { z } from 'zod';
import { PrBrief } from './brief.js';
import { Provider } from './knowledge.js';

/**
 * PR Why + Risk Brief: persisted record, API response and error codes.
 * Builds on PrBrief (contracts/brief) with provenance, input diagnostics
 * and generation metadata.
 */

export const BriefInputName = z.enum(['intent', 'blast', 'specs', 'linked_issue']);
export type BriefInputName = z.infer<typeof BriefInputName>;

export const BriefMissingInput = z.object({
  input: BriefInputName,
  reason: z.string().min(1),
});
export type BriefMissingInput = z.infer<typeof BriefMissingInput>;

export const BriefSection = z.enum(['specs', 'blast_detail', 'linked_issue', 'description', 'files']);
export type BriefSection = z.infer<typeof BriefSection>;

export const BriefInputs = z.object({
  intent: z.enum(['present', 'missing']),
  blast: z.enum(['present', 'partial', 'missing']),
  blast_reason: z.string().nullable(),
  description: z.enum(['present', 'empty']),
  linked_issue: z.enum(['present', 'none', 'unavailable']),
  specs: z.object({
    read: z.array(z.string()),
    missing: z.array(z.string()),
    truncated: z.array(z.string()),
    omitted: z.array(z.string()),
  }),
  files_total: z.number().int().min(0),
  files_listed: z.number().int().min(0),
  /** Snapshot PR paths; used to re-derive the allowed set for grounding. */
  changed_files: z.array(z.string()),
});
export type BriefInputs = z.infer<typeof BriefInputs>;

export const BriefGeneration = z.object({
  input_tokens_estimate: z.number().int().min(0),
  input_budget_tokens: z.number().int().positive(),
  truncated_sections: z.array(BriefSection),
  removed_sections: z.array(BriefSection),
  attempts: z.number().int().min(1),
  tokens_in: z.number().int().min(0),
  tokens_out: z.number().int().min(0),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().min(0),
  dropped: z.object({
    risks: z.number().int().min(0),
    risk_refs: z.number().int().min(0),
    review_focus: z.number().int().min(0),
    duplicates: z.number().int().min(0),
    over_cap: z.object({
      risks: z.number().int().min(0),
      review_focus: z.number().int().min(0),
    }),
  }),
});
export type BriefGeneration = z.infer<typeof BriefGeneration>;

export const PrBriefRecord = PrBrief.extend({
  pr_id: z.string().uuid(),
  head_sha: z.string().min(1),
  generated_at: z.string().datetime(),
  model: z.object({ provider: Provider, model: z.string().min(1) }),
  missing_inputs: z.array(BriefMissingInput),
  inputs: BriefInputs,
  generation: BriefGeneration,
});
export type PrBriefRecord = z.infer<typeof PrBriefRecord>;

export const PrBriefResponse = z.object({
  brief: PrBriefRecord.nullable(),
  stale: z.boolean(),
  current_head_sha: z.string(),
  generating: z.boolean(),
});
export type PrBriefResponse = z.infer<typeof PrBriefResponse>;

export const BriefErrorCode = z.enum([
  'brief_model_not_configured',
  'brief_model_failed',
  'brief_generation_in_progress',
  'brief_input_over_budget',
]);
export type BriefErrorCode = z.infer<typeof BriefErrorCode>;
