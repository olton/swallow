import { describe, expect, it } from 'vitest';

import { Agent } from '../src/agent/client';
import { OpenAiCompatibleProvider } from '../src/providers/openai-compatible';

const LMSTUDIO_HOST = process.env['LMSTUDIO_OPENAI_HOST'] ?? 'http://localhost:1234/v1';
const LMSTUDIO_MODEL = process.env['LMSTUDIO_OPENAI_MODEL'];

async function resolveModel(client: Agent): Promise<string> {
  if (LMSTUDIO_MODEL) {
    return LMSTUDIO_MODEL;
  }

  const models = await client.listModels();
  const first = models.at(0)?.name;
  if (!first) {
    throw new Error('No models available in LM Studio endpoint. Set LMSTUDIO_OPENAI_MODEL.');
  }

  return first;
}

describe('OpenAI-compatible live integration (LM Studio)', () => {
  const provider = new OpenAiCompatibleProvider({ baseUrl: LMSTUDIO_HOST });
  const client = new Agent(provider);

  it('lists models from /v1/models', async () => {
    const models = await client.listModels();
    expect(models.length).toBeGreaterThan(0);
  }, 30_000);

  it('runs chat via /v1/chat/completions', async () => {
    const model = await resolveModel(client);

    const response = await client.chat({
      model,
      messages: [{ role: 'user', content: 'Reply with exactly: lmstudio-ok' }],
      temperature: 0,
      maxTokens: 24,
    });

    expect(response.done).toBe(true);
    expect(response.content.trim().length).toBeGreaterThan(0);
  }, 60_000);

  it('runs streaming chat via SSE', async () => {
    const model = await resolveModel(client);

    let text = '';
    let done = false;

    for await (const chunk of client.stream({
      model,
      messages: [{ role: 'user', content: 'Reply with exactly: lmstudio-stream-ok' }],
      temperature: 0,
      maxTokens: 24,
    })) {
      text += chunk.delta;
      if (chunk.done) {
        done = true;
      }
    }

    expect(done).toBe(true);
    expect(text.trim().length).toBeGreaterThan(0);
  }, 60_000);
});
