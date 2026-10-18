import { describe, it, expect } from 'vitest';
import { BriefModelOutput, PrBrief, PrBriefRecord, PrBriefResponse } from '@devdigest/shared';

const validOutput = {
  summary: 'Adds retry to webhook delivery.',
  risks: [
    {
      kind: 'concurrency',
      title: 'Retry storm',
      explanation: 'Unbounded retries may overload the receiver.',
      severity: 'medium',
      file_refs: ['src/webhook.ts'],
    },
  ],
  review_focus: [{ file: 'src/webhook.ts', line: 42, reason: 'Retry loop bound' }],
};

const validRecord = {
  ...validOutput,
  intent: { intent: 'Retry webhooks', in_scope: ['webhook'], out_of_scope: [] },
  blast: null,
  pr_id: '3f2b8f0e-6d0a-4c53-9a58-0d9a5b1f7c11',
  head_sha: 'abc123',
  generated_at: new Date().toISOString(),
  model: { provider: 'anthropic', model: 'claude-sonnet-4' },
  missing_inputs: [{ input: 'blast', reason: 'index not built' }],
  inputs: {
    intent: 'present',
    blast: 'missing',
    blast_reason: 'index not built',
    description: 'present',
    linked_issue: 'none',
    specs: { read: ['docs/a.md'], missing: [], truncated: [], omitted: [] },
    files_total: 1,
    files_listed: 1,
    changed_files: ['src/webhook.ts'],
  },
  generation: {
    input_tokens_estimate: 1500,
    input_budget_tokens: 8000,
    truncated_sections: ['specs'],
    removed_sections: [],
    attempts: 1,
    tokens_in: 1400,
    tokens_out: 300,
    cost_usd: null,
    duration_ms: 1200,
    dropped: {
      risks: 0,
      risk_refs: 1,
      review_focus: 0,
      duplicates: 0,
      over_cap: { risks: 0, review_focus: 0 },
    },
  },
};

describe('BriefModelOutput', () => {
  it('accepts a valid fixture', () => {
    expect(BriefModelOutput.safeParse(validOutput).success).toBe(true);
  });
  it('rejects line: 0', () => {
    const bad = { ...validOutput, review_focus: [{ file: 'a.ts', line: 0, reason: 'x' }] };
    expect(BriefModelOutput.safeParse(bad).success).toBe(false);
  });
  it('rejects an empty reason', () => {
    const bad = { ...validOutput, review_focus: [{ file: 'a.ts', line: 1, reason: '' }] };
    expect(BriefModelOutput.safeParse(bad).success).toBe(false);
  });
  it('rejects a missing summary', () => {
    const { summary: _s, ...bad } = validOutput;
    expect(BriefModelOutput.safeParse(bad).success).toBe(false);
  });
  it('rejects a non-enum severity', () => {
    const bad = { ...validOutput, risks: [{ ...validOutput.risks[0], severity: 'critical' }] };
    expect(BriefModelOutput.safeParse(bad).success).toBe(false);
  });
});

describe('PrBrief', () => {
  it('accepts null intent/blast and no history', () => {
    const r = PrBrief.safeParse({ ...validOutput, intent: null, blast: null, risks: { risks: validOutput.risks } });
    expect(r.success).toBe(true);
  });
});

describe('PrBriefRecord', () => {
  it('round-trips a full fixture', () => {
    const fixture = { ...validRecord, risks: { risks: validOutput.risks } };
    const parsed = PrBriefRecord.parse(fixture);
    expect(parsed.inputs.changed_files).toEqual(['src/webhook.ts']);
    expect(PrBriefRecord.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });
});

describe('PrBriefResponse', () => {
  it('accepts brief: null', () => {
    const r = PrBriefResponse.safeParse({ brief: null, stale: false, current_head_sha: 'abc', generating: false });
    expect(r.success).toBe(true);
  });
});
