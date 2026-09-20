/**
 * PR-list rollup helpers (`modules/pulls/status.ts`) — the pure derivation that
 * decides each PR's review STATUS and tallies its FINDINGS for the list. The DB
 * `status` column holds GitHub's merge state; the review status
 * (needs_review / reviewed / stale) is derived here from head vs lastReviewedSha
 * + age, so it gets unit coverage independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveReviewStatus,
  rollupSeverities,
  summarizeFindings,
  FINDING_PREVIEW_LIMIT,
  PREVIEW_RATIONALE_MAX,
  STALE_DAYS,
  type FindingSummaryRow,
} from '../src/modules/pulls/status.js';

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 11);

describe('deriveReviewStatus', () => {
  it('needs_review when never reviewed, or when head moved since the last review', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: null, headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'old', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
  });

  it('reviewed when the current head was reviewed and the PR is recent', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now - DAY), now }),
    ).toBe('reviewed');
  });

  it('stale when the current head was reviewed but the PR is older than STALE_DAYS', () => {
    expect(
      deriveReviewStatus({
        ghStatus: 'open',
        lastReviewedSha: 'abc',
        headSha: 'abc',
        updatedAt: new Date(now - (STALE_DAYS + 1) * DAY),
        now,
      }),
    ).toBe('stale');
  });

  it('keeps merged/closed regardless of review state', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'merged', lastReviewedSha: null, headSha: 'abc', updatedAt: null, now }),
    ).toBe('merged');
    expect(
      deriveReviewStatus({ ghStatus: 'closed', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('closed');
  });
});

describe('rollupSeverities', () => {
  it('tallies findings into critical / warning / suggestion buckets (ignores unknown)', () => {
    expect(
      rollupSeverities([
        { severity: 'CRITICAL' },
        { severity: 'CRITICAL' },
        { severity: 'WARNING' },
        { severity: 'SUGGESTION' },
        { severity: 'WEIRD' },
      ]),
    ).toEqual({ critical: 2, warning: 1, suggestion: 1 });
  });

  it('is all-zero for no findings', () => {
    expect(rollupSeverities([])).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });
});

describe('summarizeFindings', () => {
  const row = (id: string, severity: string, confidence = 0.9, rationale = 'why'): FindingSummaryRow => ({
    id,
    severity,
    category: 'bug',
    title: `t-${id}`,
    file: 'src/a.ts',
    startLine: 7,
    confidence,
    rationale,
  });

  it('counts per severity and totals only known severities', () => {
    const s = summarizeFindings([row('1', 'WARNING'), row('2', 'CRITICAL'), row('3', 'WARNING'), row('4', 'WEIRD')]);
    expect(s).toMatchObject({ total: 3, critical: 1, warning: 2, suggestion: 0 });
    expect(s.critical + s.warning + s.suggestion).toBe(s.total);
  });

  it('orders previews by severity then confidence and maps to the wire shape', () => {
    const s = summarizeFindings([row('s', 'SUGGESTION'), row('w-lo', 'WARNING', 0.5), row('w-hi', 'WARNING', 0.8), row('c', 'CRITICAL')]);
    expect(s.previews.map((p) => p.id)).toEqual(['c', 'w-hi', 'w-lo', 's']);
    expect(s.previews[0]).toEqual({
      id: 'c',
      severity: 'CRITICAL',
      category: 'bug',
      title: 't-c',
      file: 'src/a.ts',
      start_line: 7,
      confidence: 0.9,
      rationale: 'why',
    });
  });

  it('caps previews but still counts every finding, and truncates long rationale', () => {
    const many = Array.from({ length: FINDING_PREVIEW_LIMIT + 5 }, (_, i) => row(String(i), 'WARNING', 0.9, 'x'.repeat(500)));
    const s = summarizeFindings(many);
    expect(s.total).toBe(FINDING_PREVIEW_LIMIT + 5);
    expect(s.previews).toHaveLength(FINDING_PREVIEW_LIMIT);
    expect(s.previews[0]!.rationale.length).toBeLessThanOrEqual(PREVIEW_RATIONALE_MAX);
    expect(s.previews[0]!.rationale.endsWith('…')).toBe(true);
  });

  it('is empty for a review with no findings', () => {
    expect(summarizeFindings([])).toEqual({ total: 0, critical: 0, warning: 0, suggestion: 0, previews: [] });
  });
});
