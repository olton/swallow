# 03. Providers

## Підтримувані провайдери

- `ollama`
- `openai-compatible`
- `openai`
- `azure-openai`
- `anthropic`
- `gemini`

## Спосіб 1: напряму через клас

```ts
import { Agent, GeminiProvider } from 'swallow';

const provider = new GeminiProvider({
  apiKey: process.env.GEMINI_API_KEY,
});

const agent = new Agent(provider);
```

## Спосіб 2: через єдину фабрику

```ts
import { Agent, ProviderType, createProvider } from 'swallow';

const provider = createProvider({
  provider: ProviderType.OpenAiCompatible,
  profile: 'ollama',
  baseUrl: 'http://127.0.0.1:11434/v1',
});

const agent = new Agent(provider);
```

## Рекомендована стратегія для продукту

1. Почніть з `createProvider(...)`.
2. Тримайте provider config в env.
3. Додавайте fallback-провайдер через окрему логіку застосунку.

## Приклади конфігів

### Ollama

```ts
createProvider({
  provider: ProviderType.Ollama,
  baseUrl: process.env.OLLAMA_HOST,
});
```

### OpenAI

```ts
createProvider({
  provider: ProviderType.OpenAi,
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: process.env.OPENAI_BASE_URL,
});
```

### Azure OpenAI

```ts
createProvider({
  provider: ProviderType.AzureOpenAi,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseUrl: process.env.AZURE_OPENAI_BASE_URL,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION,
});
```

### Anthropic

```ts
createProvider({
  provider: ProviderType.Anthropic,
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseUrl: process.env.ANTHROPIC_BASE_URL,
  apiVersion: process.env.ANTHROPIC_VERSION,
});
```

### Gemini

```ts
createProvider({
  provider: ProviderType.Gemini,
  apiKey: process.env.GEMINI_API_KEY,
  baseUrl: process.env.GEMINI_BASE_URL,
});
```

## Capabilities

Кожен провайдер може повідомляти `provider.capabilities`:

- `chat`
- `stream`
- `embeddings`
- `modelListing`
- `tools`
- `toolStreaming`
- `systemMessages`

Приклад перевірки:

```ts
if (provider.capabilities?.embeddings) {
  const emb = await agent.embed({ model: 'text-embedding-3-small', input: 'hello' });
  console.log(emb.embeddings.length);
}
```
