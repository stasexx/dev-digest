import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BriefModelOutput, PrBriefRecord } from '@devdigest/shared';
import type { StructuredRequest, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { AppError, ConfigError, ExternalServiceError, NotFoundError } from '../src/platform/errors.js';
import { TimeoutError } from '../src/platform/resilience.js';
import { BriefService } from '../src/modules/brief/service.js';
import type { BriefRepository } from '../src/modules/brief/repository.js';
import { isGenerating } from '../src/modules/brief/in-flight.js';
import type { BlastResult, IndexState } from '../src/modules/repo-intel/types.js';

let feature = { provider: 'anthropic', model: 'fixture-model' };
vi.mock('../src/modules/settings/feature-models.js', () => ({
  resolveFeatureModel: vi.fn(async () => feature),
}));

const ROW_A = [
  { path: 'src/service.ts', additions: 5, deletions: 1, patch: '@@ -1,3 +1,4 @@ function HEADERCTX_SENTINEL() {\n a\n+PATCHBODY_SENTINEL\n b\n c' },
  { path: 'src/service.test.ts', additions: 2, deletions: 0, patch: null as string | null },
];
const ROW_B = [{ path: 'src/other.ts', additions: 1, deletions: 0, patch: null as string | null }];

const STATE: IndexState = {
  repoId: 'repo1', status: 'full', filesIndexed: 1, filesSkipped: 0, durationMs: 1,
  lastIndexedSha: 'c1', indexerVersion: 2, updatedAt: new Date(0),
};
const BLAST: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [], factsByFile: {} };

const PR_ID = '11111111-1111-4111-8111-111111111111';
const OUTPUT = {
  summary: 'Adds retry to the service.',
  risks: [
    { kind: 'api_contract', title: 'Changed signature', explanation: 'x', severity: 'high', file_refs: ['src/service.ts:2', 'fabricated/nope.ts'] },
    { kind: 'other', title: 'Invented', explanation: 'y', severity: 'low', file_refs: ['ghost.ts'] },
  ],
  review_focus: [
    { file: 'src/service.ts', line: 2, reason: 'retry loop' },
    { file: 'ghost.ts', line: 1, reason: 'invented' },
  ],
};

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await fs.rm(tmpDirs.pop()!, { recursive: true, force: true });
});
beforeEach(() => {
  feature = { provider: 'anthropic', model: 'fixture-model' };
});

class ScriptedLLM extends MockLLMProvider {
  constructor(private script: (req: StructuredRequest<unknown>) => Promise<Partial<StructuredResult<unknown>>>) {
    super('anthropic');
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    const out = await this.script(req as StructuredRequest<unknown>);
    return {
      data: BriefModelOutput.parse(OUTPUT) as T,
      model: req.model, tokensIn: 100, tokensOut: 50, costUsd: 0.001, raw: '{}', attempts: 1,
      ...out,
    } as StructuredResult<T>;
  }
}

interface Opts {
  llm?: MockLLMProvider;
  /** Sequence of head SHAs returned by successive getPull calls (last repeats). */
  heads?: string[];
  /** Sequence of pr_files rows returned by successive reads (last repeats). */
  rows?: Array<typeof ROW_A>;
  body?: string | null;
  title?: string;
  intent?: unknown;
  agents?: unknown[];
  cloneRoot?: string;
  llmThrows?: Error;
  existing?: unknown;
}

