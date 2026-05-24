import { describe, expect, it, vi } from 'vitest';

import { ProviderType, createProvider } from '../src/providers';

describe('createProvider', () => {
  it('creates all supported providers', () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));

    const providers = [
      createProvider({ provider: ProviderType.Ollama, fetchFn }),
      createProvider({ provider: ProviderType.OpenAiCompatible, fetchFn }),
      createProvider({ provider: ProviderType.OpenAi, fetchFn }),
      createProvider({ provider: ProviderType.Anthropic, fetchFn }),
      createProvider({ provider: ProviderType.Gemini, fetchFn }),
      createProvider({ provider: ProviderType.AzureOpenAi, fetchFn }),
    ];

    expect(providers.map((provider) => provider.id)).toEqual([
      'ollama',
      'openai-compatible',
      'openai',
      'anthropic',
      'gemini',
      'azure-openai',
    ]);
  });
});
