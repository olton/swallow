const cards = Array.from(document.querySelectorAll('.provider-card[data-provider]'));

bootstrap().catch((error) => {
  const message = toErrorMessage(error);

  for (const card of cards) {
    const statusEl = card.querySelector('[data-role="status"]');
    if (statusEl) {
      statusEl.textContent = `Не вдалося отримати статус: ${message}`;
      statusEl.classList.add('status-missing');
    }
  }
});

async function bootstrap() {
  const response = await fetch('/api/providers');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  const providers = Array.isArray(payload.providers) ? payload.providers : [];
  const providerMap = new Map(providers.map((item) => [item.id, item]));

  for (const card of cards) {
    const providerId = card.dataset.provider;
    if (!providerId) {
      continue;
    }

    const statusEl = card.querySelector('[data-role="status"]');
    if (!statusEl) {
      continue;
    }

    const info = providerMap.get(providerId);
    if (!info) {
      statusEl.textContent = 'Провайдер недоступний у demo-server';
      statusEl.classList.add('status-missing');
      continue;
    }

    const missing = Array.isArray(info.missingRequired) ? info.missingRequired : [];

    if (info.configured) {
      statusEl.textContent = info.isDefault ? 'Сконфігуровано. Провайдер за замовчуванням.' : 'Сконфігуровано. Готово до демо.';
      statusEl.classList.add('status-ready');
      continue;
    }

    statusEl.textContent = `Потрібно заповнити env: ${missing.join(', ')}`;
    statusEl.classList.add('status-missing');
  }
}

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