function setup(o: Opts = {}) {
  const llm = o.llm ?? new MockLLMProvider('anthropic', { structured: OUTPUT });
  const heads = o.heads ?? ['aaa'];
  const rowSeq = o.rows ?? [ROW_A];
  let pullN = 0;
  let rowN = 0;
  const getPull = vi.fn(async () => {
    const headSha = heads[Math.min(pullN++, heads.length - 1)]!;
    return {
      id: PR_ID, repoId: 'repo1', number: 7, title: o.title ?? 'Add retry', body: o.body === undefined ? 'Adds retry.' : o.body,
      headSha, additions: 7, deletions: 1, filesCount: 2,
    };
  });
  const getPrFiles = vi.fn(async () => rowSeq[Math.min(rowN++, rowSeq.length - 1)]!);
  const reviewRepo = {
    getPull,
    getPrFiles,
    getRepo: vi.fn(async () => ({ id: 'repo1', owner: 'o', name: 'n', fullName: 'o/n', clonePath: o.cloneRoot ?? null })),
    getIntent: vi.fn(async () => o.intent),
    reviewsForPull: vi.fn(async () => []),
  };
  const container = {
    reviewRepo,
    db: {},
    repoIntel: { getBlastRadius: vi.fn(async () => BLAST), getIndexState: vi.fn(async () => STATE) },
    github: async () => ({ getIssue: vi.fn() }),
    agentsRepo: { listEnabled: vi.fn(async () => o.agents ?? []), linkedSkills: vi.fn(async () => []) },
    git: { clonePathFor: () => o.cloneRoot ?? '/nonexistent' },
    llm: vi.fn(async () => {
      if (o.llmThrows) throw o.llmThrows;
      return llm;
    }),
  };
  let stored: unknown = o.existing ?? null;
  const upsert = vi.fn(async (_id: string, rec: unknown) => {
    stored = JSON.parse(JSON.stringify(rec));
  });
  const repo = { getJson: vi.fn(async () => stored), upsert } as unknown as BriefRepository;
  const logs: Array<{ level: string; obj: Record<string, unknown>; msg?: string }> = [];
  const mk = (level: string) => (obj: unknown, msg?: string) => {
    logs.push({ level, obj: obj as Record<string, unknown>, msg });
  };
  const logger = { info: mk('info'), warn: mk('warn'), error: mk('error'), debug: mk('debug') };
  const svc = new BriefService(container as never, logger, repo);
  const structuredCalls = () => llm.calls.filter((c) => c.method === 'completeStructured');
  const modelEntries = () => logs.filter((l) => l.msg === 'brief: model call');
  return { svc, llm, container, reviewRepo, upsert, logs, structuredCalls, modelEntries, getStored: () => stored };
}

const userText = (s: ReturnType<typeof setup>) =>
  JSON.stringify((s.structuredCalls()[0]!.req as StructuredRequest<unknown>).messages);

