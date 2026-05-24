# ENV Variables Reference

Окремий довідник по змінних середовища для Swallow SDK.

## Швидкий старт

1. Скопіюйте `.env.example` у `.env`.
2. Заповніть ключі тільки для тих провайдерів, які реально використовуєте.
3. Для локальної розробки з Ollama достатньо `OLLAMA_HOST`.

## Готові пресети .env (копіюй і запускай)

### 1) Only Ollama (локальна розробка)

```dotenv
DEMO_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=gemma4:8b
```

### 2) OpenAI Production

```dotenv
DEMO_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

### 3) Azure Enterprise Stack

```dotenv
DEMO_PROVIDER=azure-openai
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_BASE_URL=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini-prod
AZURE_OPENAI_API_VERSION=2024-10-21
```

### 4) Anthropic + Fallback to OpenAI-compatible

```dotenv
DEMO_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_VERSION=2023-06-01

# fallback endpoint for your app logic (optional)
OPENAI_COMPATIBLE_BASE_URL=http://localhost:11434/v1
OPENAI_COMPATIBLE_API_KEY=
```

Нотатка: fallback реалізується у коді застосунку (наприклад, через `createProvider(...)` + retry/alternate provider), а не автоматично лише через `.env`.

## Мінімум для кожного провайдера

| Provider          | Обов'язкові                                                                | Опційні                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Ollama (native)   | `OLLAMA_HOST`                                                              | `OLLAMA_MODEL`                                                                                                            |
| OpenAI-compatible | `OPENAI_COMPATIBLE_BASE_URL`                                               | `OPENAI_COMPATIBLE_API_KEY`, `OLLAMA_OPENAI_HOST`, `OLLAMA_OPENAI_MODEL`, `LMSTUDIO_OPENAI_HOST`, `LMSTUDIO_OPENAI_MODEL` |
| OpenAI            | `OPENAI_API_KEY`                                                           | `OPENAI_BASE_URL`, `OPENAI_MODEL`                                                                                         |
| Azure OpenAI      | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_BASE_URL`, `AZURE_OPENAI_DEPLOYMENT` | `AZURE_OPENAI_API_VERSION`                                                                                                |
| Anthropic         | `ANTHROPIC_API_KEY`                                                        | `ANTHROPIC_BASE_URL`, `ANTHROPIC_VERSION`                                                                                 |
| Gemini            | `GEMINI_API_KEY`                                                           | `GEMINI_BASE_URL`, `GEMINI_MODEL`                                                                                         |

## Demo Runtime

- `DEMO_HOST` - Хост для `npm run demo` (default: `127.0.0.1`).
- `DEMO_PORT` - Порт для `npm run demo` (default: `5177`).
- `DEMO_PROVIDER` - Дефолтний провайдер демо (default: `ollama`).

## Ollama

- `OLLAMA_HOST` - URL native Ollama API (default: `http://localhost:11434`).
- `OLLAMA_MODEL` - Модель для `npm run test:live` (опційно).

## OpenAI-Compatible

- `OPENAI_COMPATIBLE_BASE_URL` - Базовий URL для OpenAI-compatible endpoint.
- `OPENAI_COMPATIBLE_API_KEY` - API ключ для OpenAI-compatible endpoint (якщо потрібен).
- `OLLAMA_OPENAI_HOST` - OpenAI-compatible endpoint Ollama для live tests (default: `http://localhost:11434/v1`).
- `OLLAMA_OPENAI_MODEL` - Фіксована модель для OpenAI-compatible Ollama тесту (опційно).
- `LMSTUDIO_OPENAI_HOST` - OpenAI-compatible endpoint LM Studio (default: `http://localhost:1234/v1`).
- `LMSTUDIO_OPENAI_MODEL` - Фіксована модель для LM Studio тесту (опційно).

## OpenAI (Native)

- `OPENAI_API_KEY` - API ключ для `OpenAiProvider`.
- `OPENAI_BASE_URL` - Override базового URL (default: `https://api.openai.com/v1`).
- `OPENAI_MODEL` - Модель для live test (опційно).

## Azure OpenAI (Native)

- `AZURE_OPENAI_API_KEY` - API ключ.
- `AZURE_OPENAI_BASE_URL` - Endpoint ресурсу, приклад: `https://your-resource.openai.azure.com`.
- `AZURE_OPENAI_DEPLOYMENT` - Deployment name (використовується як model).
- `AZURE_OPENAI_API_VERSION` - API version (default: `2024-10-21`).

## Anthropic

- `ANTHROPIC_API_KEY` - API ключ.
- `ANTHROPIC_BASE_URL` - Override URL (default: `https://api.anthropic.com`).
- `ANTHROPIC_VERSION` - Версія API заголовка (default: `2023-06-01`).

## Gemini

- `GEMINI_API_KEY` - API ключ.
- `GEMINI_BASE_URL` - Override URL (default: `https://generativelanguage.googleapis.com`).
- `GEMINI_MODEL` - Модель для live test (default у тестах: `gemini-2.5-flash`).

## External MCP (опційно)

- `MCP_SERVER_URL` - URL зовнішнього MCP сервера.
- `MCP_BEARER_TOKEN` - Bearer token для авторизації на MCP сервері.

## Нотатки по безпеці

- Не комітьте реальні ключі в репозиторій.
- Для production використовуйте секрети CI/CD або secret manager.
- Для локальної розробки тримайте `.env` у `.gitignore`.

## Джерело істини

Актуальний шаблон значень і дефолтів: `/.env.example`.
