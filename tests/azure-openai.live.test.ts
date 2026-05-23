import { describe, expect, it } from 'vitest';

import { Agent } from '../src/agent/client';
import { AzureOpenAiProvider } from '../src/providers/azure-openai';

const AZURE_OPENAI_API_KEY = process.env['AZURE_OPENAI_API_KEY'];
const AZURE_OPENAI_BASE_URL = process.env['AZURE_OPENAI_BASE_URL'];
const AZURE_OPENAI_API_VERSION = process.env['AZURE_OPENAI_API_VERSION'];
const AZURE_OPENAI_DEPLOYMENT = process.env['AZURE_OPENAI_DEPLOYMENT'];

const describeAzure =
  AZURE_OPENAI_API_KEY && AZURE_OPENAI_BASE_URL && AZURE_OPENAI_DEPLOYMENT ? describe : describe.skip;

describeAzure('Azure OpenAI native live integration', () => {
  const provider = new AzureOpenAiProvider({
    apiKey: AZURE_OPENAI_API_KEY,
    baseUrl: AZURE_OPENAI_BASE_URL,
    ...(AZURE_OPENAI_API_VERSION !== undefined ? { apiVersion: AZURE_OPENAI_API_VERSION } : {}),
  });
  const client = new Agent(provider);

  it('lists deployments/models', async () => {
    const models = await client.listModels();
    expect(models.length).toBeGreaterThan(0);
  }, 30_000);

  it('runs chat via deployment endpoint', async () => {
    const response = await client.chat({
      model: AZURE_OPENAI_DEPLOYMENT,
      messages: [{ role: 'user', content: 'Reply with exactly: azure-openai-ok' }],
      temperature: 0,
      maxTokens: 24,
    });

    expect(response.done).toBe(true);
    expect(response.content.trim().length).toBeGreaterThan(0);
  }, 60_000);
});
