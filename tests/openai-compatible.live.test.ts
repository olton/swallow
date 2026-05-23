import { describe, expect, it } from 'vitest';

import { Agent } from '../src/agent/client';
import { OpenAiCompatibleProvider } from '../src/providers/openai-compatible';

const OPENAI_COMPAT_HOST = process.env['OLLAMA_OPENAI_HOST'] ?? 'http://localhost:11434/v1';
const OPENAI_COMPAT_MODEL = process.env['OLLAMA_OPENAI_MODEL'];

async function resolveModel(client: Agent): Promise<string> {
  if (OPENAI_COMPAT_MODEL) {
    return OPENAI_COMPAT_MODEL;
  }

  const models = await client.listModels();
  const first = models.at(0)?.name;
  if (!first) {
    throw new Error('No models available in OpenAI-compatible endpoint. Set OLLAMA_OPENAI_MODEL.');
  }

  return first;
}

describe('OpenAI-compatible live integration (local Ollama)', () => {
  const provider = new OpenAiCompatibleProvider({
    baseUrl: OPENAI_COMPAT_HOST,
  });
  const client = new Agent(provider);

  it('lists models from /v1/models', async () => {
    const models = await client.listModels();
    expect(models.length).toBeGreaterThan(0);
  }, 30_000);

  it('runs chat via /v1/chat/completions', async () => {
    const model = await resolveModel(client);

    const response = await client.chat({
      model,
      messages: [{ role: 'user', content: 'Reply with exactly: openai-ok' }],
      temperature: 0,
      maxTokens: 20,
    });

    expect(response.done).toBe(true);
    expect(response.content.trim().length).toBeGreaterThan(0);
  }, 60_000);

  it('runs streaming chat via SSE', async () => {
    const model = await resolveModel(client);

    let aggregated = '';
    let sawDone = false;

    for await (const chunk of client.stream({
      model,
      messages: [{ role: 'user', content: 'Reply with exactly: openai-stream-ok' }],
      temperature: 0,
      maxTokens: 24,
    })) {
      aggregated += chunk.delta;
      if (chunk.done) {
        sawDone = true;
      }
    }

    expect(sawDone).toBe(true);
    expect(aggregated.trim().length).toBeGreaterThan(0);
  }, 60_000);
});
