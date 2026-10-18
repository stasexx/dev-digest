import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { SmartDiffResponse } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const CORE = 'server/src/modules/x/service.ts';
const PATHS = [CORE, 'server/test/x.test.ts', 'server/src/modules/index.ts', 'README.md', 'pnpm-lock.yaml'];

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;
  const llm = new MockLLMProvider('openai', {});

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'smart', fullName: 'acme/smart' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Smart diff',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        additions: 5,
        deletions: 0,
        filesCount: PATHS.length,
        status: 'needs_review',
        body: '',
      })
      .returning();
    prId = pr!.id;
    await db.insert(t.prFiles).values(
      PATHS.map((path) => ({ prId, path, additions: 1, deletions: 0, patch: '@@ -1 +1 @@\n+x' })),
    );
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const app = () =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: '' }), llm: { openai: llm } },
    });

  const insertReview = async (kind: 'review' | 'summary', createdAt: string, lines: number[]) => {
    const [r] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId,
        agentId: null,
        runId: null,
        kind,
        verdict: null,
        summary: null,
        score: null,
        model: null,
        createdAt: new Date(createdAt),
      })
      .returning();
    if (lines.length > 0) {
      await pg.handle.db.insert(t.findings).values(
        lines.map((l) => ({
          reviewId: r!.id,
          file: CORE,
          startLine: l,
          endLine: l,
          severity: 'WARNING',
          category: 'bug',
          title: `finding ${l}`,
          rationale: 'why',
          confidence: 0.9,
        })),
      );
    }
  };

  it('(a) before any review: 200, roles in order, no finding lines', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.groups.map((g: { role: string }) => g.role)).toEqual([
      'core',
      'tests',
      'wiring',
      'docs',
      'boilerplate',
    ]);
    expect(body.groups.flatMap((g: { files: { finding_lines: number[] }[] }) => g.files).every(
      (f: { finding_lines: number[] }) => f.finding_lines.length === 0,
    )).toBe(true);
    await a.close();
  });

  it('(b)(c)(d) latest review lines only, contract-valid, no LLM calls', async () => {
    await insertReview('review', '2026-01-01T00:00:00Z', [5]);
    await insertReview('review', '2026-01-02T00:00:00Z', [10]);
    await insertReview('summary', '2026-01-03T00:00:00Z', [77]);
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(SmartDiffResponse.safeParse(body).success).toBe(true);
    const core = body.groups.find((g: { role: string }) => g.role === 'core');
    expect(core.files[0].finding_lines).toEqual([10]);
    expect(llm.calls.length).toBe(0);
    await a.close();
  });

  it('(e) unknown uuid -> 404; non-uuid id -> 4xx', async () => {
    const a = await app();
    const missing = await a.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-4000-8000-000000000000/smart-diff',
    });
    expect(missing.statusCode).toBe(404);
    const bad = await a.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    expect(bad.statusCode).toBeLessThan(500);
    await a.close();
  });
});
