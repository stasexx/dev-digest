/**
 * PR Brief routes (GET/POST /pulls/:id/brief). Real Postgres; the LLM, GitHub
 * and repo-intel are injected fakes, so the tests prove call counts, caching,
 * staleness, grounding and error-body hygiene. Gated on Docker.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { StructuredRequest, StructuredResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { ExternalServiceError } from '../src/platform/errors.js';
import type { BlastResult, IndexState, RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const PATCH = '@@ -1,3 +1,4 @@\n a\n+b\n c\n d';
const OUTPUT = {
  summary: 'Adds a retry loop.',
  risks: [
    { kind: 'other', title: 'Real risk', explanation: 'e', severity: 'medium', file_refs: ['src/service.ts:2', 'fabricated/path.ts'] },
    { kind: 'other', title: 'Invented', explanation: 'e', severity: 'low', file_refs: ['fabricated/only.ts'] },
  ],
  review_focus: [
    { file: 'src/service.ts', line: 2, reason: 'retry' },
    { file: 'fabricated/path.ts', line: 3, reason: 'invented' },
  ],
};

class FlexLLM extends MockLLMProvider {
  fail = false;
  constructor() {
    super('anthropic', { structured: OUTPUT });
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (this.fail) {
      this.calls.push({ method: 'completeStructured', req });
      throw new ExternalServiceError('Anthropic structured output failed schema validation', { raw: 'RAW_MODEL_TEXT' });
    }
    return super.completeStructured(req);
  }
  get structured() {
    return this.calls.filter((c) => c.method === 'completeStructured').length;
  }
}

const STATE: IndexState = {
  repoId: 'x', status: 'full', filesIndexed: 1, filesSkipped: 0, durationMs: 1,
  lastIndexedSha: 'c1', indexerVersion: 2, updatedAt: new Date(0),
};
const BLAST: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [], factsByFile: {} };
const facade = {
  getBlastRadius: async () => BLAST,
  getIndexState: async () => STATE,
  indexRepo: async () => { throw new Error('must not index'); },
  refreshIndex: async () => { throw new Error('must not refresh'); },
} as unknown as RepoIntel;

function countingGithub() {
  const inner = new MockGitHubClient();
  const calls: string[] = [];
  const proxy = new Proxy(inner, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv);
      if (typeof v !== 'function') return v;
      return (...args: unknown[]) => {
        calls.push(String(prop));
        return (v as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { github: proxy as MockGitHubClient, calls };
}

d('brief routes (Testcontainers pg)', () => {
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

  async function seedPr(ws = workspaceId, headSha = 'a'.repeat(40)) {
    const db = pg.handle.db;
    const name = `brief-${randomUUID().slice(0, 8)}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws, repoId: repo!.id, number: 3, title: 'Add retry', body: 'Adds retry.',
        author: 'dev', branch: 'feat/x', base: 'main', headSha, filesCount: 1, status: 'open',
      })
      .returning();
    await db.insert(t.prFiles).values([{ prId: pr!.id, path: 'src/service.ts', additions: 1, deletions: 0, patch: PATCH }]);
    return pr!;
  }

  async function makeApp(llm = new FlexLLM(), github: MockGitHubClient = new MockGitHubClient()) {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { anthropic: llm }, repoIntel: facade, github },
    });
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { risk_brief: { provider: 'anthropic', model: 'claude-sonnet-4-6' } } },
    });
    expect(put.statusCode).toBe(200);
    return { app, llm };
  }

  const storedJson = async (prId: string) =>
    (await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId)))[0]?.json as
      | { head_sha: string; inputs: { changed_files: string[] } }
      | undefined;

  it('GET with no brief returns null and makes no model call', async () => {
    const { app, llm } = await makeApp();
    const pr = await seedPr();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null, stale: false, current_head_sha: pr.headSha, generating: false });
    expect(llm.structured).toBe(0);
    await app.close();
  });

  it('POST generates, stores a SHA-bound row and a second POST overwrites it', async () => {
    const { app, llm } = await makeApp();
    const pr = await seedPr();
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.generating).toBe(false);
    expect(body.stale).toBe(false);
    expect(body.brief.model).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
    const row = await storedJson(pr.id);
    expect(row!.head_sha).toBe(pr.headSha);
    expect(row!.inputs.changed_files).toEqual(['src/service.ts']);

    const again = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(again.statusCode).toBe(200);
    expect(llm.structured).toBe(2);
    expect(again.json().brief.generated_at >= body.brief.generated_at).toBe(true);
    expect(await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id))).toHaveLength(1);
    await app.close();
  });

  it('drops fabricated paths from the stored and served brief (AC-46)', async () => {
    const { app } = await makeApp();
    const pr = await seedPr();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(res.body).not.toContain('fabricated');
    const b = res.json().brief;
    expect(b.risks.risks.map((r: { title: string }) => r.title)).toEqual(['Real risk']);
    expect(b.review_focus).toHaveLength(1);
    await app.close();
  });

  it('GET makes 0 LLM and 0 GitHub calls even with a stored brief (AC-48)', async () => {
    const { github, calls } = countingGithub();
    const { app, llm } = await makeApp(new FlexLLM(), github);
    const pr = await seedPr();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    const llmBefore = llm.structured;
    const ghBefore = calls.length;
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
      expect(res.statusCode).toBe(200);
    }
    expect(llm.structured).toBe(llmBefore);
    expect(calls.length).toBe(ghBefore);
    await app.close();
  });

  it('flags the brief stale when the stored head moves, without a model call (AC-50)', async () => {
    const { app, llm } = await makeApp();
    const pr = await seedPr();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    const calls = llm.structured;
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'b'.repeat(40) }).where(eq(t.pullRequests.id, pr.id));
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(res.json()).toMatchObject({ stale: true, current_head_sha: 'b'.repeat(40) });
    expect(res.json().brief.head_sha).toBe(pr.headSha);
    expect(llm.structured).toBe(calls);
    await app.close();
  });

  it('PR detail refresh with a new GitHub head makes the brief stale (AC-51 chain)', async () => {
    const { app } = await makeApp(new FlexLLM(), new MockGitHubClient({ detail: { head_sha: 'c'.repeat(40) } }));
    const pr = await seedPr();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json().stale).toBe(false);
    const detail = await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    expect(detail.statusCode).toBe(200);
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(res.json()).toMatchObject({ stale: true, current_head_sha: 'c'.repeat(40) });
    await app.close();
  });

  it('serves brief: null for a malformed stored row (AC-52)', async () => {
    const { app } = await makeApp();
    const pr = await seedPr();
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, json: { bogus: true } });
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json().brief).toBeNull();
    await app.close();
  });

  it('keeps the old brief when a regeneration fails and leaks no raw output (AC-53, AC-59)', async () => {
    const { app, llm } = await makeApp();
    const pr = await seedPr();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    const before = await storedJson(pr.id);
    llm.fail = true;
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('brief_model_failed');
    expect(res.body).not.toContain('RAW_MODEL_TEXT');
    expect(res.body).not.toContain('raw');
    expect(await storedJson(pr.id)).toEqual(before);
    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(get.json().brief).not.toBeNull();
    expect(get.json().generating).toBe(false);
    await app.close();
  });

  it('404s a PR from another workspace on GET and POST with no model call (AC-56)', async () => {
    const { app, llm } = await makeApp();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const pr = await seedPr(other!.id);
    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(get.statusCode).toBe(404);
    expect(post.statusCode).toBe(404);
    expect(llm.structured).toBe(0);
    await app.close();
  });
});