describe('BriefService.generate', () => {
  it('makes exactly one structured call, grounds refs and stores a SHA-bound record', async () => {
    const s = setup();
    const res = await s.svc.generate('ws', PR_ID);
    expect(s.structuredCalls()).toHaveLength(1);
    expect(s.llm.calls.filter((c) => c.method === 'embed' || c.method === 'complete')).toHaveLength(0);
    expect(res.generating).toBe(false);
    expect(res.stale).toBe(false);
    const b = res.brief!;
    expect(PrBriefRecord.safeParse(b).success).toBe(true);
    expect(b.head_sha).toBe('aaa');
    expect(b.risks.risks.map((r) => r.title)).toEqual(['Changed signature']);
    expect(b.risks.risks[0]!.file_refs).toEqual(['src/service.ts:2']);
    expect(b.review_focus).toEqual([{ file: 'src/service.ts', line: 2, reason: 'retry loop' }]);
    expect(JSON.stringify(b)).not.toContain('ghost.ts');
    expect(b.inputs.changed_files).toEqual(['src/service.ts', 'src/service.test.ts']);
    expect(s.upsert).toHaveBeenCalledTimes(1);
  });

  it('uses the risk_brief override provider and model (AC-39)', async () => {
    feature = { provider: 'anthropic', model: 'override-model' };
    const s = setup();
    const res = await s.svc.generate('ws', PR_ID);
    expect(s.container.llm).toHaveBeenCalledWith('anthropic');
    expect((s.structuredCalls()[0]!.req as { model: string }).model).toBe('override-model');
    expect(res.brief!.model).toEqual({ provider: 'anthropic', model: 'override-model' });
  });

  it('passes repair bounds and stores provider-reported attempts/tokens (I-1)', async () => {
    const llm = new ScriptedLLM(async () => ({ attempts: 3, tokensIn: 19000, tokensOut: 900 }));
    const s = setup({ llm });
    const res = await s.svc.generate('ws', PR_ID);
    const req = s.structuredCalls()[0]!.req as StructuredRequest<unknown>;
    expect(req.maxRetries).toBe(2);
    expect(req.maxTokens).toBe(4096);
    expect(req).not.toHaveProperty('temperature');
    const g = res.brief!.generation;
    expect(g.attempts).toBe(3);
    expect(g.tokens_in).toBe(19000);
    expect(g.input_tokens_estimate).toBeLessThanOrEqual(8000);
  });

  it('works with no stored intent and with all inputs missing', async () => {
    const s = setup({ intent: undefined, body: null });
    const res = await s.svc.generate('ws', PR_ID);
    expect(s.structuredCalls()).toHaveLength(1);
    expect(res.brief!.intent).toBeNull();
    expect(res.brief!.missing_inputs.map((m) => m.input)).toContain('intent');
    expect(userText(s)).toContain('## Missing inputs');
  });

  it('keeps patch bodies and unattached files out of the prompt, includes attached specs', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'brief-svc-'));
    tmpDirs.push(dir);
    await fs.mkdir(path.join(dir, 'docs'), { recursive: true });
    await fs.writeFile(path.join(dir, 'docs/spec.md'), 'ATTACHED_SPEC_TEXT');
    await fs.writeFile(path.join(dir, 'docs/secret.md'), 'UNATTACHED_SENTINEL');
    const s = setup({
      cloneRoot: dir,
      agents: [{ id: 'a1', createdAt: new Date(0), attachedDocPaths: ['docs/spec.md'] }],
    });
    await s.svc.generate('ws', PR_ID);
    const text = userText(s);
    expect(text).toContain('ATTACHED_SPEC_TEXT');
    for (const sentinel of ['PATCHBODY_SENTINEL', 'HEADERCTX_SENTINEL', 'UNATTACHED_SENTINEL']) {
      expect(text).not.toContain(sentinel);
    }
  });

  it('emits exactly one model-call entry with the contract fields and never logs prompt text', async () => {
    const s = setup();
    await s.svc.generate('ws', PR_ID);
    const entries = s.modelEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.level).toBe('info');
    expect(entries[0]!.obj).toMatchObject({
      outcome: 'ok', prId: PR_ID, headSha: 'aaa', provider: 'anthropic', model: 'fixture-model',
      inputBudgetTokens: 8000, maxRetries: 2, attempts: 1, tokensIn: 100, tokensOut: 50, costUsd: 0.001,
      specs: { read: 0, missing: 0, truncated: 0, omitted: 0 },
    });
    expect(entries[0]!.obj).toHaveProperty('durationMs');
    expect(entries[0]!.obj).toHaveProperty('truncatedSections');
    expect(entries[0]!.obj).toHaveProperty('removedSections');
    const done = s.logs.filter((l) => l.msg === 'brief: generated');
    expect(done).toHaveLength(1);
    expect(done[0]!.obj).toHaveProperty('assemblyMs');
    const systemMsg = (s.structuredCalls()[0]!.req as StructuredRequest<unknown>).messages[0]!.content as string;
    const loud = JSON.stringify(s.logs.filter((l) => l.level !== 'debug'));
    expect(loud).not.toContain(systemMsg.slice(0, 80));
    expect(loud).not.toContain('raw');
    expect(loud).not.toContain('Adds retry.');
  });

  it('maps invalid model output to brief_model_failed without details or raw', async () => {
    const llm = new ScriptedLLM(async () => {
      throw new ExternalServiceError('Anthropic structured output failed schema validation', { raw: 'RAW_MODEL_TEXT' });
    });
    const s = setup({ llm });
    const err = await s.svc.generate('ws', PR_ID).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('brief_model_failed');
    expect(err.statusCode).toBe(502);
    expect(err.details).toBeUndefined();
    expect(s.upsert).not.toHaveBeenCalled();
    const entries = s.modelEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.obj).toMatchObject({ outcome: 'error', errorCategory: 'invalid_output' });
    expect(JSON.stringify(s.logs)).not.toContain('RAW_MODEL_TEXT');
    expect(isGenerating(PR_ID)).toBe(false);
  });

  it('categorises timeouts', async () => {
    const llm = new ScriptedLLM(async () => {
      throw new TimeoutError(1000);
    });
    const s = setup({ llm });
    await expect(s.svc.generate('ws', PR_ID)).rejects.toMatchObject({ code: 'brief_model_failed' });
    expect(s.modelEntries()).toHaveLength(1);
    expect(s.modelEntries()[0]!.obj).toMatchObject({ outcome: 'error', errorCategory: 'timeout' });
  });

  it('reassembles once when the head moved during assembly', async () => {
    const s = setup({ heads: ['aaa', 'aaa', 'bbb'] });
    const res = await s.svc.generate('ws', PR_ID);
    expect(s.container.reviewRepo.getRepo).toHaveBeenCalledTimes(2);
    expect(s.structuredCalls()).toHaveLength(1);
    expect(res.brief!.head_sha).toBe('bbb');
  });

  it('reassembles exactly once when the files fingerprint keeps changing', async () => {
    const s = setup({ rows: [ROW_A, ROW_B, ROW_A, ROW_B, ROW_A, ROW_B] });
    const res = await s.svc.generate('ws', PR_ID);
    expect(s.container.reviewRepo.getRepo).toHaveBeenCalledTimes(2);
    expect(s.structuredCalls()).toHaveLength(1);
    expect(res.brief!.head_sha).toBe('aaa');
  });

  it('returns generating=false after success and after failure', async () => {
    const ok = setup();
    expect((await ok.svc.generate('ws', PR_ID)).generating).toBe(false);
    expect(isGenerating(PR_ID)).toBe(false);
    const bad = setup({ llm: new ScriptedLLM(async () => { throw new Error('down'); }) });
    await expect(bad.svc.generate('ws', PR_ID)).rejects.toMatchObject({ code: 'brief_model_failed' });
    expect(isGenerating(PR_ID)).toBe(false);
  });

  it('refuses a fixed section over budget with 422, no call, no upsert', async () => {
    const s = setup({ title: 'T'.repeat(40_000) });
    await expect(s.svc.generate('ws', PR_ID)).rejects.toMatchObject({ code: 'brief_input_over_budget', statusCode: 422 });
    expect(s.structuredCalls()).toHaveLength(0);
    expect(s.upsert).not.toHaveBeenCalled();
    expect(s.modelEntries()).toHaveLength(0);
    expect(s.logs.find((l) => l.msg === 'brief: refused')!.obj).toMatchObject({ prId: PR_ID, code: 'brief_input_over_budget' });
  });

  it('maps a missing provider key to brief_model_not_configured', async () => {
    feature = { provider: 'openai', model: 'fixture-model' };
    const s = setup({ llmThrows: new ConfigError('OPENAI key missing') });
    const err = await s.svc.generate('ws', PR_ID).catch((e) => e);
    expect(err.code).toBe('brief_model_not_configured');
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('Risk Brief');
    expect(err.message).toContain('openai');
    expect(err.details).toEqual({ setting: 'risk_brief', provider: 'openai' });
    expect(s.structuredCalls()).toHaveLength(0);
    expect(s.upsert).not.toHaveBeenCalled();
    expect(s.modelEntries()).toHaveLength(0);
  });

  it('returns 409 for a concurrent generate and reports generating mid-flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const llm = new ScriptedLLM(async () => { await gate; return {}; });
    const s = setup({ llm });
    const first = s.svc.generate('ws', PR_ID);
    await vi.waitFor(() => expect(s.structuredCalls()).toHaveLength(1));
    await expect(s.svc.generate('ws', PR_ID)).rejects.toMatchObject({ code: 'brief_generation_in_progress', statusCode: 409 });
    expect((await s.svc.get('ws', PR_ID)).generating).toBe(true);
    release();
    await first;
    expect(s.structuredCalls()).toHaveLength(1);
    expect(isGenerating(PR_ID)).toBe(false);
  });

  it('404s an unknown PR before taking the lock', async () => {
    const s = setup();
    s.reviewRepo.getPull.mockResolvedValueOnce(undefined as never);
    await expect(s.svc.generate('ws', PR_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(s.structuredCalls()).toHaveLength(0);
    expect(isGenerating(PR_ID)).toBe(false);
  });
});

