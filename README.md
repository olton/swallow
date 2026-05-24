<div align="center">

![Swallow SDK Logo](./assets/logo.png)

# Swallow SDK

### Build your agent applications with ease

Swallow SDK is a lightweight Agent SDK for interacting with LLM providers from TypeScript/JavaScript.

</div>

## Features

- Provider-agnostic API via `LlmProvider`
- High-level `AgentClient` facade
- Unified provider factory: `createProvider(...)`
- Built-in `OllamaProvider`
- Built-in `OpenAiCompatibleProvider`
- Built-in `OpenAiProvider` (native OpenAI)
- Built-in `AzureOpenAiProvider` (native Azure OpenAI)
- Built-in `GeminiProvider` (native Gemini API)
- Built-in `AnthropicProvider`
- Capability flags on each provider (`provider.capabilities`)
- OpenAI-compatible vendor profiles/adapters (`openai`, `ollama`, `lmstudio`, `azure-openai`, `custom`)
- Streaming chat support
- Embeddings and model listing support
- Tool-calling orchestration (`runWithTools`)
- Retry/timeout/middleware support in providers
- Strict TypeScript-first design

## Quick Start (Unified Factory)

```ts
import { AgentClient, createProvider } from 'swallow';

const provider = createProvider({
  provider: 'openai-compatible',
  profile: 'ollama',
  baseUrl: 'http://127.0.0.1:11434/v1',
});

const client = new AgentClient(provider);

const response = await client.chat({
  model: 'llama3.1',
  messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
});

console.log(response.content);
```

The same API works for all supported providers:

```ts
const openai = createProvider({ provider: 'openai', apiKey: process.env.OPENAI_API_KEY });
const anthropic = createProvider({ provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY });
const gemini = createProvider({ provider: 'gemini', apiKey: process.env.GEMINI_API_KEY });
const azure = createProvider({
  provider: 'azure-openai',
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseUrl: process.env.AZURE_OPENAI_BASE_URL,
  apiVersion: '2024-10-21',
});
```

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
npm run test:openai:native
npm run test:anthropic
npm run test:azure
npm run test:gemini
npm run test:live:openai
npm run test:live:openai:native
npm run test:live:lmstudio
npm run test:live:azure
npm run test:live:gemini
npm run test:live:all
npm run build
npm run demo
```

## Environment Variables

All environment variables used across demo scripts, tests, and provider examples are listed in [.env.example](.env.example).

### Runtime / Demo

- `DEMO_HOST` - Demo server bind host for `npm run demo` (default: `127.0.0.1`)
- `DEMO_PORT` - Demo server bind port for `npm run demo` (default: `5177`)
- `DEMO_PROVIDER` - Default provider for demo requests when `provider` is not passed (default: `ollama`)
- `OLLAMA_HOST` - Native Ollama API host used by demo and `npm run test:live` (default: `http://localhost:11434`)
- `OPENAI_COMPATIBLE_BASE_URL` - Optional base URL for demo page `openai-compatible`
- `OPENAI_COMPATIBLE_API_KEY` - Optional API key for demo page `openai-compatible`

### Live Tests

- `OLLAMA_MODEL` - Optional model override for native Ollama live test
- `OLLAMA_OPENAI_HOST` - OpenAI-compatible endpoint for Ollama live test (default: `http://localhost:11434/v1`)
- `OLLAMA_OPENAI_MODEL` - Optional model override for OpenAI-compatible Ollama live test
- `LMSTUDIO_OPENAI_HOST` - OpenAI-compatible endpoint for LM Studio live test (default: `http://localhost:1234/v1`)
- `LMSTUDIO_OPENAI_MODEL` - Optional model override for LM Studio live test

### OpenAI Native Provider

- `OPENAI_API_KEY` - API key for `OpenAiProvider`
- `OPENAI_BASE_URL` - Optional base URL override (default: `https://api.openai.com/v1`)
- `OPENAI_MODEL` - Optional model override for OpenAI live test

### Anthropic Provider

- `ANTHROPIC_API_KEY` - API key for `AnthropicProvider`
- `ANTHROPIC_BASE_URL` - Optional base URL override (default: `https://api.anthropic.com`)
- `ANTHROPIC_VERSION` - Optional API version header override (provider default: `2023-06-01`)

### Gemini Native Provider

- `GEMINI_API_KEY` - API key for `GeminiProvider`
- `GEMINI_BASE_URL` - Optional base URL override (default: `https://generativelanguage.googleapis.com`)
- `GEMINI_MODEL` - Optional model override for Gemini live test (test default: `gemini-2.5-flash`)

### Azure OpenAI Native Provider

