import { describe, expect, it } from 'vitest';

import { Agent } from '../src/agent/client';
import { OllamaProvider } from '../src/providers/ollama';

const OLLAMA_HOST = process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env['OLLAMA_MODEL'];

async function resolveModel(client: Agent): Promise<string> {
  if (OLLAMA_MODEL) {
    return OLLAMA_MODEL;
  }

  const models = await client.listModels();
  const first = models.at(0)?.name;
  if (!first) {
    throw new Error('No models available in local Ollama. Set OLLAMA_MODEL or pull a model first.');
  }

  return first;
}

describe('Ollama live integration', () => {
  const provider = new OllamaProvider({ host: OLLAMA_HOST });
  const client = new Agent(provider);

  it('lists models from local Ollama', async () => {
    const models = await client.listModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  }, 30_000);

  it('runs non-stream chat request', async () => {
    const model = await resolveModel(client);

    const response = await client.chat(
      {
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
        maxTokens: 16,
        temperature: 0,
      }
    );

    expect(response.model.length).toBeGreaterThan(0);
    expect(response.done).toBe(true);
    expect(response.content.trim().length).toBeGreaterThan(0);
  }, 60_000);

  it('runs stream chat request', async () => {
    const model = await resolveModel(client);

    let aggregated = '';
    let sawDone = false;

    for await (const chunk of client.stream({
      model,
      messages: [{ role: 'user', content: 'Reply with exactly: stream-ok' }],
      maxTokens: 24,
      temperature: 0,
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
