import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { ApiError, type DevDigestClient } from '../http/client.js';
import { compactBlast } from '../core/blast.js';
import { registerGetBlastRadius } from './get-blast-radius.js';

function resp(over: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    changed_symbols: [
      { name: 'f', file: 'a.ts', kind: 'function' },
      { name: 'g', file: 'a.ts', kind: 'function' },
    ],
    downstream: [
      {
        symbol: 'f',
        rank: 1,
        callers: [{ name: 'h', file: 'b.ts', line: 3, rank: 1 }],
        endpoints_affected: ['GET /f'],
        crons_affected: [],
      },
    ],
    summary: '2 changed symbol(s), 1 with callers.',
    stats: { symbols: 2, callers: 1, endpoints: 1, crons: 0 },
    impacted_endpoints: ['GET /f'],
    facts_by_file: {},
    degraded: false,
    reason: null,
    index_status: 'full',
    commit_sha: 'abc',
    limits: { max_callers_per_symbol: 20, bfs_depth: 2 },
    truncated: false,
    ...over,
  };
}

async function setup(opts: {
  resolve?: (typeof import('../core/resolve.js'))['resolvePullId'];
  blast: () => Promise<BlastRadiusResponse>;
}) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  const client = { getBlastRadius: opts.blast } as unknown as DevDigestClient;
  const resolvePullId: (typeof import('../core/resolve.js'))['resolvePullId'] =
    opts.resolve ?? (async () => ({ repoId: 'r1', pullId: 'p1' }));
  registerGetBlastRadius(server, client, { resolvePullId, compactBlast });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: 'c', version: '0.0.0' });
  await Promise.all([server.connect(st), mcp.connect(ct)]);
  return mcp;
}

async function call(mcp: Client, args: Record<string, unknown>) {
  const r = (await mcp.callTool({ name: 'devdigest_get_blast_radius', arguments: args })) as {
    isError?: boolean;
    content: { type: string; text: string }[];
  };
  return { isError: r.isError === true, text: r.content[0]?.text ?? '' };
}

test('tools/list exposes readOnly tool with required repo and pr', async () => {
  const mcp = await setup({ blast: async () => resp() });
  const { tools } = await mcp.listTools();
  const t = tools.find((x) => x.name === 'devdigest_get_blast_radius');
  assert.ok(t);
  assert.equal(t.annotations?.readOnlyHint, true);
  assert.deepEqual([...(t.inputSchema.required ?? [])].sort(), ['pr', 'repo']);
});

test('happy path returns compact JSON', async () => {
  const mcp = await setup({ blast: async () => resp() });
  const r = await call(mcp, { repo: 'o/r', pr: 6 });
  assert.equal(r.isError, false);
  const body = JSON.parse(r.text);
  assert.equal(body.symbols[0].callers[0], 'b.ts:3 (h)');
  assert.deepEqual(body.without_callers, ['g']);
  assert.equal('hint' in body, false);
});

test('unknown PR (resolver error) -> isError with not found', async () => {
  const mcp = await setup({
    resolve: async () => ({ error: "PR #999 not found in 'o/r'. Open PRs: #4, #6." }),
    blast: async () => resp(),
  });
  const r = await call(mcp, { repo: 'o/r', pr: 999 });
  assert.equal(r.isError, true);
  assert.match(r.text, /not found/);
});

test('route 404 -> isError', async () => {
  const mcp = await setup({
    blast: async () => {
      throw new ApiError(404, 'http://x/pulls/p1/blast', 'nope');
    },
  });
  const r = await call(mcp, { repo: 'o/r', pr: 6 });
  assert.equal(r.isError, true);
  assert.match(r.text, /not found/);
});

test('network failure -> isError mentioning ./scripts/dev.sh', async () => {
  const mcp = await setup({
    blast: async () => {
      throw new ApiError(0, 'http://localhost:3001/pulls/p1/blast', 'down');
    },
  });
  const r = await call(mcp, { repo: 'o/r', pr: 6 });
  assert.equal(r.isError, true);
  assert.match(r.text, /\.\/scripts\/dev\.sh/);
});

test('other HTTP error -> isError with status', async () => {
  const mcp = await setup({
    blast: async () => {
      throw new ApiError(500, 'u', 'boom');
    },
  });
  const r = await call(mcp, { repo: 'o/r', pr: 6 });
  assert.equal(r.isError, true);
  assert.match(r.text, /error 500/);
});

test('degraded response is not an error and carries hint', async () => {
  const mcp = await setup({
    blast: async () => resp({ degraded: true, reason: 'index_failed', index_status: 'failed' }),
  });
  const r = await call(mcp, { repo: 'o/r', pr: 6 });
  assert.equal(r.isError, false);
  assert.match(JSON.parse(r.text).hint, /may be incomplete/);
});