describe('BriefService.get', () => {
  it('touches nothing but reviewRepo and db (no LLM, GitHub or git)', async () => {
    const s = setup();
    const touched: string[] = [];
    const proxy = new Proxy(s.container, {
      get(t, p, r) {
        if (p === 'reviewRepo' || p === 'db') return Reflect.get(t, p, r);
        touched.push(String(p));
        throw new Error(`forbidden access: ${String(p)}`);
      },
    });
    const svc = new BriefService(proxy as never, undefined, { getJson: async () => null, upsert: vi.fn() } as never);
    const res = await svc.get('ws', PR_ID);
    expect(res).toEqual({ brief: null, stale: false, current_head_sha: 'aaa', generating: false });
    expect(touched).toEqual([]);
  });

  it('flags a brief generated for another head as stale', async () => {
    const s = setup({ heads: ['aaa'] });
    await s.svc.generate('ws', PR_ID);
    const moved = setup({ heads: ['zzz'], existing: s.getStored() });
    const res = await moved.svc.get('ws', PR_ID);
    expect(res.stale).toBe(true);
    expect(res.current_head_sha).toBe('zzz');
    expect(res.brief!.head_sha).toBe('aaa');
  });

  it('serves null for a malformed stored record and warns', async () => {
    const s = setup({ existing: { bogus: true } });
    const res = await s.svc.get('ws', PR_ID);
    expect(res.brief).toBeNull();
    expect(s.logs.some((l) => l.level === 'warn' && l.msg === 'brief: cached record invalid; serving none')).toBe(true);
  });
});
