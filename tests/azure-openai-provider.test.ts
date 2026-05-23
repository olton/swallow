import { describe, expect, it, vi } from 'vitest';

import { AzureOpenAiProvider } from '../src/providers/azure-openai';

describe('AzureOpenAiProvider', () => {
  it('uses deployment-based endpoints and api-key auth', async () => {
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body['model']).toBeUndefined();
        return new Response(
          JSON.stringify({
            model: 'deployment-chat',
            choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      })
      .mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({
            value: [{ id: 'gpt-4o-mini-prod' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const provider = new AzureOpenAiProvider({
      baseUrl: 'https://example.openai.azure.com',
      apiKey: 'azure-key',
      apiVersion: '2024-10-21',
      fetchFn,
    });

    const response = await provider.chat({
      model: 'gpt-4o-mini-prod',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(response.content).toBe('ok');

    const models = await provider.listModels();
    expect(models[0]?.name).toBe('gpt-4o-mini-prod');

    const [firstCall] = fetchFn.mock.calls;
    expect(String(firstCall?.[0])).toContain('/openai/deployments/gpt-4o-mini-prod/chat/completions?api-version=2024-10-21');

    const headers = firstCall?.[1]?.headers as Record<string, string>;
    expect(headers['api-key']).toBe('azure-key');
  });
});