- `AZURE_OPENAI_API_KEY` - API key for `AzureOpenAiProvider`
- `AZURE_OPENAI_BASE_URL` - Azure endpoint, e.g. `https://your-resource.openai.azure.com`
- `AZURE_OPENAI_DEPLOYMENT` - Deployment name (used as `model` in SDK calls)
- `AZURE_OPENAI_API_VERSION` - Optional API version override (default: `2024-10-21`)

PowerShell quick setup example:

```bash
$env:OLLAMA_HOST="http://localhost:11434"
$env:OLLAMA_MODEL="gemma4:8b"
$env:OLLAMA_OPENAI_HOST="http://localhost:11434/v1"
$env:LMSTUDIO_OPENAI_HOST="http://localhost:1234/v1"
$env:OPENAI_API_KEY="<your-key>"
$env:ANTHROPIC_API_KEY="<your-key>"
$env:GEMINI_API_KEY="<your-key>"
$env:AZURE_OPENAI_API_KEY="<your-key>"
$env:AZURE_OPENAI_BASE_URL="https://your-resource.openai.azure.com"
$env:AZURE_OPENAI_DEPLOYMENT="gpt-4o-mini-prod"
```

## Capability Matrix

Every provider exposes `provider.capabilities` so you can check features at runtime.

| Provider                   | Chat | Stream | Tools | Tool Stream | Embeddings | Model Listing |
| -------------------------- | ---- | ------ | ----- | ----------- | ---------- | ------------- |
| `OllamaProvider`           | Yes  | Yes    | Yes   | No          | Yes        | Yes           |
| `OpenAiCompatibleProvider` | Yes  | Yes    | Yes   | Yes         | Yes        | Yes\*         |
| `OpenAiProvider`           | Yes  | Yes    | Yes   | Yes         | Yes        | Yes           |
| `AzureOpenAiProvider`      | Yes  | Yes    | Yes   | Yes         | Yes        | Yes           |
| `AnthropicProvider`        | Yes  | Yes    | Yes   | Yes         | No         | Yes           |
| `GeminiProvider`           | Yes  | Yes    | Yes   | Yes         | Yes        | Yes           |

`*` OpenAI-compatible model listing depends on selected profile/endpoint support.

## Unified Provider Options

For most providers, options follow the same naming:

- `baseUrl` - provider endpoint
- `apiKey` - API key (if required)
- `headers` - extra HTTP headers
- `timeoutMs` - request timeout
- `retry` - retry policy
- `middlewares` - HTTP middleware chain

Provider-specific extras:

- `AnthropicProvider`: `apiVersion` (alias of `anthropicVersion`)
- `OpenAiCompatibleProvider`: `profile`, `apiVersion` (for Azure profile), optional custom `adapter`
- `AzureOpenAiProvider`: `apiVersion`
- `OllamaProvider`: `host` alias for backward compatibility (`baseUrl` is preferred)

## Public Demo Chat (All Providers)

Launch a local demo UI from `public/` powered by the SDK (`Agent`) with runtime provider switching.

```bash
npm run demo
```

Then open launcher page:

```text
http://127.0.0.1:5177
```

Available demo pages:

- `Ollama`
- `OpenAI-compatible`
- `OpenAI Native`
- `Azure OpenAI`
- `Anthropic`
- `Gemini`

Each page sends `provider` to the demo backend so you can test different providers without restarting the server.

Optional environment variables:

```bash
# PowerShell
$env:DEMO_PROVIDER="ollama"
$env:OLLAMA_HOST="http://localhost:11434"
$env:OPENAI_COMPATIBLE_BASE_URL="http://localhost:11434/v1"
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
  baseUrl: 'http://127.0.0.1:11434',
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
- `createProvider`
- `OllamaProvider`
- `OpenAiCompatibleProvider`
- `OpenAiProvider`
- `AzureOpenAiProvider`
- `AnthropicProvider`
- `GeminiProvider`
- `SdkError`, `ProviderError`, `HttpError`
- Types: `LlmProvider`, `ProviderCapabilities`, `ChatRequest`, `ChatResponse`, `ChatStreamChunk`, `EmbedRequest`, `EmbedResponse`, `ModelInfo`, `LlmMessage`, `ToolDefinition`, `ToolCall`, `ToolHandler`, `RetryPolicy`, `HttpMiddleware`

## Anthropic Provider

Use `AnthropicProvider` for native Anthropic Messages API.

```ts
import { Agent, AnthropicProvider } from 'swallow';

const provider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  anthropicVersion: '2023-06-01',
  timeoutMs: 20_000,
  retry: { maxAttempts: 3, baseDelayMs: 200 },
});

