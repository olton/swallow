import { describe, expect, it } from 'vitest';

import { Agent } from '../src/agent/client';
import { GeminiProvider } from '../src/providers/gemini';

const GEMINI_API_KEY = process.env['GEMINI_API_KEY'];
const GEMINI_BASE_URL = process.env['GEMINI_BASE_URL'];
const GEMINI_MODEL = process.env['GEMINI_MODEL'] ?? 'gemini-2.5-flash';

const describeGemini = GEMINI_API_KEY ? describe : describe.skip;

describeGemini('Gemini native live integration', () => {
  const provider = new GeminiProvider({
    apiKey: GEMINI_API_KEY,
    ...(GEMINI_BASE_URL !== undefined ? { baseUrl: GEMINI_BASE_URL } : {}),
  });
  const client = new Agent(provider);

  it('lists models', async () => {
    const models = await client.listModels();
    expect(models.length).toBeGreaterThan(0);
  }, 30_000);

  it('runs chat', async () => {
    const response = await client.chat({
      model: GEMINI_MODEL,
      messages: [{ role: 'user', content: 'Reply with exactly: gemini-native-ok' }],
      temperature: 0,
      maxTokens: 24,
    });

    expect(response.done).toBe(true);
    expect(response.content.trim().length).toBeGreaterThan(0);
  }, 60_000);
});
