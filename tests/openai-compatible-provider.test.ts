import { describe, expect, it, vi } from 'vitest';

import { OpenAiCompatibleProvider } from '../src/providers/openai-compatible';

describe('OpenAiCompatibleProvider', () => {
  it('maps non-stream response with tool calls', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: 'gpt-test',
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'lookup',
                      arguments: '{"id":123}',
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

    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://example.test/v1',
      fetchFn,
    });

    const response = await provider.chat({
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ name: 'lookup' }],
    });

    expect(response.finishReason).toBe('tool_calls');
    expect(response.toolCalls?.[0]?.name).toBe('lookup');
  });

  it('parses stream SSE chunks', async () => {
    const payload = [
      'data: {"model":"gpt-test","choices":[{"delta":{"content":"he"},"finish_reason":null}]}',
      'data: {"model":"gpt-test","choices":[{"delta":{"content":"llo"},"finish_reason":"stop"}]}',
      'data: [DONE]',
      '',
    ].join('\n');

    const fetchFn = vi.fn(async () =>
      new Response(payload, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    );

    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://example.test/v1',
      fetchFn,
    });

    const chunks: string[] = [];
    let sawDone = false;

    for await (const chunk of provider.chatStream({
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      chunks.push(chunk.delta);
      if (chunk.done) {
        sawDone = true;
      }
    }

    expect(chunks.join('')).toBe('hello');
    expect(sawDone).toBe(true);
  });

  it('retries failed requests and supports middleware', async () => {
    const calls: Array<HeadersInit | undefined> = [];

    const fetchFn = vi
      .fn()
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        calls.push(init?.headers);
        return new Response('temporary', { status: 500, statusText: 'Internal Server Error' });
      })
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        calls.push(init?.headers);
        return new Response(
          JSON.stringify({
            model: 'gpt-test',
            choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://example.test/v1',
      fetchFn,
      retry: {
        maxAttempts: 2,
        baseDelayMs: 0,
      },
      middlewares: [
        async (context, next) => {
          context.init = {
            ...context.init,
            headers: {
              ...(context.init.headers as Record<string, string>),
              'x-mw': 'on',
            },
          };
          return next(context);
        },
      ],
    });

    const response = await provider.chat({
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(response.content).toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const lastHeaders = calls.at(-1);
    expect(String((lastHeaders as Record<string, string>)['x-mw'])).toBe('on');
  });
});