const agent = new Agent(provider);

const response = await agent.chat({
  model: 'claude-3-5-sonnet-latest',
  messages: [{ role: 'user', content: 'Hello from Anthropic' }],
});

console.log(response.content);
```

Unit tests for provider mapping:

```bash
npm run test:anthropic
```

## OpenAI-compatible Provider

```ts
import { AgentClient, OpenAiCompatibleProvider } from 'swallow';

const provider = new OpenAiCompatibleProvider({
  baseUrl: 'http://localhost:11434/v1',
  profile: 'ollama',
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

Profiles and adapter behavior:

- `openai` - standard `/v1` OpenAI-style endpoints with `Authorization: Bearer ...`
- `ollama` - OpenAI-compatible local Ollama endpoints
- `lmstudio` - OpenAI-compatible LM Studio endpoints
- `azure-openai` - deployment-based Azure paths + `api-key` header
- `custom` - custom OpenAI-compatible endpoint (default)

Example for Azure profile through `OpenAiCompatibleProvider`:

```ts
const provider = new OpenAiCompatibleProvider({
  profile: 'azure-openai',
  baseUrl: 'https://your-resource.openai.azure.com',
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  apiVersion: '2024-10-21',
});
```

## OpenAI Native Provider

```ts
import { AgentClient, OpenAiProvider } from 'swallow';

const provider = new OpenAiProvider({
  apiKey: process.env.OPENAI_API_KEY,
});

const client = new AgentClient(provider);
```

## Gemini Native Provider

```ts
import { AgentClient, GeminiProvider } from 'swallow';

const provider = new GeminiProvider({
  apiKey: process.env.GEMINI_API_KEY,
});

const client = new AgentClient(provider);
```

## Azure OpenAI Native Provider

```ts
import { AgentClient, AzureOpenAiProvider } from 'swallow';

const provider = new AzureOpenAiProvider({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseUrl: process.env.AZURE_OPENAI_BASE_URL,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21',
});

const client = new AgentClient(provider);

// model must be your Azure deployment name
const response = await client.chat({
  model: process.env.AZURE_OPENAI_DEPLOYMENT ?? 'your-deployment-name',
  messages: [{ role: 'user', content: 'Hello from Azure OpenAI' }],
});
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
  },
);

console.log(result.final.content);
```

## External MCP Servers (Context7 Example)

You can connect external MCP servers and run them through the same tool loop with `runWithMcpTools(...)`.

```ts
import { Agent, OpenAIProvider, McpServer } from 'swallow';

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
});

const mcp = new McpServer({
  transport: 'http',
  // Your MCP HTTP endpoint
  baseUrl: process.env.MCP_SERVER_URL ?? 'https://your-mcp-server.example.com/mcp',
  headers: {
    ...(process.env.MCP_BEARER_TOKEN ? { Authorization: `Bearer ${process.env.MCP_BEARER_TOKEN}` } : {}),
  },
});

const agent = new Agent(provider);

const result = await agent.runWithMcpTools(
  {
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: 'Find the official docs about Next.js route handlers and summarize in 3 bullets.',
      },
    ],
    toolChoice: 'auto',
  },
  mcp,
);

console.log(result.final.content);
```

How it works:

1. `McpServer` initializes MCP session (`initialize`).
2. Agent loads MCP tools from `tools/list`.
3. LLM calls tools as usual.
4. Agent executes `tools/call` on MCP server.
5. Tool outputs are fed back into the LLM loop until final answer.

You can mix local handlers with MCP handlers:

```ts
await agent.runWithMcpTools(
  {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Use local and MCP tools together' }],
    toolChoice: 'auto',
  },
  mcp,
  {
    handlers: {
      localUtility: async () => ({ ok: true }),
    },
  },
);
```

If your MCP server is configured as command/args (for example in VS Code MCP config), use the same `McpServer` with stdio transport:

```ts
import { Agent, OpenAIProvider, McpServer } from 'swallow';

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
});

const mcp = new McpServer({
  transport: 'stdio',
  command: 'npx.cmd',
  args: ['-y', '@modelcontextprotocol/server-memory'],
});

const agent = new Agent(provider);

const result = await agent.runWithMcpTools(
  {
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Save and read notes from memory MCP' }],
    toolChoice: 'auto',
  },
  mcp,
);

console.log(result.final.content);

// Optional cleanup when you are done with this client instance
mcp.close();
```

You can also create MCP server instance directly from MCP-style config using `createMcpServerFromConfig`:

```ts
import { Agent, OpenAIProvider, createMcpServerFromConfig } from 'swallow';

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
});

const mcpConfig = {
  memory: {
    command: 'npx.cmd',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    autoStart: true,
  },
};

const mcp = createMcpServerFromConfig(mcpConfig, 'memory');

const agent = new Agent(provider);
const result = await agent.runWithMcpTools(
  {
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Save note using memory MCP' }],
    toolChoice: 'auto',
  },
  mcp,
);

console.log(result.final.content);
mcp.close();
```

Supported config shapes:

- Single server config object
- Config map + server name (recommended when you have multiple MCP servers)
- HTTP config (`baseUrl` or `url`)
- Stdio config (`command`, `args`, optional `cwd`/`env`/`autoStart`)

### Batch Create MCP Servers

You can create several MCP servers at once from object config or from JSON file.

From object:

```ts
import { createMcpServersFromConfig } from 'swallow';

const servers = createMcpServersFromConfig({
  mcpServers: {
    memory: {
      command: 'npx.cmd',
      args: ['-y', '@modelcontextprotocol/server-memory'],
      autoStart: true,
    },
    context7: {
      transport: 'http',
      baseUrl: 'https://your-context7-mcp.example.com/mcp',
      headers: {
        Authorization: 'Bearer <token>',
      },
    },
  },
});

const memory = servers.memory;
const context7 = servers.context7;
```

From JSON file:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx.cmd",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "autoStart": true
    }
  }
}
```

```ts
import { createMcpServersFromJsonFile } from 'swallow';

