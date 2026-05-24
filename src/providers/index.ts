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

export enum ProviderType {
  Ollama = 'ollama',
  OpenAiCompatible = 'openai-compatible',
  OpenAi = 'openai',
  Anthropic = 'anthropic',
  Gemini = 'gemini',
  AzureOpenAi = 'azure-openai',
}

export type ProviderFactoryConfig =
  | ({ provider: ProviderType.Ollama } & OllamaProviderOptions)
  | ({ provider: ProviderType.OpenAiCompatible } & OpenAiCompatibleProviderOptions)
  | ({ provider: ProviderType.OpenAi } & OpenAiProviderOptions)
  | ({ provider: ProviderType.Anthropic } & AnthropicProviderOptions)
  | ({ provider: ProviderType.Gemini } & GeminiProviderOptions)
  | ({ provider: ProviderType.AzureOpenAi } & AzureOpenAiProviderOptions);

export function createProvider(config: ProviderFactoryConfig): LlmProvider {
  switch (config.provider) {
    case ProviderType.Ollama:
      return new OllamaProvider(config);
    case ProviderType.OpenAiCompatible:
      return new OpenAiCompatibleProvider(config);
    case ProviderType.OpenAi:
      return new OpenAiProvider(config);
    case ProviderType.Anthropic:
      return new AnthropicProvider(config);
    case ProviderType.Gemini:
      return new GeminiProvider(config);
    case ProviderType.AzureOpenAi:
      return new AzureOpenAiProvider(config);
    default:
      return assertNever(config);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported provider config: ${JSON.stringify(value)}`);
}
