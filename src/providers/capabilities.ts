import type { ProviderCapabilities } from '../types/types.js';

export function createCapabilities(
  overrides: Partial<ProviderCapabilities> = {}
): ProviderCapabilities {
  return {
    chat: true,
    stream: true,
    embeddings: true,
    modelListing: true,
    tools: true,
    toolStreaming: true,
    systemMessages: true,
    ...overrides,
  };
}
