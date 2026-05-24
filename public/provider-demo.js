const chatEl = document.getElementById('chat');
const formEl = document.getElementById('chatForm');
const inputEl = document.getElementById('messageInput');
const modelEl = document.getElementById('modelSelect');
const sendEl = document.getElementById('sendButton');
const templateEl = document.getElementById('messageTemplate');
const providerBadgeEl = document.getElementById('providerBadge');
const providerHintEl = document.getElementById('providerHint');

const providerId = document.body.dataset.providerId ?? 'ollama';
const providerName = document.body.dataset.providerName ?? 'Unknown Provider';
const providerHint = document.body.dataset.providerHint ?? 'Використовуйте цю сторінку для smoke-test чату.';

const messages = [];

if (providerBadgeEl) {
  providerBadgeEl.textContent = providerName;
}

if (providerHintEl) {
  providerHintEl.textContent = providerHint;
}

bootstrap().catch((error) => {
  appendMessage('assistant', `Помилка ініціалізації: ${toErrorMessage(error)}`);
});

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();

  const content = inputEl.value.trim();
  if (!content) {
    return;
  }

  const model = modelEl.value;
  if (!model) {
    appendMessage('assistant', 'Немає доступної моделі. Перевірте налаштування провайдера/бекенду.');
    return;
  }

  inputEl.value = '';
  appendMessage('user', content);
  messages.push({ role: 'user', content });

  sendEl.disabled = true;
  const assistantMsg = appendMessage('assistant', '');
  setAssistantWaiting(assistantMsg, true);

  try {
    await streamAssistantMessage({
      model,
      messages,
      assistantMsg,
    });

    messages.push({
      role: 'assistant',
      content: assistantMsg.querySelector('.message-content')?.textContent ?? '',
    });
  } catch (error) {
    const current = assistantMsg.querySelector('.message-content')?.textContent ?? '';
    const suffix = `\n\n[помилка] ${toErrorMessage(error)}`;
    const contentEl = assistantMsg.querySelector('.message-content');
    if (contentEl) {
      contentEl.textContent = `${current}${suffix}`.trim();
    }
  } finally {
    setAssistantWaiting(assistantMsg, false);
    sendEl.disabled = false;
    inputEl.focus();
  }
});

async function bootstrap() {
  appendMessage(
    'assistant',
    `Демо для ${providerName}. Якщо демо-сервер працює з іншим провайдером, оновіть його конфігурацію перед тестом.`,
  );

  await loadModels();
}

async function loadModels() {
  modelEl.disabled = true;
  modelEl.innerHTML = '';

  const response = await fetch(`/api/models?provider=${encodeURIComponent(providerId)}`);
  if (!response.ok) {
    throw new Error(`Не вдалося завантажити моделі: HTTP ${response.status}`);
  }

  const data = await response.json();
  const models = Array.isArray(data.models) ? data.models : [];

  if (models.length === 0) {
    const empty = document.createElement('option');
    empty.textContent = 'Моделі не знайдено';
    empty.value = '';
    modelEl.appendChild(empty);
    return;
  }

  for (const model of models) {
    const option = document.createElement('option');
    option.value = model.name;
    option.textContent = model.name;
    modelEl.appendChild(option);
  }

  modelEl.disabled = false;
}

async function streamAssistantMessage({ model, messages, assistantMsg }) {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, provider: providerId, temperature: 0.4 }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Помилка стріму: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const contentEl = assistantMsg.querySelector('.message-content');
  if (!contentEl) {
    throw new Error('Не знайдено елемент для виводу відповіді');
  }

  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const eventRaw of events) {
      const line = eventRaw.split('\n').find((part) => part.startsWith('data:'));

      if (!line) {
        continue;
      }

      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') {
        continue;
      }

      const parsed = JSON.parse(payload);
      if (parsed.error) {
        throw new Error(String(parsed.error));
      }

      if (typeof parsed.delta === 'string' && parsed.delta.length > 0) {
        contentEl.textContent += parsed.delta;
        chatEl.scrollTop = chatEl.scrollHeight;
      }
    }
  }
}

function appendMessage(role, content) {
  const fragment = templateEl.content.cloneNode(true);
  const messageEl = fragment.querySelector('.message');
  const roleEl = fragment.querySelector('.message-role');
  const contentEl = fragment.querySelector('.message-content');

  if (!(messageEl instanceof HTMLElement) || !(roleEl instanceof HTMLElement) || !(contentEl instanceof HTMLElement)) {
    throw new Error('Помилка шаблону повідомлень');
  }

  messageEl.classList.add(role);
  roleEl.textContent = role === 'user' ? 'Ви' : 'Асистент';
  contentEl.textContent = content;

  chatEl.appendChild(fragment);
  chatEl.scrollTop = chatEl.scrollHeight;

  return chatEl.lastElementChild;
}

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function setAssistantWaiting(messageEl, isWaiting) {
  if (!(messageEl instanceof HTMLElement)) {
    return;
  }

  messageEl.classList.toggle('is-waiting', isWaiting);
}
