import { describe, expect, it, vi } from 'vitest';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { SmartDiffService } from './service.js';

const FILES = [
  { path: 'server/src/x/service.ts', additions: 5, deletions: 1 },
  { path: 'server/test/x.test.ts', additions: 3, deletions: 0 },
  { path: 'pnpm-lock.yaml', additions: 9, deletions: 9 },
];

const finding = (file: string, startLine: number) => ({ file, startLine });
const review = (createdAt: string) => ({ agentId: 'A', kind: 'review', createdAt: new Date(createdAt) });

/**
 * A container that exposes ONLY `reviewRepo`; touching anything else (llm,
 * github, git, ...) throws, which proves the smart-diff path makes no LLM call.
 */
function fakeContainer(opts: { pull?: unknown; reviews?: unknown[] }) {
  const touched: string[] = [];
  const reviewRepo = {
    getPull: vi.fn(async () => opts.pull),
    getPrFiles: vi.fn(async () => FILES),
    reviewsForPull: vi.fn(async () => opts.reviews ?? []),
  };
  const container = new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      if (prop === 'reviewRepo') return reviewRepo;
      touched.push(String(prop));
      throw new Error(`forbidden container access: ${String(prop)}`);
    },
  }) as unknown as Container;
  return { container, touched };
}

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

describe('SmartDiffService.forPull', () => {
  it('(a) missing PR -> NotFoundError', async () => {
    const { container } = fakeContainer({ pull: undefined });
    await expect(new SmartDiffService(container).forPull('ws', 'pr')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('(b) no reviews -> groups present, every finding_lines empty', async () => {
    const { container } = fakeContainer({ pull: { id: 'pr' } });
    const d = await new SmartDiffService(container).forPull('ws', 'pr');
    expect(d.groups.map((g) => g.role)).toEqual(['core', 'tests', 'boilerplate']);
    expect(d.groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(true);
  });

  it('(c) two reviews of one agent -> only the newest review lines', async () => {
    const { container } = fakeContainer({
      pull: { id: 'pr' },
      reviews: [
        { review: review('2026-01-02'), findings: [finding('server/src/x/service.ts', 10)] },
        { review: review('2026-01-01'), findings: [finding('server/src/x/service.ts', 5)] },
      ],
    });
    const d = await new SmartDiffService(container).forPull('ws', 'pr');
    expect(d.groups[0]!.files[0]!.finding_lines).toEqual([10]);
  });

  it('(d) never touches llm / github / git (no LLM call)', async () => {
    const { container, touched } = fakeContainer({ pull: { id: 'pr' } });
    await new SmartDiffService(container).forPull('ws', 'pr');
    expect(touched).toEqual([]);
  });

  it('(e) logs exactly one info line mentioning "no LLM call"', async () => {
    const { container } = fakeContainer({ pull: { id: 'pr' } });
    const log = logger();
    await new SmartDiffService(container, log).forPull('ws', 'pr');
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(String(log.info.mock.calls[0]![1])).toContain('no LLM call');
  });
});
