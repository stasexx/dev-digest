import { describe, it, expect } from 'vitest';
import { PrHistory } from '@devdigest/shared';
import type { GitCommit } from '@devdigest/shared';
import { buildPriorPrs, parsePrSubject, selectCandidates } from '../src/modules/blast/prior-prs.js';

const commit = (sha: string, message: string, date: string, author = 'dev'): GitCommit => ({
  sha,
  message,
  author,
  date,
});

describe('parsePrSubject', () => {
  it('parses a merge subject with head owner and ref', () => {
    expect(parsePrSubject('Merge pull request #3 from stasexx/feat/blast')).toEqual({
      number: 3,
      kind: 'merge',
      headOwner: 'stasexx',
      headRef: 'feat/blast',
    });
  });

  it('parses a squash subject', () => {
    expect(parsePrSubject('Add x (#12)')).toEqual({ number: 12, kind: 'squash', title: 'Add x' });
  });

  it('rejects reverts and loose mentions', () => {
    expect(parsePrSubject('Revert "Add x (#12)"')).toBeNull();
    expect(parsePrSubject('fix #12 later')).toBeNull();
    expect(parsePrSubject('')).toBeNull();
  });
});

describe('selectCandidates', () => {
  const commits = [
    commit('a1', 'Add a (#9)', '2026-03-03T00:00:00Z'),
    commit('b2', 'plain commit', '2026-03-02T00:00:00Z'),
    commit('c3', 'Merge pull request #4 from o/r', '2026-03-01T00:00:00Z'),
    commit('d4', 'Add d (#5)', '2026-02-01T00:00:00Z'),
  ];

  it('excludes the current PR and non-PR commits', () => {
    const out = selectCandidates(commits, { excludeNumber: 9, max: 10 });
    expect(out.map((c) => c.parsed.number)).toEqual([4, 5]);
  });

  it('respects max', () => {
    expect(selectCandidates(commits, { excludeNumber: 0, max: 1 })).toHaveLength(1);
  });
});

describe('buildPriorPrs', () => {
  const merge = commit('1111111aaa', 'Merge pull request #3 from alice/feat', '2026-03-01T10:00:00Z', 'gh');
  const squash = commit('2222222bbb', 'Tidy (#5)', '2026-03-05T10:00:00Z', 'bob');
  const mk = (c: GitCommit, files: string[]) => {
    const parsed = parsePrSubject(c.message)!;
    return { commit: c, parsed, files };
  };

  it('keeps only overlapping candidates and reports the intersection', () => {
    const out = buildPriorPrs({
      candidates: [mk(merge, ['a.ts', 'b.ts', 'z.ts']), mk(squash, ['other.ts'])],
      changedFiles: ['b.ts', 'a.ts', 'q.ts'],
      localPulls: new Map(),
      limit: 10,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      pr_number: 3,
      title: 'alice/feat',
      author: 'alice',
      files_overlap: ['a.ts', 'b.ts'],
      notes: 'merge commit 1111111',
    });
  });

  it('prefers local title/author over fallbacks', () => {
    const out = buildPriorPrs({
      candidates: [mk(squash, ['a.ts'])],
      changedFiles: ['a.ts'],
      localPulls: new Map([[5, { title: 'Local title', author: 'carol' }]]),
      limit: 10,
    });
    expect(out[0]).toMatchObject({ title: 'Local title', author: 'carol', notes: 'squash commit 2222222' });
  });

  it('falls back to squash title and commit author', () => {
    const out = buildPriorPrs({
      candidates: [mk(squash, ['a.ts'])],
      changedFiles: ['a.ts'],
      localPulls: new Map(),
      limit: 10,
    });
    expect(out[0]).toMatchObject({ title: 'Tidy', author: 'bob' });
  });

  it('dedups by number, sorts by date desc and applies limit; output passes PrHistory', () => {
    const dup = commit('3333333ccc', 'Tidy again (#5)', '2026-03-06T00:00:00Z');
    const out = buildPriorPrs({
      candidates: [mk(squash, ['a.ts']), mk(dup, ['a.ts']), mk(merge, ['a.ts'])],
      changedFiles: ['a.ts'],
      localPulls: new Map(),
      limit: 10,
    });
    expect(out.map((i) => i.pr_number)).toEqual([5, 3]);
    expect(buildPriorPrs({
      candidates: [mk(squash, ['a.ts']), mk(merge, ['a.ts'])],
      changedFiles: ['a.ts'],
      localPulls: new Map(),
      limit: 1,
    })).toHaveLength(1);
    expect(PrHistory.parse({ history: out }).history).toHaveLength(2);
  });
});
