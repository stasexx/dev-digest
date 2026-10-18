import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { loadConfig } from '../src/platform/config.js';

vi.mock('../src/modules/brief/service.js', () => ({
  BriefService: class {
    async get() {
      return { brief: { bogus: true }, stale: 'x' };
    }
    async generate() {
      return { brief: { bogus: true }, stale: 'x' };
    }
  },
}));
vi.mock('../src/modules/_shared/context.js', () => ({
  getContext: async () => ({ workspaceId: 'ws', userId: 'u' }),
}));

describe('brief routes', () => {
  it('declares the POST rate limit (AC-60)', async () => {
    const { default: briefRoutes } = await import('../src/modules/brief/routes.js');
    const seen: Array<{ method: unknown; url: string; config: unknown }> = [];
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.addHook('onRoute', (r) => seen.push({ method: r.method, url: r.url, config: r.config }));
    app.decorate('container', {} as never);
    await app.register(briefRoutes);
    await app.ready();
    const post = seen.find((r) => r.method === 'POST' && r.url === '/pulls/:id/brief');
    expect(post).toBeTruthy();
    expect((post!.config as { rateLimit: unknown }).rateLimit).toEqual({ max: 10, timeWindow: '1 minute' });
    const get = seen.find((r) => r.method === 'GET' && r.url === '/pulls/:id/brief');
    expect(get).toBeTruthy();
    expect((get!.config as { rateLimit?: unknown } | undefined)?.rateLimit).toBeUndefined();
    await app.close();
  });

  it('turns a response-contract mismatch into a generic 500 without leaking the body (AC-62)', async () => {
    const { buildApp } = await import('../src/app.js');
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({ config, db: {} as never });
    const res = await app.inject({ method: 'GET', url: '/pulls/11111111-1111-4111-8111-111111111111/brief' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('internal_error');
    expect(res.body).not.toContain('bogus');
    await app.close();
  });
});
