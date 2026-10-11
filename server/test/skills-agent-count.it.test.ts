import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-agent-count] Docker not available — skipping integration tests.');
}

/**
 * List-card counters: `GET /skills` carries `agent_count` and `GET /agents`
 * carries `skill_count`, both derived from `agent_skills` with one grouped query.
 */
d('list counters over agent_skills', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  it('counts links per skill and per agent; unlinked entities report 0', async () => {
    const app = await makeApp();
    const mkSkill = async (name: string) =>
      (await app.inject({ method: 'POST', url: '/skills', payload: { name, body: '# rules' } })).json()
        .id as string;
    const mkAgent = async (name: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: { name, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
        })
      ).json().id as string;

    const [shared, single, unused] = [
      await mkSkill('cnt-shared'),
      await mkSkill('cnt-single'),
      await mkSkill('cnt-unused'),
    ];
    const [a1, a2, a3] = [await mkAgent('cnt-a1'), await mkAgent('cnt-a2'), await mkAgent('cnt-a3')];

    const link = (agentId: string, skill_ids: string[]) =>
      app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids } });
    expect((await link(a1, [shared, single])).statusCode).toBeLessThan(300);
    expect((await link(a2, [shared])).statusCode).toBeLessThan(300);

    const skills = (await app.inject({ method: 'GET', url: '/skills' })).json() as {
      id: string;
      agent_count: number;
    }[];
    const agentCount = (id: string) => skills.find((s) => s.id === id)?.agent_count;
    expect(agentCount(shared)).toBe(2);
    expect(agentCount(single)).toBe(1);
    expect(agentCount(unused)).toBe(0);

    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json() as {
      id: string;
      skill_count: number;
    }[];
    const skillCount = (id: string) => agents.find((a) => a.id === id)?.skill_count;
    expect(skillCount(a1)).toBe(2);
    expect(skillCount(a2)).toBe(1);
    expect(skillCount(a3)).toBe(0);

    await app.close();
  });
});
