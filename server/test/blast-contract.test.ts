import { describe, it, expect } from 'vitest';
import { BlastRadius, PrHistory } from '@devdigest/shared';
import {
  BlastDegradedReason,
  BlastRadiusResponse,
  PriorPrsResponse,
} from '@devdigest/shared';
import type { DegradedReason } from '../src/modules/repo-intel/types.js';

// Compile-time: every repo-intel DegradedReason must be a valid contract reason.
const _reasonCheck: BlastDegradedReason = '' as DegradedReason;
void _reasonCheck;

const blastFixture = {
  changed_symbols: [{ name: 'parseDiff', file: 'src/diff.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'parseDiff',
      callers: [
        { name: 'buildBrief', file: 'src/brief.ts', line: 42, rank: 0.4 },
        { name: 'handler', file: 'src/routes.ts', line: 10, rank: 0.2 },
      ],
      endpoints_affected: ['GET /pulls/:id/brief'],
      crons_affected: [],
      rank: 0.6,
    },
  ],
  summary: '1 symbol, 2 callers',
  stats: { symbols: 1, callers: 2, endpoints: 1, crons: 0 },
  impacted_endpoints: ['GET /pulls/:id/brief'],
  facts_by_file: {
    'src/routes.ts': { endpoints: ['GET /pulls/:id/brief'], crons: [] },
  },
  degraded: false,
  reason: null,
  index_status: 'full',
  commit_sha: 'abc123',
  limits: { max_callers_per_symbol: 50, bfs_depth: 2 },
  truncated: false,
};

const priorPrsFixture = {
  history: [
    {
      pr_number: 3,
      title: 'Refactor diff parser',
      merged_at: '2026-09-01T10:00:00Z',
      author: 'alice',
      files_overlap: ['src/diff.ts'],
      notes: '',
    },
  ],
  source: 'git',
  clone_available: true,
  commits_scanned: 120,
};

describe('blast contract', () => {
  it('parses a full BlastRadiusResponse', () => {
    expect(BlastRadiusResponse.safeParse(blastFixture).success).toBe(true);
  });

  it('is a superset of BlastRadius', () => {
    expect(BlastRadius.safeParse(blastFixture).success).toBe(true);
  });

  it('PriorPrsResponse parses and is a superset of PrHistory', () => {
    expect(PriorPrsResponse.safeParse(priorPrsFixture).success).toBe(true);
    expect(PrHistory.safeParse(priorPrsFixture).success).toBe(true);
  });

  it('rejects an unknown degraded reason', () => {
    const bad = { ...blastFixture, degraded: true, reason: 'bogus' };
    expect(BlastRadiusResponse.safeParse(bad).success).toBe(false);
  });
});
