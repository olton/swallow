import { OpenAiCompatibleProvider } from './openai-compatible.js';
import type { OpenAiCompatibleProviderOptions } from './openai-compatible.js';

export type OpenAiProviderOptions = Omit<OpenAiCompatibleProviderOptions, 'profile' | 'providerId'>;

export class OpenAiProvider extends OpenAiCompatibleProvider {
  constructor(options: OpenAiProviderOptions = {}) {
    super({
      ...options,
      profile: 'openai',
      providerId: 'openai',
      baseUrl: options.baseUrl ?? 'https://api.openai.com/v1',
    });
  }
}
