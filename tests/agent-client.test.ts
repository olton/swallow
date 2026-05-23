import { describe, expect, it, vi } from 'vitest';

import { Agent } from '../src/agent/client';
import { OllamaProvider } from '../src/providers/ollama';
import type { LlmProvider } from '../src/types/types';

describe('AgentClient', () => {
  it('delegates calls to provider', async () => {
    const provider: LlmProvider = {
      id: 'mock',
      chat: vi.fn(async () => ({ model: 'm', content: 'ok', done: true })),
      chatStream: vi.fn(async function* () {
        yield { model: 'm', delta: 'o', done: false };
        yield { model: 'm', delta: 'k', done: true };
      }),
      embed: vi.fn(async () => ({ model: 'm', embeddings: [[0.1, 0.2]] })),
      listModels: vi.fn(async () => [{ name: 'm' }]),
    };

    const client = new Agent(provider);
    const chat = await client.chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    expect(chat.content).toBe('ok');

    const chunks: string[] = [];
    for await (const chunk of client.stream({ model: 'm', messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push(chunk.delta);
    }
    expect(chunks.join('')).toBe('ok');

    const embeddings = await client.embed({ model: 'm', input: 'hello' });
    expect(embeddings.embeddings).toHaveLength(1);

    const models = await client.listModels();
    expect(models[0]?.name).toBe('m');
  });

  it('executes tool-calling loop', async () => {
    const provider: LlmProvider = {
      id: 'mock',
      chat: vi
        .fn()
        .mockResolvedValueOnce({
          model: 'm',
          content: '',
          done: true,
          toolCalls: [
            {
              id: 'call_1',
              name: 'getWeather',
              argumentsJson: JSON.stringify({ city: 'Kyiv' }),
              type: 'function',
            },
          ],
        })
        .mockResolvedValueOnce({ model: 'm', content: 'Weather is sunny', done: true }),
      chatStream: vi.fn(async function* () {
        yield { model: 'm', delta: '', done: true };
      }),
      embed: vi.fn(async () => ({ model: 'm', embeddings: [] })),
      listModels: vi.fn(async () => [{ name: 'm' }]),
    };

    const client = new Agent(provider);

    const result = await client.runWithTools(
      {
        model: 'm',
        messages: [{ role: 'user', content: 'weather?' }],
        tools: [
          {
            name: 'getWeather',
            parameters: {
              type: 'object',
              properties: {
                city: { type: 'string' },
              },
            },
          },
        ],
      },
      {
        getWeather: async (args) => ({ ok: true, args }),
      }
    );

    expect(result.final.content).toBe('Weather is sunny');
    expect(result.toolExecutions).toHaveLength(1);
    expect(result.toolExecutions[0]?.name).toBe('getWeather');
    expect((provider.chat as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('validates tool arguments against JSON schema', async () => {
    const handler = vi.fn(async () => ({ ok: true }));

    const provider: LlmProvider = {
      id: 'mock',
      chat: vi.fn(async () => ({
        model: 'm',
        content: '',
        done: true,
        toolCalls: [
          {
            id: 'call_1',
            name: 'getWeather',
            argumentsJson: JSON.stringify({ city: 123 }),
            type: 'function' as const,
          },
        ],
      })),
      chatStream: vi.fn(async function* () {
        yield { model: 'm', delta: '', done: true };
      }),
      embed: vi.fn(async () => ({ model: 'm', embeddings: [] })),
      listModels: vi.fn(async () => [{ name: 'm' }]),
    };

    const client = new Agent(provider);

    await expect(
      client.runWithTools(
        {
          model: 'm',
          messages: [{ role: 'user', content: 'weather?' }],
          tools: [
            {
              name: 'getWeather',
              parameters: {
                type: 'object',
                properties: {
                  city: { type: 'string' },
                },
                required: ['city'],
                additionalProperties: false,
              },
            },
          ],
        },
        {
          getWeather: handler,
        }
      )
    ).rejects.toThrow(/JSON Schema validation/i);

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('OllamaProvider', () => {
  it('maps non-stream chat response', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: 'llama3',
          done: true,
          message: { role: 'assistant', content: 'pong' },
          done_reason: 'stop',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const provider = new OllamaProvider({ fetchFn });
    const response = await provider.chat({
      model: 'llama3',
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 16,
      topP: 0.9,
      temperature: 0.2,
      stop: ['END'],
    });

    expect(response.content).toBe('pong');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('parses stream response chunks', async () => {
    const payload = [
      JSON.stringify({ model: 'llama3', done: false, message: { role: 'assistant', content: 'he' } }),
      JSON.stringify({ model: 'llama3', done: true, message: { role: 'assistant', content: 'llo' } }),
      '',
    ].join('\n');

    const fetchFn = vi.fn(async () =>
      new Response(payload, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      })
    );

    const provider = new OllamaProvider({ fetchFn });

    const acc: string[] = [];
    for await (const chunk of provider.chatStream({
      model: 'llama3',
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      acc.push(chunk.delta);
    }

    expect(acc.join('')).toBe('hello');
  });

  it('normalizes single embedding request', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: 'nomic-embed-text',
          embeddings: [[0.01, 0.02, 0.03]],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const provider = new OllamaProvider({ fetchFn });
    const result = await provider.embed({ model: 'nomic-embed-text', input: 'hello' });

    expect(result.embeddings[0]).toHaveLength(3);
  });
});
