<div align="center">

  <img src="./assets/logo-blue.png" alt="Swallow Logo" width="220" />

  # Swallow SDK
  ### Build your agent applications with ease

Swallow SDK is a lightweight Agent SDK for interacting with LLM providers from TypeScript/JavaScript.

</div>


## Features

- Provider-agnostic API via `LlmProvider`
- High-level `AgentClient` facade
- Built-in `OllamaProvider`
- Built-in `OpenAiCompatibleProvider`
- Streaming chat support
- Embeddings and model listing support
- Tool-calling orchestration (`runWithTools`)
- Retry/timeout/middleware support in providers
- Strict TypeScript-first design

## Install

```bash
npm install
```

## Scripts

```bash
npm run typecheck
npm test
npm run test:unit
npm run test:live
npm run test:openai
npm run test:live:openai
npm run test:live:lmstudio
npm run test:live:all
npm run build
npm run demo
```

## Environment Variables

All environment variables used across demo scripts, tests, and provider examples are listed in [.env.example](.env.example).

### Runtime / Demo

- `DEMO_HOST` - Demo server bind host for `npm run demo` (default: `127.0.0.1`)
- `DEMO_PORT` - Demo server bind port for `npm run demo` (default: `5177`)
- `OLLAMA_HOST` - Native Ollama API host used by demo and `npm run test:live` (default: `http://localhost:11434`)

### Live Tests

- `OLLAMA_MODEL` - Optional model override for native Ollama live test
- `OLLAMA_OPENAI_HOST` - OpenAI-compatible endpoint for Ollama live test (default: `http://localhost:11434/v1`)
- `OLLAMA_OPENAI_MODEL` - Optional model override for OpenAI-compatible Ollama live test
- `LMSTUDIO_OPENAI_HOST` - OpenAI-compatible endpoint for LM Studio live test (default: `http://localhost:1234/v1`)
- `LMSTUDIO_OPENAI_MODEL` - Optional model override for LM Studio live test

### Anthropic Provider

- `ANTHROPIC_API_KEY` - API key for `AnthropicProvider`
- `ANTHROPIC_BASE_URL` - Optional base URL override (default: `https://api.anthropic.com`)
- `ANTHROPIC_VERSION` - Optional API version header override (provider default: `2023-06-01`)

PowerShell quick setup example:

```bash
$env:OLLAMA_HOST="http://localhost:11434"
$env:OLLAMA_MODEL="gemma4:8b"
$env:OLLAMA_OPENAI_HOST="http://localhost:11434/v1"
$env:LMSTUDIO_OPENAI_HOST="http://localhost:1234/v1"
$env:ANTHROPIC_API_KEY="<your-key>"
```

## Public Demo Chat (Ollama)

Launch a local demo chat UI from `public/` powered by the SDK (`Agent` + `OllamaProvider`).

```bash
npm run demo
```

Then open:

```text
http://127.0.0.1:5177
```

Optional environment variables:

```bash
# PowerShell
$env:OLLAMA_HOST="http://localhost:11434"
$env:DEMO_HOST="127.0.0.1"
$env:DEMO_PORT="5177"
npm run demo
```

## Live Test Against Local Ollama

By default, the live test uses `http://localhost:11434` and auto-selects the first available model.

```bash
npm run test:live
```

You can override host/model via env vars:

```bash
# PowerShell
$env:OLLAMA_HOST="http://localhost:11434"
$env:OLLAMA_MODEL="gemma4:8b"
npm run test:live
```

## Quick Start (Ollama)

```ts
import { AgentClient, OllamaProvider } from 'swallow';

const provider = new OllamaProvider({
  host: 'http://127.0.0.1:11434',
});

const client = new AgentClient(provider);

const chat = await client.chat({
  model: 'llama3.1',
  messages: [{ role: 'user', content: 'Write a short release note.' }],
});

console.log(chat.content);
```

## Streaming Example

```ts
for await (const chunk of client.stream({
  model: 'llama3.1',
  messages: [{ role: 'user', content: 'Write a haiku about TypeScript.' }],
})) {
  process.stdout.write(chunk.delta);
}
```

## Public API

- `AgentClient`
- `OllamaProvider`
- `OpenAiCompatibleProvider`
- `SdkError`, `ProviderError`, `HttpError`
- Types: `LlmProvider`, `ChatRequest`, `ChatResponse`, `ChatStreamChunk`, `EmbedRequest`, `EmbedResponse`, `ModelInfo`, `LlmMessage`, `ToolDefinition`, `ToolCall`, `ToolHandler`, `RetryPolicy`, `HttpMiddleware`

## OpenAI-compatible Provider

```ts
import { AgentClient, OpenAiCompatibleProvider } from 'swallow';

const provider = new OpenAiCompatibleProvider({
  baseUrl: 'http://localhost:11434/v1',
  timeoutMs: 20_000,
  retry: { maxAttempts: 3, baseDelayMs: 200 },
  middlewares: [
    async (context, next) => {
      context.init = {
        ...context.init,
        headers: {
          ...(context.init.headers as Record<string, string>),
          'x-trace-id': 'demo-trace',
        },
      };
      return next(context);
    },
  ],
});

const client = new AgentClient(provider);
```

## LM Studio (OpenAI-compatible)

You do not need a separate provider for LM Studio in most cases. Use `OpenAiCompatibleProvider` with LM Studio base URL.

```ts
import { Agent, OpenAiCompatibleProvider } from 'swallow';

const provider = new OpenAiCompatibleProvider({
  baseUrl: 'http://localhost:1234/v1',
});

const agent = new Agent(provider);

const response = await agent.chat({
  model: 'your-lmstudio-model-id',
  messages: [{ role: 'user', content: 'Hello from LM Studio' }],
});

console.log(response.content);
```

Dedicated live test for LM Studio:

```bash
npm run test:live:lmstudio
```

Optional env vars:

```bash
# PowerShell
$env:LMSTUDIO_OPENAI_HOST="http://localhost:1234/v1"
$env:LMSTUDIO_OPENAI_MODEL="your-lmstudio-model-id"
npm run test:live:lmstudio
```

## Tool Calling API

```ts
const result = await client.runWithTools(
  {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'What is the weather in Kyiv?' }],
    tools: [
      {
        name: 'getWeather',
        description: 'Get weather by city',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
        },
      },
    ],
    toolChoice: 'auto',
  },
  {
    getWeather: async (args) => {
      const city = (args as { city?: string }).city ?? 'Unknown';
      return { city, tempC: 21, condition: 'clear' };
    },
  }
);

console.log(result.final.content);
```

## OpenAI-compatible Live Test (local Ollama)

```bash
npm run test:live:openai
```

Optional env vars:

```bash
# PowerShell
$env:OLLAMA_OPENAI_HOST="http://localhost:11434/v1"
$env:OLLAMA_OPENAI_MODEL="gemma4:8b"
npm run test:live:openai
```

## Notes

- Requires Node.js with native `fetch` support.
- Ollama default host is `http://127.0.0.1:11434`.
