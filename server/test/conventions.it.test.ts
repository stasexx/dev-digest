/**
 * Conventions Extractor — routes end to end against real Postgres, with a mocked
 * model and a temp "clone" on disk: evidence check, persistence, reject that
 * survives a rescan, and accepted → `repo-conventions` skill linked to an agent.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { ConventionCandidate, ConventionScanResult, Skill } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const EXTRACTION = {
  candidates: [
    { category: 'Async', rule: 'Use async/await, never .then() chains.', evidence: { file: 'src/users.ts', line: 2 }, confidence: 0.9 },
    { category: 'naming', rule: 'Name React hooks useThing.', evidence: { file: 'src/users.ts', line: 1 }, confidence: 0.7 },
    // Dropped by the code-level evidence check:
    { category: 'naming', rule: 'Hallucinated file.', evidence: { file: 'src/nope.ts', line: 1 }, confidence: 0.99 },
    { category: 'naming', rule: 'Line past EOF.', evidence: { file: 'src/users.ts', line: 400 }, confidence: 0.99 },
    { category: 'naming', rule: 'Escapes the clone.', evidence: { file: '../outside.ts', line: 1 }, confidence: 0.99 },
  ],
};

d('conventions routes', () => {
  let pg: PgFixture;
  let clone: string;
  let repoId: string;
  let agentId: string;
  let llm: MockLLMProvider;

  beforeAll(async () => {
    pg = await startPg();
    const { workspaceId } = await seed(pg.handle.db);
    clone = await mkdtemp(join(tmpdir(), 'dd-conv-'));
    await mkdir(join(clone, 'src'));
    await writeFile(join(clone, 'src/users.ts'), 'export function useUsers() {\n  const rows = await load();\n}\n');
    await writeFile(join(clone, 'tsconfig.json'), '{ "compilerOptions": { "strict": true } }\n');
    await writeFile(join(tmpdir(), 'outside.ts'), 'secret\n');
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'conv', fullName: 'acme/conv', clonePath: clone })
      .returning();
    repoId = repo!.id;
    const [agent] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
    agentId = agent!.id;
  });
  afterAll(async () => {
    await pg?.stop();
    await rm(clone, { recursive: true, force: true });
  });

  async function app() {
    llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: EXTRACTION } });
    const repoIntel = { getConventionSamples: async () => ['src/users.ts'] } as unknown as RepoIntel;
    return buildApp({ config: config(), db: pg.handle.db, overrides: { llm: { openai: llm }, repoIntel } });
  }

  it('extract: samples picked in code, unverifiable evidence dropped, result persisted', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const scan = res.json() as ConventionScanResult;
    expect(scan.sampled_files).toEqual(['tsconfig.json', 'src/users.ts']);
    expect(scan.proposed).toBe(5);
    expect(scan.dropped_unverified).toBe(3);
    expect(scan.candidates.map((c) => c.rule)).toEqual([
      'Use async/await, never .then() chains.',
      'Name React hooks useThing.',
    ]);
    // Snippet comes from the file, not the model; category is normalised.
    expect(scan.candidates[0]).toMatchObject({
      category: 'async',
      evidence_path: 'src/users.ts',
      evidence_line: 2,
      evidence_snippet: 'const rows = await load();',
      status: 'pending',
    });
    expect(llm.calls).toHaveLength(1); // one model call; sampling made none

    const listed = await a.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect((listed.json() as ConventionCandidate[]).length).toBe(2);
  });

  it('reject is persistent: hidden from the list and not resurrected by a rescan', async () => {
    const a = await app();
    const list = (await a.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as ConventionCandidate[];
    const hooks = list.find((c) => c.rule.startsWith('Name React hooks'))!;
    const rejected = await a.inject({ method: 'PATCH', url: `/conventions/${hooks.id}`, payload: { status: 'rejected' } });
    expect(rejected.statusCode).toBe(200);

    const rescan = (await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).json() as ConventionScanResult;
    expect(rescan.dropped_known).toBe(1);
    expect(rescan.candidates.map((c) => c.rule)).toEqual(['Use async/await, never .then() chains.']);
  });

  it('edit + accept → repo-conventions skill linked to the agent, rejected rule excluded', async () => {
    const a = await app();
    const [c] = (await a.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as ConventionCandidate[];

    const none = await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: { name: 'repo-conventions' } });
    expect(none.statusCode).toBe(422); // nothing accepted yet

    await a.inject({ method: 'PATCH', url: `/conventions/${c!.id}`, payload: { rule: 'Always use async/await.', status: 'accepted' } });
    const created = await a.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { name: 'repo-conventions', agent_id: agentId },
    });
    expect(created.statusCode).toBe(200);
    const skill = created.json() as Skill;
    expect(skill).toMatchObject({ name: 'repo-conventions', type: 'convention', source: 'extracted', enabled: true });
    expect(skill.body).toContain('Always use async/await.');
    expect(skill.body).not.toContain('useThing');

    const before = await pg.handle.db.select().from(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
    expect(before.some((l) => l.skillId === skill.id)).toBe(true);

    // Re-creating updates the same skill (new version) and keeps a single link.
    const again = await a.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { name: 'repo-conventions', body: '# Edited by hand\n- rule', agent_id: agentId },
    });
    const updated = again.json() as Skill;
    expect(updated.id).toBe(skill.id);
    expect(updated.version).toBe(skill.version + 1);
    const after = await pg.handle.db.select().from(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
    expect(after.length).toBe(before.length);
  });
});
