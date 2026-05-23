import { describe, expect, it, vi } from 'vitest';

import { OpenAiProvider } from '../src/providers/openai';

describe('OpenAiProvider', () => {
  it('uses native OpenAI profile and parses response', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: 'gpt-5-mini',
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const provider = new OpenAiProvider({
      apiKey: 'test-key',
      fetchFn,
    });

    const response = await provider.chat({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(provider.id).toBe('openai');
    expect(response.content).toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
