# 02. Architecture

## Високорівнева схема

```mermaid
flowchart LR
  App[Application Code] --> Agent[Agent]
  Agent --> Provider[LlmProvider]

  Provider --> Ollama[OllamaProvider]
  Provider --> OAIC[OpenAiCompatibleProvider]
  Provider --> OAI[OpenAiProvider]
  Provider --> Azure[AzureOpenAiProvider]
  Provider --> Anthropic[AnthropicProvider]
  Provider --> Gemini[GeminiProvider]
```

## Як проходить звичайний chat

```mermaid
sequenceDiagram
  participant U as User
  participant A as App
  participant G as Agent
  participant P as Provider
  participant M as Model API

  U->>A: Input text
  A->>G: agent.chat(request)
  G->>P: provider.chat(request)
  P->>M: HTTP request
  M-->>P: JSON response
  P-->>G: ChatResponse
  G-->>A: ChatResponse
  A-->>U: Render content
```

## Як проходить runWithTools

```mermaid
flowchart TD
  Start[agent.runWithTools] --> Chat1[Provider chat call]
  Chat1 --> HasCalls{Tool calls?}
  HasCalls -- No --> Final[Return final response]
  HasCalls -- Yes --> Validate[Validate tool args by schema]
  Validate --> Execute[Execute handler]
  Execute --> ToolMsg[Append tool message]
  ToolMsg --> Chat1
```

## Головні модулі в SDK

- `src/agent/client.ts`
  - Клас `Agent`
  - Делегує базові операції провайдеру
  - Реалізує цикл `runWithTools` і `runWithMcpTools`

- `src/providers/*.ts`
  - Реалізації провайдерів
  - Мапінг request/response до єдиного контракту

- `src/http/client.ts`
  - Спільний HTTP шар (retry, timeout, middleware)

- `src/agent/mcp.ts`
  - MCP транспорт (`http`, `stdio`)
  - MCP runtime config helpers

- `src/types/types.ts`
  - Базові контракти SDK

## Дизайн-принципи

- Єдиний API для різних провайдерів
- Типобезпека через TypeScript strict
- Мінімум vendor lock-in
- Розширюваність через tools і MCP
