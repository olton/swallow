# 01. Getting Started

## 1) Що потрібно перед стартом

- Node.js 18+ (рекомендовано 20+)
- npm
- Один доступний провайдер (локальний Ollama або ключ до cloud API)

## 2) Встановлення

```bash
npm install
npm run build
```

## 3) Перший запит (мінімум)

```ts
import { Agent, OllamaProvider } from 'swallow';

const provider = new OllamaProvider({
  baseUrl: 'http://127.0.0.1:11434',
});

const agent = new Agent(provider);

const response = await agent.chat({
  model: 'llama3.1',
  messages: [{ role: 'user', content: 'Поясни, що таке HTTP у 2 реченнях.' }],
});

console.log(response.content);
```

## 4) Streaming режим

```ts
import { Agent, OpenAiProvider } from 'swallow';

const provider = new OpenAiProvider({
  apiKey: process.env.OPENAI_API_KEY,
});

const agent = new Agent(provider);

for await (const chunk of agent.stream({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Склади план вивчення TypeScript на 4 тижні.' }],
})) {
  process.stdout.write(chunk.delta);
}
```

## 5) Швидка перевірка моделей

```ts
const models = await agent.listModels();
console.log(models.map((m) => m.name));
```

## 6) Ключові типи, які варто знати

- `Agent` — фасад для `chat/stream/embed/listModels/runWithTools`
- `LlmProvider` — контракт провайдера
- `ChatRequest` / `ChatResponse` — запит та відповідь
- `ToolDefinition` / `ToolHandler` — для tool-calling

## 7) Типові помилки на старті

- Неправильний `baseUrl` або недоступний endpoint
- Невірний `model`
- Порожні `messages`
- Відсутній API key у env
