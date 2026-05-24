# 07. Cookbook: 10 Готових Сценаріїв

Цей розділ містить короткі, практичні рецепти, які можна копіювати і адаптувати під ваш проєкт.

## 1) Базовий Chat Endpoint (Node/Express style)

```ts
import { Agent, createProvider } from 'swallow';

const provider = createProvider({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
});

const agent = new Agent(provider);

// pseudo handler
export async function chatHandler(req: { body: { message: string } }) {
  const response = await agent.chat({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: req.body.message }],
  });

  return { content: response.content };
}
```

## 2) Streaming у Web UI

```ts
for await (const chunk of agent.stream({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Напиши короткий summary' }],
})) {
  // append to UI buffer
  renderDelta(chunk.delta);
}
```

## 3) Agent з Tool Calling (локальна бізнес-логіка)

```ts
const result = await agent.runWithTools(
  {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Порахуй суму 42 і 18' }],
    toolChoice: 'auto',
    tools: [
      {
        name: 'sum',
        description: 'Add two numbers',
        parameters: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' },
          },
          required: ['a', 'b'],
        },
      },
    ],
  },
  {
    sum: ({ a, b }: { a: number; b: number }) => ({ total: a + b }),
  },
);

console.log(result.final.content);
```

## 4) MCP Memory через STDIO

```ts
import { McpServer } from 'swallow';

const memoryMcp = new McpServer({
  transport: 'stdio',
  command: 'npx.cmd',
  args: ['-y', '@modelcontextprotocol/server-memory'],
});

const result = await agent.runWithMcpTools(
  {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: "Запам'ятай, що я люблю TypeScript" }],
    toolChoice: 'auto',
  },
  memoryMcp,
);

memoryMcp.close();
```

## 5) MCP Docs/Search через HTTP

```ts
const docsMcp = new McpServer({
  transport: 'http',
  baseUrl: process.env.MCP_SERVER_URL ?? 'https://your-mcp.example.com/mcp',
  headers: {
    ...(process.env.MCP_BEARER_TOKEN ? { Authorization: `Bearer ${process.env.MCP_BEARER_TOKEN}` } : {}),
  },
});

const response = await agent.runWithMcpTools(
  {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Знайди офіційні доки про Next.js route handlers' }],
    toolChoice: 'auto',
  },
  docsMcp,
);
```

## 6) Fallback між провайдерами

```ts
import { Agent, createProvider } from 'swallow';

const primary = new Agent(createProvider({ provider: 'openai', apiKey: process.env.OPENAI_API_KEY }));
const fallback = new Agent(createProvider({ provider: 'ollama', baseUrl: process.env.OLLAMA_HOST }));

async function safeChat(message: string): Promise<string> {
  try {
    const res = await primary.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: message }],
    });
    return res.content;
  } catch {
    const res = await fallback.chat({
      model: 'llama3.1',
      messages: [{ role: 'user', content: message }],
    });
    return res.content;
  }
}
```

## 7) Перевірка capabilities перед feature

```ts
if (provider.capabilities?.embeddings) {
  const emb = await agent.embed({ model: 'text-embedding-3-small', input: 'hello' });
  console.log(emb.embeddings[0]?.length);
}
```

## 8) Runtime Config із mcpServers + skills + agents + prompts

```ts
import { createMcpRuntimeFromJsonFile } from 'swallow';

const runtime = await createMcpRuntimeFromJsonFile('./runtime.config.json');

const memory = runtime.mcpServers.memory;
const skill = runtime.skills['check-security'];
const explore = runtime.agents.Explore;
const triagePrompt = runtime.prompts.triage;

console.log({ hasMemory: Boolean(memory), hasSkill: Boolean(skill), hasExplore: Boolean(explore), hasPrompt: Boolean(triagePrompt) });
```

## 9) Простий telemetry middleware

```ts
import { createTelemetryMiddleware, createProvider, Agent } from 'swallow';

const provider = createProvider({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  middlewares: [
    createTelemetryMiddleware({
      logger: (event) => {
        console.log(event.type, event.providerId, event.durationMs);
      },
    }),
  ],
});

const agent = new Agent(provider);
```

## 10) Production-safe tool handler pattern

```ts
const handlers = {
  chargeCard: async (args: unknown) => {
    const input = args as { amount: number; currency: string; userId: string };

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error('Invalid amount');
    }

    // check permissions, rate limit, idempotency key, audit log
    // ...

    return { ok: true, transactionId: 'tx_123' };
  },
};
```

## Коли який рецепт брати

- POC за 1 день: `1`, `2`, `6`
- Agent workflows: `3`, `4`, `5`
- Enterprise readiness: `7`, `8`, `9`, `10`
