import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { compactBlast } from './blast.js';

function makeResp(over: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    changed_symbols: [
      { name: 'a', file: 'x.ts', kind: 'function' },
      { name: 'b', file: 'x.ts', kind: 'function' },
      { name: 'c', file: 'y.ts', kind: 'type' },
      { name: 'c', file: 'z.ts', kind: 'type' },
    ],
    downstream: [
      {
        symbol: 'b',
        rank: 9,
        callers: [
          { name: 'zeta', file: 'r.ts', line: 10, rank: 5 },
          { name: 'alpha', file: 'q.ts', line: 2, rank: 4 },
        ],
        endpoints_affected: ['GET /b', 'PUT /b'],
        crons_affected: ['nightly'],
      },
      {
        symbol: 'a',
        rank: 1,
        callers: [{ name: 'k', file: 'k.ts', line: 7, rank: 1 }],
        endpoints_affected: [],
        crons_affected: [],
      },
    ],
    summary: '4 changed symbol(s), 2 with callers.',
    stats: { symbols: 4, callers: 3, endpoints: 2, crons: 1 },
    impacted_endpoints: ['GET /b', 'PUT /b'],
    facts_by_file: { 'r.ts': { endpoints: ['GET /b'], crons: [] } },
    degraded: false,
    reason: null,
    index_status: 'full',
    commit_sha: 'abc123',
    limits: { max_callers_per_symbol: 20, bfs_depth: 2 },
    truncated: false,
    ...over,
  };
}

const ctx = { repo: 'o/r', pr: 6 };

test('preserves downstream and caller order', () => {
  const r = compactBlast(makeResp(), ctx);
  assert.deepEqual(r.symbols.map((s) => s.symbol), ['b', 'a']);
  assert.deepEqual(r.symbols[0]?.callers, ['r.ts:10 (zeta)', 'q.ts:2 (alpha)']);
});

test('caller string format is file:line (name)', () => {
  const r = compactBlast(makeResp(), ctx);
  assert.equal(r.symbols[1]?.callers[0], 'k.ts:7 (k)');
});

test('maps endpoints and crons', () => {
  const r = compactBlast(makeResp(), ctx);
  assert.deepEqual(r.symbols[0]?.endpoints, ['GET /b', 'PUT /b']);
  assert.deepEqual(r.symbols[0]?.crons, ['nightly']);
});

test('without_callers is deduped and in changed_symbols order', () => {
  const r = compactBlast(makeResp(), ctx);
  assert.deepEqual(r.without_callers, ['c']);
});

test('copies repo, pr, summary, stats, status fields', () => {
  const r = compactBlast(makeResp(), ctx);
  assert.equal(r.repo, 'o/r');
  assert.equal(r.pr, 6);
  assert.equal(r.summary, '4 changed symbol(s), 2 with callers.');
  assert.deepEqual(r.stats, { symbols: 4, callers: 3, endpoints: 2, crons: 1 });
  assert.equal(r.index_status, 'full');
  assert.equal(r.truncated, false);
});

test('hint present iff degraded', () => {
  assert.equal('hint' in compactBlast(makeResp(), ctx), false);
  const d = compactBlast(
    makeResp({ degraded: true, reason: 'index_partial', index_status: 'partial' }),
    ctx,
  );
  assert.match(d.hint ?? '', /Index is partial \(index_partial\)/);
});

test('drops facts_by_file, ranks, commit_sha, limits', () => {
  const r = compactBlast(makeResp(), ctx) as Record<string, unknown>;
  for (const k of ['facts_by_file', 'commit_sha', 'limits', 'changed_symbols', 'downstream', 'impacted_endpoints']) {
    assert.equal(k in r, false, k);
  }
  assert.equal(JSON.stringify(r).includes('"rank"'), false);
});

test('other_endpoints lists impacted endpoints no symbol claims, like the UI', () => {
  assert.equal(compactBlast(makeResp(), ctx).other_endpoints, undefined);
  const out = compactBlast(makeResp({ impacted_endpoints: ['GET /b', 'PUT /b', 'GET /other'] }), ctx);
  assert.deepEqual(out.other_endpoints, ['GET /other']);
});
