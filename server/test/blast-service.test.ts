import { describe, it, expect, vi } from 'vitest';
import { PrHistory, BlastRadiusResponse } from '@devdigest/shared';
import type { GitCommit } from '@devdigest/shared';
import { BlastService } from '../src/modules/blast/service.js';
import type { BlastRepository, BlastPullContext } from '../src/modules/blast/repository.js';
import { NotFoundError } from '../src/platform/errors.js';
import type { BlastResult, IndexState } from '../src/modules/repo-intel/types.js';

const FILES = ['server/src/modules/settings/helpers.ts', 'server/src/modules/reviews/helpers.ts'];

const ctx = (clonePath: string | null): BlastPullContext => ({
  pull: { id: 'pr1', number: 6, repoId: 'repo1', headSha: 'abc' },
  repo: { id: 'repo1', owner: 'o', name: 'n', fullName: 'o/n', clonePath },
});

const fakeRepo = (c: BlastPullContext | null): BlastRepository =>
  ({
    getPullWithRepo: async () => c,
    listChangedFiles: async () => FILES,
    getPullsByNumbers: async () => new Map(),
  }) as unknown as BlastRepository;

const state: IndexState = {
  repoId: 'repo1',
  status: 'full',
  filesIndexed: 1,
  filesSkipped: 0,
  durationMs: 1,
  lastIndexedSha: 'sha1',
  indexerVersion: 2,
  updatedAt: new Date(0),
};

const blast: BlastResult = {
  changedSymbols: [{ name: 'rowsToSettings', file: FILES[0]!, kind: 'function' }],
  callers: [{ file: 'server/src/modules/settings/routes.ts', symbol: 'settingsRoutes', viaSymbol: 'rowsToSettings', line: 65, rank: 1 }],
  impactedEndpoints: ['GET /settings'],
  factsByFile: { 'server/src/modules/settings/routes.ts': { endpoints: ['GET /settings'], crons: [] } },
};

function build(opts: { ctx: BlastPullContext | null; git?: object }) {
  const repoIntel = {
    getBlastRadius: vi.fn(async () => blast),
    getIndexState: vi.fn(async () => state),
    indexRepo: vi.fn(),
    refreshIndex: vi.fn(),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const container = { config: {}, db: {} as never, repoIntel, git: opts.git ?? {} } as never;
  const svc = new BlastService(container, logger, fakeRepo(opts.ctx));
  return { svc, repoIntel, logger };
}

describe('BlastService.getBlastRadius', () => {
  it('reads the index once with the pr_files paths and never re-indexes', async () => {
    const { svc, repoIntel } = build({ ctx: ctx('/clone') });
    const out = await svc.getBlastRadius('ws', 'pr1');
    expect(repoIntel.getBlastRadius).toHaveBeenCalledTimes(1);
    expect(repoIntel.getBlastRadius).toHaveBeenCalledWith('repo1', FILES);
    expect(repoIntel.indexRepo).not.toHaveBeenCalled();
    expect(repoIntel.refreshIndex).not.toHaveBeenCalled();
    expect(BlastRadiusResponse.safeParse(out).success).toBe(true);
    expect(out.downstream[0]!.symbol).toBe('rowsToSettings');
  });

  it('logs one info line marked persistent-index', async () => {
    const { svc, logger } = build({ ctx: ctx('/clone') });
    await svc.getBlastRadius('ws', 'pr1');
    expect(logger.info).toHaveBeenCalledTimes(1);
    const [obj, msg] = logger.info.mock.calls[0]!;
    expect(obj).toMatchObject({ served: 'persistent-index', indexStatus: 'full', changedFiles: 2 });
    expect(msg).toContain('persistent-index');
  });

  it('throws NotFoundError for an unknown PR', async () => {
    const { svc, repoIntel } = build({ ctx: null });
    await expect(svc.getBlastRadius('ws', 'nope')).rejects.toBeInstanceOf(NotFoundError);
    expect(repoIntel.getBlastRadius).not.toHaveBeenCalled();
  });
});

describe('BlastService.getPriorPrs', () => {
  it('reports clone_available:false without a clone', async () => {
    const { svc } = build({ ctx: ctx(null) });
    expect(await svc.getPriorPrs('ws', 'pr1')).toEqual({
      history: [],
      source: 'git',
      clone_available: false,
      commits_scanned: 0,
    });
  });

  it('returns only the overlapping PR and skips commits whose parent is missing', async () => {
    const log: GitCommit[] = [
      { sha: 'aaaaaaa1', message: 'Merge pull request #3 from alice/feat', author: 'gh', date: '2026-03-01T00:00:00Z' },
      { sha: 'bbbbbbb2', message: 'Other (#5)', author: 'bob', date: '2026-03-02T00:00:00Z' },
      { sha: 'ccccccc3', message: 'Old (#2)', author: 'bob', date: '2026-01-01T00:00:00Z' },
      { sha: 'ddddddd4', message: 'noise', author: 'bob', date: '2026-01-01T00:00:00Z' },
    ];
    const git = {
      log: async () => log,
      diffNameOnly: async (_r: unknown, base: string) => {
        if (base.startsWith('aaaaaaa1')) return [FILES[0]!, 'x.ts'];
        if (base.startsWith('bbbbbbb2')) return ['unrelated.ts'];
        throw new Error('bad revision');
      },
    };
    const { svc } = build({ ctx: ctx('/clone'), git });
    const out = await svc.getPriorPrs('ws', 'pr1');
    expect(out.commits_scanned).toBe(log.length);
    expect(out.clone_available).toBe(true);
    expect(out.history).toHaveLength(1);
    expect(out.history[0]).toMatchObject({ pr_number: 3, files_overlap: [FILES[0]] });
    expect(PrHistory.safeParse(out).success).toBe(true);
  });

  it('survives a failing git log with an empty list', async () => {
    const git = { log: async () => { throw new Error('boom'); }, diffNameOnly: async () => [] };
    const { svc } = build({ ctx: ctx('/clone'), git });
    const out = await svc.getPriorPrs('ws', 'pr1');
    expect(out).toMatchObject({ history: [], clone_available: true, commits_scanned: 0 });
  });
});
