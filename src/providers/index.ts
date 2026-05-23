import { AnthropicProvider } from './anthropic.js';
import { AzureOpenAiProvider } from './azure-openai.js';
import { GeminiProvider } from './gemini.js';
import { OllamaProvider } from './ollama.js';
import { OpenAiCompatibleProvider } from './openai-compatible.js';
import { OpenAiProvider } from './openai.js';
import type { LlmProvider } from '../types/types.js';
import type { AnthropicProviderOptions } from './anthropic.js';
import type { AzureOpenAiProviderOptions } from './azure-openai.js';
import type { GeminiProviderOptions } from './gemini.js';
import type { OllamaProviderOptions } from './ollama.js';
import type { OpenAiCompatibleProviderOptions } from './openai-compatible.js';
import type { OpenAiProviderOptions } from './openai.js';

export type ProviderFactoryConfig =
  | ({ provider: 'ollama' } & OllamaProviderOptions)
  | ({ provider: 'openai-compatible' } & OpenAiCompatibleProviderOptions)
  | ({ provider: 'openai' } & OpenAiProviderOptions)
  | ({ provider: 'anthropic' } & AnthropicProviderOptions)
  | ({ provider: 'gemini' } & GeminiProviderOptions)
  | ({ provider: 'azure-openai' } & AzureOpenAiProviderOptions);

export function createProvider(config: ProviderFactoryConfig): LlmProvider {
  switch (config.provider) {
    case 'ollama':
      return new OllamaProvider(config);
    case 'openai-compatible':
      return new OpenAiCompatibleProvider(config);
    case 'openai':
      return new OpenAiProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    case 'azure-openai':
      return new AzureOpenAiProvider(config);
    default:
      return assertNever(config);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported provider config: ${JSON.stringify(value)}`);
}
