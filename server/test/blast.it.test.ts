/**
 * Blast radius routes (GET /pulls/:id/blast, GET /pulls/:id/prior-prs).
 * Real Postgres for the PR/repo/pr_files rows; the repo-intel facade and git are
 * injected fakes, so the test proves the route reads the index exactly once and
 * never re-indexes. Gated on Docker like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BlastRadius, BlastRadiusResponse, PrHistory } from '@devdigest/shared';
import type { GitClient } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { BlastResult, IndexState, RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const FILES = ['server/src/modules/reviews/helpers.ts', 'server/src/modules/settings/helpers.ts'];
const ROUTES_FILE = 'server/src/modules/settings/routes.ts';

const BLAST: BlastResult = {
  changedSymbols: [
    { name: 'rowsToSettings', file: FILES[1]!, kind: 'function' },
    { name: 'taskLine', file: FILES[0]!, kind: 'function' },
  ],
  callers: [
    { file: ROUTES_FILE, symbol: 'settingsRoutes', viaSymbol: 'rowsToSettings', line: 65, rank: 0.9 },
    { file: 'server/src/modules/settings/feature-models.ts', symbol: 'getFeatureModelOverride', viaSymbol: 'rowsToSettings', line: 45, rank: 0.5 },
    { file: 'server/src/modules/reviews/run-executor.ts', symbol: 'runOneAgent', viaSymbol: 'taskLine', line: 80, rank: 0.2 },
  ],
  impactedEndpoints: ['GET /settings', 'PUT /settings'],
  factsByFile: { [ROUTES_FILE]: { endpoints: ['GET /settings', 'PUT /settings'], crons: [] } },
};

const STATE: IndexState = {
  repoId: 'x',
  status: 'full',
  filesIndexed: 3,
  filesSkipped: 0,
  durationMs: 1,
  lastIndexedSha: 'c6af1e4',
  indexerVersion: 2,
  updatedAt: new Date(0),
};

function fakeFacade() {
  const calls = { getBlastRadius: [] as Array<{ repoId: string; files: string[] }>, indexRepo: 0, refreshIndex: 0 };
  const facade = {
    getBlastRadius: async (repoId: string, files: string[]) => {
      calls.getBlastRadius.push({ repoId, files });
      return BLAST;
    },
    getIndexState: async () => STATE,
    indexRepo: async () => {
      calls.indexRepo++;
      throw new Error('must not index');
    },
    refreshIndex: async () => {
      calls.refreshIndex++;
      throw new Error('must not refresh');
    },
  } as unknown as RepoIntel;
  return { facade, calls };
}

const fakeGit = {
  log: async () => [
    { sha: 'aaaaaaa1', message: 'Merge pull request #3 from alice/feat', author: 'gh', date: '2026-03-01T00:00:00Z' },
  ],
  diffNameOnly: async () => [FILES[0]!],
} as unknown as GitClient;

d('blast routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function seedPr() {
    const db = pg.handle.db;
    const name = `blast-${randomUUID().slice(0, 8)}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: `/tmp/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 6,
        title: 'Blast fixture',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'deadbeef',
        filesCount: 2,
        status: 'open',
      })
      .returning();
    await db.insert(t.prFiles).values(FILES.map((path) => ({ prId: pr!.id, path })));
    return { repo: repo!, pr: pr! };
  }

  it('GET /pulls/:id/blast maps the facade result and reads the index once', async () => {
    const { facade, calls } = fakeFacade();
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { repoIntel: facade, git: fakeGit } });
    const { repo, pr } = await seedPr();

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(BlastRadius.safeParse(body).success).toBe(true);
    expect(BlastRadiusResponse.safeParse(body).success).toBe(true);
    expect(body.downstream[0].symbol).toBe('rowsToSettings');
    expect(body.stats).toEqual({ symbols: 2, callers: 3, endpoints: 2, crons: 0 });
    expect(body.degraded).toBe(false);
    expect(calls.getBlastRadius).toHaveLength(1);
    expect(calls.getBlastRadius[0]).toEqual({ repoId: repo.id, files: [...FILES].sort() });
    expect(calls.indexRepo).toBe(0);
    expect(calls.refreshIndex).toBe(0);
  });

  it('returns 404 not_found for an unknown PR', async () => {
    const { facade } = fakeFacade();
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { repoIntel: facade, git: fakeGit } });
    const res = await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/blast` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('GET /pulls/:id/prior-prs returns a PrHistory-valid body', async () => {
    const { facade } = fakeFacade();
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { repoIntel: facade, git: fakeGit } });
    const { pr } = await seedPr();

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/prior-prs` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(PrHistory.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ source: 'git', clone_available: true, commits_scanned: 1 });
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({ pr_number: 3, files_overlap: [FILES[0]] });
  });
});
