# 04. Tools And MCP

## 1) Tool Calling через runWithTools

`runWithTools` потрібен, коли модель має викликати ваші функції (інструменти).

```ts
import { Agent, OpenAiProvider } from 'swallow';

const provider = new OpenAiProvider({ apiKey: process.env.OPENAI_API_KEY });
const agent = new Agent(provider);

const result = await agent.runWithTools(
  {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Яка погода в Києві?' }],
    toolChoice: 'auto',
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
  },
  {
    getWeather: async (args) => {
      const city = (args as { city: string }).city;
      return { city, tempC: 23, condition: 'clear' };
    },
  },
);

console.log(result.final.content);
```

Що робить SDK:

- читає tool call із відповіді моделі
- валідовує аргументи за schema
- викликає ваш handler
- додає result як `tool` повідомлення
- робить наступну ітерацію до фінальної відповіді

## 2) MCP сервер через єдиний клас McpServer

### HTTP transport

```ts
import { McpServer } from 'swallow';

const mcp = new McpServer({
  transport: 'http',
  baseUrl: 'https://your-mcp.example.com/mcp',
  headers: {
    Authorization: `Bearer ${process.env.MCP_BEARER_TOKEN}`,
  },
});
```

### STDIO transport

```ts
const mcp = new McpServer({
  transport: 'stdio',
  command: 'npx.cmd',
  args: ['-y', '@modelcontextprotocol/server-memory'],
});
```

## 3) Використання MCP tools у агенті

```ts
const result = await agent.runWithMcpTools(
  {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Знайди доки по route handlers у Next.js' }],
    toolChoice: 'auto',
  },
  mcp,
  {
    maxIterations: 8,
  },
);

console.log(result.final.content);
mcp.close();
```

## 4) Комбінування MCP + локальних tools

```ts
await agent.runWithMcpTools(
  {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Використай зовнішні та локальні tools' }],
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

## 5) Коли використовувати MCP

- Коли tools живуть в іншій системі
- Коли треба стандартизований протокол інтеграції
- Коли потрібно підключати готові MCP сервери (memory, docs, search тощо)
