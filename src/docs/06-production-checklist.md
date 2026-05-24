# 06. Production Checklist

## Конфігурація і секрети

- Тримайте API keys тільки в env/secret store.
- Не логайте токени у telemetry.
- Розділяйте dev/stage/prod env.

## Надійність

- Встановіть `timeoutMs` для провайдерів.
- Налаштуйте `retry` політику.
- Обробляйте `SdkError`, `HttpError`, `ProviderError` централізовано.

## Performance

- Використовуйте streaming у UI для кращого UX.
- Додавайте кеш для `listModels` (де це доречно).
- Не викликайте embeddings без потреби.

## Tool Security

- Для `runWithTools` завжди задавайте schema (`parameters`).
- Не виконуйте небезпечні дії у handler без перевірок.
- Логайте audit trail tool-викликів.

## MCP Security

- Для HTTP MCP використовуйте auth headers.
- Для stdio MCP запускайте лише довірені команди.
- В production обмежуйте доступ до файлової системи/мережі для MCP process.

## Тестування

- Unit tests: бізнес-логіка tools/handlers.
- Contract tests: мапінг provider response -> SDK типи.
- Live tests: smoke для критичних провайдерів.

## Операційні метрики

- latency (chat, stream first token, full response)
- error rate по провайдерах
- retries/timeouts
- tool call success/failure

## Типовий rollout-план

1. Додайте фічу з одним провайдером.
2. Додайте fallback провайдер.
3. Включіть telemetry та алерти.
4. Запустіть canary rollout.
5. Перевірте SLO і тільки після цього масштабуйте.