const servers = await createMcpServersFromJsonFile('./mcp.config.json');
const memory = servers.memory;
```

### Runtime Config: SKILLS, AGENTS, PROMPTS

You can load `mcpServers`, `skills`, `agents`, and `prompts` in one runtime config.

Quick usage (short):

1. Put your maps into config sections: `skills`, `agents`, `prompts`.
2. Load runtime once via `createMcpRuntimeFromConfig(...)` or `createMcpRuntimeFromJsonFile(...)`.
3. Access resources from `runtime.skills`, `runtime.agents`, `runtime.prompts`.

```ts
import { createMcpRuntimeFromConfig } from 'swallow';

const runtime = createMcpRuntimeFromConfig({
  skills: { 'check-security': { file: './skills/check-security/SKILL.md' } },
  agents: { Explore: { description: 'Fast repo exploration' } },
  prompts: { triage: 'Summarize open defects by severity' },
});

const skill = runtime.skills['check-security'];
const agent = runtime.agents.Explore;
const prompt = runtime.prompts.triage;
```

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx.cmd",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "autoStart": true
    }
  },
  "skills": {
    "check-security": {
      "description": "Identify vulnerabilities",
      "file": "./skills/check-security/SKILL.md"
    }
  },
  "agents": {
    "Explore": {
      "description": "Fast read-only exploration"
    }
  },
  "prompts": {
    "triage": "Summarize open defects by severity"
  }
}
```

```ts
import { createMcpRuntimeFromJsonFile } from 'swallow';

const runtime = await createMcpRuntimeFromJsonFile('./runtime.config.json');

const memoryServer = runtime.mcpServers.memory;
const skill = runtime.skills['check-security'];
const agent = runtime.agents.Explore;
const prompt = runtime.prompts.triage;
```

Notes:

- `createMcpRuntimeFromConfig(...)` accepts object config directly.
- `createMcpRuntimeFromJsonFile(...)` reads JSON file.
- Uppercase sections are also supported: `SKILLS`, `AGENTS`, `PROMPTS`.

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

## OpenAI Native Live Test

```bash
npm run test:live:openai:native
```

Optional env vars:

```bash
# PowerShell
$env:OPENAI_API_KEY="<your-key>"
$env:OPENAI_MODEL="gpt-4o-mini"
npm run test:live:openai:native
```

## Gemini Native Live Test

```bash
npm run test:live:gemini
```

Optional env vars:

```bash
# PowerShell
$env:GEMINI_API_KEY="<your-key>"
$env:GEMINI_MODEL="gemini-2.5-flash"
npm run test:live:gemini
```

## Azure OpenAI Native Live Test

```bash
npm run test:live:azure
```

Required env vars:

```bash
# PowerShell
$env:AZURE_OPENAI_API_KEY="<your-key>"
$env:AZURE_OPENAI_BASE_URL="https://your-resource.openai.azure.com"
$env:AZURE_OPENAI_DEPLOYMENT="gpt-4o-mini-prod"
npm run test:live:azure
```

## Notes

- Requires Node.js with native `fetch` support.
- Ollama default host is `http://127.0.0.1:11434`.
- `OllamaProvider` accepts both `baseUrl` (preferred) and `host` (backward compatible).
