import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Agent, OllamaProvider } from '../dist/index.js';

const HOST = process.env.DEMO_HOST ?? '127.0.0.1';
const PORT = Number(process.env.DEMO_PORT ?? 5177);
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');

const provider = new OllamaProvider({ host: OLLAMA_HOST });
const agent = new Agent(provider);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    if (!req.url) {
      respondJson(res, 400, { error: 'Missing URL' });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? `${HOST}:${PORT}`}`);

    if (req.method === 'GET' && url.pathname === '/api/models') {
      const models = await agent.listModels();
      respondJson(res, 200, { models });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const payload = await readJsonBody(req);
      const response = await agent.chat({
        model: String(payload.model ?? ''),
        messages: normalizeMessages(payload.messages),
        ...(payload.temperature !== undefined ? { temperature: Number(payload.temperature) } : {}),
      });

      respondJson(res, 200, response);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/chat/stream') {
      const payload = await readJsonBody(req);
      const model = String(payload.model ?? '');
      const messages = normalizeMessages(payload.messages);

      if (!model || messages.length === 0) {
        respondJson(res, 400, { error: 'model and messages are required' });
        return;
      }

      const abortController = new AbortController();
      req.on('close', () => {
        abortController.abort();
      });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });

      try {
        for await (const chunk of agent.stream(
          {
            model,
            messages,
            ...(payload.temperature !== undefined ? { temperature: Number(payload.temperature) } : {}),
          },
          abortController.signal
        )) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        if (!abortController.signal.aborted) {
          const message = error instanceof Error ? error.message : String(error);
          res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
          res.end();
        }
      }

      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      respondJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    await serveStatic(url.pathname, res, req.method === 'HEAD');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    respondJson(res, 500, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Demo chat is running at http://${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`Using Ollama host: ${OLLAMA_HOST}`);
});

async function serveStatic(urlPath, res, isHead) {
  const normalizedPath = urlPath === '/' ? '/index.html' : urlPath;
  const sanitizedPath = path.normalize(normalizedPath).replace(/^\.\.(\/|\\|$)+/, '');
  const filePath = path.resolve(publicDir, `.${sanitizedPath}`);

  if (!filePath.startsWith(publicDir)) {
    respondJson(res, 403, { error: 'Forbidden' });
    return;
  }

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    respondJson(res, 404, { error: 'Not found' });
    return;
  }

  if (fileStat.isDirectory()) {
    respondJson(res, 404, { error: 'Not found' });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': fileStat.size,
    'Cache-Control': 'no-cache',
  });

  if (isHead) {
    res.end();
    return;
  }

  const content = await readFile(filePath);
  res.end(content);
}

function respondJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function normalizeMessages(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const role = String(item.role ?? 'user');
      const content = String(item.content ?? '');
      return { role, content };
    })
    .filter((message) => message.content.length > 0);
}
