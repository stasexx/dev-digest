/**
 * AC-51: GET /pulls/:id (detail refresh) persists the head SHA observed on GitHub.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('pulls head sha refresh (Testcontainers pg)', () => {
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

  it('GET /pulls/:id stores the head_sha returned by GitHub', async () => {
    const db = pg.handle.db;
    const name = `headsha-${randomUUID().slice(0, 8)}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 9,
        title: 'Head sha fixture',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'a'.repeat(40),
        status: 'open',
      })
      .returning();

    const app = await buildApp({
      config: config(),
      db,
      overrides: { github: new MockGitHubClient({ detail: { head_sha: 'b'.repeat(40) } }) },
    });
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}` });
    expect(res.statusCode).toBe(200);

    const [after] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.id, pr!.id));
    expect(after!.headSha).toBe('b'.repeat(40));
  });
});
