import { describe, expect, it, vi } from 'vitest';

import { AnthropicProvider } from '../src/providers/anthropic';

describe('AnthropicProvider', () => {
  it('maps non-stream response with tool calls', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: 'claude-3-5-sonnet',
          stop_reason: 'tool_use',
          content: [
            { type: 'text', text: 'Checking weather...' },
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'get_weather',
              input: { city: 'Kyiv' },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const provider = new AnthropicProvider({
      baseUrl: 'http://example.test',
      apiKey: 'test-key',
      fetchFn,
    });

    const response = await provider.chat({
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'weather in Kyiv' }],
      tools: [{ name: 'get_weather' }],
    });

    expect(response.finishReason).toBe('tool_use');
    expect(response.content).toContain('Checking weather');
    expect(response.toolCalls?.[0]?.name).toBe('get_weather');
    expect(response.toolCalls?.[0]?.argumentsJson).toContain('Kyiv');
  });

  it('parses Anthropic SSE stream events', async () => {
    const payload = [
      'event: message_start',
      'data: {"type":"message_start","message":{"model":"claude-3-5-sonnet"}}',
      '',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
      '',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"get_weather","input":{}}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":\\"Kyiv\\"}"}}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n');

    const fetchFn = vi.fn(async () =>
      new Response(payload, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    );

    const provider = new AnthropicProvider({
      baseUrl: 'http://example.test',
      apiKey: 'test-key',
      fetchFn,
    });

    const chunks: string[] = [];
    let sawDone = false;
    let sawToolDelta = false;

    for await (const chunk of provider.chatStream({
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      chunks.push(chunk.delta);
      if (chunk.done) {
        sawDone = true;
      }
      if (chunk.toolCalls?.[0]?.argumentsDelta) {
        sawToolDelta = true;
      }
    }

    expect(chunks.join('')).toContain('Hello');
    expect(sawToolDelta).toBe(true);
    expect(sawDone).toBe(true);
  });

  it('lists models', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ id: 'claude-3-5-sonnet', created_at: '2025-10-22T00:00:00Z' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const provider = new AnthropicProvider({
      baseUrl: 'http://example.test',
      apiKey: 'test-key',
      fetchFn,
    });

    const models = await provider.listModels();
    expect(models[0]?.name).toBe('claude-3-5-sonnet');
  });

  it('throws for embeddings', async () => {
    const provider = new AnthropicProvider({
      baseUrl: 'http://example.test',
      apiKey: 'test-key',
      fetchFn: vi.fn(async () => new Response('{}', { status: 200 })),
    });

    await expect(provider.embed({ model: 'claude', input: 'hello' })).rejects.toThrow(
      /Embeddings are not supported/i
    );
  });
});
