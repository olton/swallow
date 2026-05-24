# 05. Runtime Config: SKILLS AGENTS PROMPTS

## Навіщо це потрібно

Щоб завантажити всі runtime ресурси в одному місці:

- `mcpServers`
- `skills`
- `agents`
- `prompts`

## Формат JSON

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

## Завантаження з об'єкта

```ts
import { createMcpRuntimeFromConfig } from 'swallow';

const runtime = createMcpRuntimeFromConfig({
  mcpServers: {
    memory: {
      command: 'npx.cmd',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  },
  skills: {
    'check-security': {
      file: './skills/check-security/SKILL.md',
    },
  },
  agents: {
    Explore: {
      description: 'Read-only exploration',
    },
  },
  prompts: {
    triage: 'Summarize open defects by severity',
  },
});
```

## Завантаження з файлу

```ts
import { createMcpRuntimeFromJsonFile } from 'swallow';

const runtime = await createMcpRuntimeFromJsonFile('./runtime.config.json');
```

## Доступ до ресурсів

```ts
const memoryServer = runtime.mcpServers.memory;
const checkSecurity = runtime.skills['check-security'];
const exploreAgent = runtime.agents.Explore;
const triagePrompt = runtime.prompts.triage;
```

## Важливі деталі

- Підтримуються секції у uppercase: `SKILLS`, `AGENTS`, `PROMPTS`.
- Якщо `mcpServers` відсутній, повертається порожня мапа серверів.
- Валідація структури виконується при завантаженні JSON.
