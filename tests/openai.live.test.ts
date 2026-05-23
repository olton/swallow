import { describe, expect, it } from 'vitest';

import { Agent } from '../src/agent/client';
import { OpenAiProvider } from '../src/providers/openai';

const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
const OPENAI_BASE_URL = process.env['OPENAI_BASE_URL'];
const OPENAI_MODEL = process.env['OPENAI_MODEL'];

const describeOpenAi = OPENAI_API_KEY ? describe : describe.skip;

async function resolveModel(client: Agent): Promise<string> {
  if (OPENAI_MODEL) {
    return OPENAI_MODEL;
  }

  const models = await client.listModels();
  const first = models.at(0)?.name;
  if (!first) {
    throw new Error('No models available in OpenAI endpoint. Set OPENAI_MODEL.');
  }

  return first;
}

describeOpenAi('OpenAI native live integration', () => {
  const provider = new OpenAiProvider({
    apiKey: OPENAI_API_KEY,
    ...(OPENAI_BASE_URL !== undefined ? { baseUrl: OPENAI_BASE_URL } : {}),
  });
  const client = new Agent(provider);

  it('lists models', async () => {
    const models = await client.listModels();
    expect(models.length).toBeGreaterThan(0);
  }, 30_000);

  it('runs chat', async () => {
    const model = await resolveModel(client);

    const response = await client.chat({
      model,
      messages: [{ role: 'user', content: 'Reply with exactly: openai-native-ok' }],
      temperature: 0,
      maxTokens: 24,
    });

    expect(response.done).toBe(true);
    expect(response.content.trim().length).toBeGreaterThan(0);
  }, 60_000);
});
