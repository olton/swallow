import { OpenAiCompatibleProvider } from './openai-compatible.js';
import type { OpenAiCompatibleProviderOptions } from './openai-compatible.js';

export interface AzureOpenAiProviderOptions
  extends Omit<OpenAiCompatibleProviderOptions, 'profile' | 'providerId'> {
  apiVersion?: string;
}

export class AzureOpenAiProvider extends OpenAiCompatibleProvider {
  constructor(options: AzureOpenAiProviderOptions = {}) {
    super({
      ...options,
      profile: 'azure-openai',
      providerId: 'azure-openai',
      apiVersion: options.apiVersion ?? '2024-10-21',
    });
  }
}
