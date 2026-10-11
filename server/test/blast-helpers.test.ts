import { describe, it, expect } from 'vitest';
import { BlastRadius, BlastRadiusResponse } from '@devdigest/shared';
import { toBlastRadius, groupCallers } from '../src/modules/blast/helpers.js';
import { BFS_DEPTH, MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import type { BlastResult, IndexState } from '../src/modules/repo-intel/types.js';

const REVIEWS = 'server/src/modules/reviews/helpers.ts';
const SETTINGS = 'server/src/modules/settings/helpers.ts';
const ROUTES = 'server/src/modules/settings/routes.ts';
const FEATURE = 'server/src/modules/settings/feature-models.ts';

const sym = (name: string, file: string, kind = 'function') => ({ name, file, kind });

const SYMBOLS = [
  sym('ReviewDtoFinding', REVIEWS, 'type'),
  sym('ReviewDto', REVIEWS, 'type'),
  sym('findingRowToDto', REVIEWS),
  sym('reviewToDto', REVIEWS),
  sym('taskLine', REVIEWS),
  sym('SettingsRow', SETTINGS, 'type'),
  sym('rowsToSettings', SETTINGS),
];

// Facade order is rank-desc across callers; ranks here are fixture values.
const CALLERS: BlastResult['callers'] = [
  { file: ROUTES, symbol: 'settingsRoutes', viaSymbol: 'rowsToSettings', line: 65, rank: 0.9 },
  { file: FEATURE, symbol: 'getFeatureModelOverride', viaSymbol: 'rowsToSettings', line: 45, rank: 0.5 },
  { file: 'server/src/modules/reviews/routes.ts', symbol: 'reviewRoutes', viaSymbol: 'taskLine', line: 30, rank: 0.3 },
  { file: 'server/src/modules/reviews/run-executor.ts', symbol: 'runOneAgent', viaSymbol: 'taskLine', line: 80, rank: 0.2 },
  { file: 'server/src/modules/pulls/routes.ts', symbol: 'pullRoutes', viaSymbol: 'reviewToDto', line: 12, rank: 0.4 },
  { file: 'server/src/modules/reviews/service.ts', symbol: 'list', viaSymbol: 'findingRowToDto', line: 9, rank: 0.1 },
];

const FACTS = {
  [ROUTES]: {
    endpoints: ['GET /settings', 'PUT /settings', 'GET /settings/secrets-status'],
    crons: [],
  },
};

const fullState: IndexState = {
  repoId: 'r1',
  status: 'full',
  filesIndexed: 312,
  filesSkipped: 0,
  durationMs: 1,
  lastIndexedSha: 'c6af1e452969dcad9f451e29c0a4e461a41405ae',
  indexerVersion: 2,
  updatedAt: new Date(0),
};

const pr6: BlastResult = {
  changedSymbols: SYMBOLS,
  callers: CALLERS,
  impactedEndpoints: [...FACTS[ROUTES].endpoints],
  factsByFile: FACTS,
};

describe('toBlastRadius (PR #6 fixture)', () => {
  const out = toBlastRadius(pr6, { indexState: fullState });

  it('groups callers into 4 downstream entries', () => {
    expect(out.downstream).toHaveLength(4);
  });

  it('orders by rank-sum desc', () => {
    expect(out.downstream.map((d) => d.symbol)).toEqual([
      'rowsToSettings',
      'taskLine',
      'reviewToDto',
      'findingRowToDto',
    ]);
  });

  it('attributes endpoints only to the group whose caller file has facts', () => {
    const [first, ...rest] = out.downstream;
    expect(first!.endpoints_affected).toEqual([
      'GET /settings',
      'GET /settings/secrets-status',
      'PUT /settings',
    ]);
    expect(first!.crons_affected).toEqual([]);
    for (const d of rest) expect(d.endpoints_affected).toEqual([]);
  });

  it('computes stats {7,6,3,0}', () => {
    expect(out.stats).toEqual({ symbols: 7, callers: 6, endpoints: 3, crons: 0 });
  });

  it('builds the deterministic summary', () => {
    expect(out.summary).toBe(
      '7 changed symbol(s), 4 with callers: 6 caller(s), 3 endpoint(s), 0 cron(s) affected.',
    );
  });

  it('keeps caller shape file:line + name + rank', () => {
    expect(out.downstream[0]!.callers[0]).toEqual({
      name: 'settingsRoutes',
      file: ROUTES,
      line: 65,
      rank: 0.9,
    });
  });

  it('limits come from the repo-intel constants', () => {
    expect(out.limits).toEqual({ max_callers_per_symbol: MAX_CALLERS_PER_SYMBOL, bfs_depth: BFS_DEPTH });
  });

  it('commit_sha / index_status come from the index state; facts only for caller files', () => {
    expect(out.commit_sha).toBe(fullState.lastIndexedSha);
    expect(out.index_status).toBe('full');
    expect(Object.keys(out.facts_by_file)).toEqual([ROUTES]);
    expect(out.degraded).toBe(false);
    expect(out.reason).toBeNull();
    expect(out.truncated).toBe(false);
  });

  it('validates against BlastRadiusResponse and the base BlastRadius contract', () => {
    expect(BlastRadiusResponse.parse(out)).toBeTruthy();
    expect(BlastRadius.safeParse(out).success).toBe(true);
  });
});

describe('toBlastRadius edge cases', () => {
  it('drops a caller living in the declaring file (R13)', () => {
    const out = toBlastRadius(
      {
        ...pr6,
        callers: [
          { file: SETTINGS, symbol: 'selfCall', viaSymbol: 'rowsToSettings', line: 5, rank: 1 },
          ...CALLERS,
        ],
      },
      { indexState: fullState },
    );
    const files = out.downstream.find((d) => d.symbol === 'rowsToSettings')!.callers.map((c) => c.file);
    expect(files).not.toContain(SETTINGS);
    expect(out.stats.callers).toBe(6);
  });

  it('passes degraded/reason through from the facade', () => {
    const out = toBlastRadius(
      { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'no_data' },
      { indexState: { ...fullState, status: 'degraded', lastIndexedSha: '' } },
    );
    expect(out.degraded).toBe(true);
    expect(out.reason).toBe('no_data');
    expect(out.index_status).toBe('degraded');
    expect(out.commit_sha).toBeNull();
    expect(out.downstream).toEqual([]);
    expect(out.facts_by_file).toEqual({});
    expect(out.summary).toContain('map may be incomplete');
  });

  it('surfaces a partial index as degraded index_partial', () => {
    const out = toBlastRadius({ ...pr6, degraded: false }, { indexState: { ...fullState, status: 'partial' } });
    expect(out.degraded).toBe(true);
    expect(out.reason).toBe('index_partial');
  });

  it('keeps crons separate from endpoints (R21)', () => {
    const out = toBlastRadius(
      {
        changedSymbols: [sym('f', 'a.ts')],
        callers: [{ file: 'b.ts', symbol: 'g', viaSymbol: 'f', line: 3, rank: 1 }],
        impactedEndpoints: [],
        factsByFile: { 'b.ts': { endpoints: [], crons: ['nightly-sync'] } },
      },
      { indexState: fullState },
    );
    expect(out.downstream[0]!.crons_affected).toEqual(['nightly-sync']);
    expect(out.downstream[0]!.endpoints_affected).toEqual([]);
    expect(out.stats).toMatchObject({ endpoints: 0, crons: 1 });
  });

  it('caps a group at MAX_CALLERS_PER_SYMBOL and flags truncated', () => {
    const many = Array.from({ length: MAX_CALLERS_PER_SYMBOL + 5 }, (_, i) => ({
      file: `c${i}.ts`,
      symbol: `fn${i}`,
      viaSymbol: 'f',
      line: i + 1,
      rank: 1,
    }));
    const out = toBlastRadius(
      { changedSymbols: [sym('f', 'a.ts')], callers: many, impactedEndpoints: [] },
      { indexState: fullState },
    );
    expect(out.downstream[0]!.callers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(out.truncated).toBe(true);
    expect(groupCallers(many, [sym('f', 'a.ts')]).get('f')).toHaveLength(MAX_CALLERS_PER_SYMBOL);
  });

  it('ripgrep path: no factsByFile, rank 0, flat endpoints counted', () => {
    const out = toBlastRadius(
      {
        changedSymbols: [sym('f', 'a.ts')],
        callers: [
          { file: 'b.ts', symbol: 'g', viaSymbol: 'f', line: 3, rank: 0 },
          { file: 'c.ts', symbol: 'h', viaSymbol: 'f', line: 4, rank: 0 },
        ],
        impactedEndpoints: ['GET /x'],
        degraded: true,
        reason: 'index_failed',
      },
      { indexState: { ...fullState, status: 'failed' } },
    );
    expect(out.facts_by_file).toEqual({});
    expect(out.impacted_endpoints).toEqual(['GET /x']);
    expect(out.stats.endpoints).toBe(1);
    expect(out.downstream[0]!.endpoints_affected).toEqual([]);
    expect(BlastRadiusResponse.safeParse(out).success).toBe(true);
  });

  it('breaks rank ties by caller count then symbol name', () => {
    const out = toBlastRadius(
      {
        changedSymbols: [sym('b', 'a.ts'), sym('a', 'a.ts'), sym('c', 'a.ts')],
        callers: [
          { file: 'x.ts', symbol: 'x', viaSymbol: 'b', line: 1, rank: 0 },
          { file: 'y.ts', symbol: 'y', viaSymbol: 'a', line: 1, rank: 0 },
          { file: 'z.ts', symbol: 'z', viaSymbol: 'c', line: 1, rank: 0 },
          { file: 'w.ts', symbol: 'w', viaSymbol: 'c', line: 2, rank: 0 },
        ],
        impactedEndpoints: [],
      },
      { indexState: fullState },
    );
    expect(out.downstream.map((d) => d.symbol)).toEqual(['c', 'a', 'b']);
  });
});
