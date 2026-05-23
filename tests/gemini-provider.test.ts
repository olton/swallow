import { describe, expect, it, vi } from 'vitest';

import { GeminiProvider } from '../src/providers/gemini';

describe('GeminiProvider', () => {
  it('maps non-stream response with function calls', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  { text: 'Checking weather... ' },
                  {
                    functionCall: {
                      name: 'get_weather',
                      args: { city: 'Kyiv' },
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const provider = new GeminiProvider({
      apiKey: 'gemini-key',
      fetchFn,
    });

    const response = await provider.chat({
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'weather in Kyiv?' }],
      tools: [{ name: 'get_weather' }],
    });

    expect(response.content).toContain('Checking weather');
    expect(response.toolCalls?.[0]?.name).toBe('get_weather');
  });

  it('parses streaming chunks', async () => {
    const payload = [
      '{"candidates":[{"content":{"parts":[{"text":"hel"}]}}]}',
      '{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"lo"}]}}]}',
      '',
    ].join('\n');

    const fetchFn = vi.fn(async () =>
      new Response(payload, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const provider = new GeminiProvider({ fetchFn });
    let text = '';
    let done = false;

    for await (const chunk of provider.chatStream({
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      text += chunk.delta;
      if (chunk.done) {
        done = true;
      }
    }

    expect(text).toBe('hello');
    expect(done).toBe(true);
  });
});
