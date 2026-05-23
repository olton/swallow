import { describe, expect, it, vi } from 'vitest';

import { createProvider } from '../src/providers';

describe('createProvider', () => {
  it('creates all supported providers', () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));

    const providers = [
      createProvider({ provider: 'ollama', fetchFn }),
      createProvider({ provider: 'openai-compatible', fetchFn }),
      createProvider({ provider: 'openai', fetchFn }),
      createProvider({ provider: 'anthropic', fetchFn }),
      createProvider({ provider: 'gemini', fetchFn }),
      createProvider({ provider: 'azure-openai', fetchFn }),
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
