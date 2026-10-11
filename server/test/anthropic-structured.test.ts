import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { AnthropicProvider } from '../src/adapters/llm/anthropic.js';

type Captured = { messages: Array<{ role: string; content: unknown }> };

/** Provider whose SDK client returns `responses` in order and records each request. */
function providerWith(responses: unknown[]) {
  const provider = new AnthropicProvider('test-key');
  const calls: Captured[] = [];
  (provider as unknown as { client: unknown }).client = {
    messages: {
      create: async (params: Captured) => {
        // Snapshot: the adapter keeps pushing into the same messages array.
        calls.push(structuredClone(params));
        return responses[calls.length - 1];
      },
    },
  };
  return { provider, calls };
}

const toolTurn = (id: string, input: unknown) => ({
  content: [{ type: 'tool_use', id, name: 'Answer', input }],
  usage: { input_tokens: 10, output_tokens: 5 },
});

describe('AnthropicProvider.completeStructured repair loop', () => {
  it('answers a schema-invalid tool_use with a tool_result, then accepts the retry', async () => {
    const { provider, calls } = providerWith([
      toolTurn('toolu_1', { score: 'high' }),
      toolTurn('toolu_2', { score: 7 }),
    ]);

    const res = await provider.completeStructured({
      model: 'claude-haiku-4-5-20251001',
      schema: z.object({ score: z.number() }),
      schemaName: 'Answer',
      messages: [{ role: 'user', content: 'rate it' }],
    });

    expect(res.data).toEqual({ score: 7 });
    expect(res.attempts).toBe(2);
    const retry = calls[1]!.messages;
    expect(retry.at(-2)!.role).toBe('assistant');
    const reply = retry.at(-1)!;
    expect(reply.role).toBe('user');
    expect(reply.content).toEqual([
      expect.objectContaining({ type: 'tool_result', tool_use_id: 'toolu_1', is_error: true }),
    ]);
  });
});
