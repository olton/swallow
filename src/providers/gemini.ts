import { HttpError, ProviderError } from '../errors/index.js';
import { HttpClient } from '../http/client.js';
import type { HttpMiddleware, RetryPolicy } from '../http/client.js';
import { createCapabilities } from './capabilities.js';
import type {
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  EmbedRequest,
  EmbedResponse,
  LlmMessage,
  LlmProvider,
  ModelInfo,
  ToolCall,
  ToolCallDelta,
  ToolDefinition,
} from '../types/types.js';

interface GeminiGenerateResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: {
          name?: string;
          args?: unknown;
        };
      }>;
    };
  }>;
  modelVersion?: string;
}

interface GeminiEmbedResponse {
  embedding?: {
    values?: number[];
  };
}

interface GeminiModelsResponse {
  models?: Array<{
    name?: string;
    version?: string;
    displayName?: string;
    description?: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    supportedGenerationMethods?: string[];
  }>;
}

export interface GeminiProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  retry?: RetryPolicy;
  middlewares?: HttpMiddleware[];
}

export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini';
  readonly capabilities = createCapabilities({
    toolStreaming: true,
  });

  private readonly client: HttpClient;

  constructor(options: GeminiProviderOptions = {}) {
    const baseUrl = (options.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    const authHeaders = options.apiKey !== undefined ? { 'x-goog-api-key': options.apiKey } : {};

    this.client = new HttpClient({
      providerId: this.id,
      baseUrl,
      baseHeaders: {
        ...authHeaders,
        ...(options.headers ?? {}),
      },
      ...(options.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.retry !== undefined ? { retry: options.retry } : {}),
      ...(options.middlewares !== undefined ? { middlewares: options.middlewares } : {}),
    });
  }

  async chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const modelName = normalizeModelName(request.model);
    const payload = mapGenerateRequest(request, false);

    const response = await this.client.request({
      method: 'POST',
      path: `/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
      body: payload,
      ...(signal !== undefined ? { signal } : {}),
    });

    if (!response.ok) {
      const responseBody = await safeReadText(response);
      throw new HttpError(this.id, response.status, response.statusText, responseBody);
    }

    let json: GeminiGenerateResponse;
    try {
      json = (await response.json()) as GeminiGenerateResponse;
    } catch (error) {
      throw new ProviderError(this.id, 'Failed to parse JSON response', { cause: error });
    }

    const candidate = json.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    const content = parts
      .map((part) => part.text ?? '')
      .filter((text) => text.length > 0)
      .join('');

    const toolCalls = mapGeminiFunctionCalls(parts);

    return {
      model: request.model,
      content,
      done: true,
      ...(candidate?.finishReason !== undefined ? { finishReason: candidate.finishReason } : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      raw: json,
    };
  }

  async *chatStream(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatStreamChunk> {
    const modelName = normalizeModelName(request.model);
    const payload = mapGenerateRequest(request, true);

    const response = await this.client.request({
      method: 'POST',
      path: `/v1beta/models/${encodeURIComponent(modelName)}:streamGenerateContent`,
      body: payload,
      ...(signal !== undefined ? { signal } : {}),
    });

    if (!response.ok) {
      const responseBody = await safeReadText(response);
      throw new HttpError(this.id, response.status, response.statusText, responseBody);
    }

    if (!response.body) {
      throw new ProviderError(this.id, 'Streaming response has no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        const payloadLine = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
        if (!payloadLine || payloadLine === '[DONE]') {
          continue;
        }

        const json = parseJson<GeminiGenerateResponse>(payloadLine, this.id);
        const candidate = json.candidates?.[0];
        const parts = candidate?.content?.parts ?? [];

        const delta = parts
          .map((part) => part.text ?? '')
          .filter((text) => text.length > 0)
          .join('');

        const toolCalls = mapGeminiFunctionCallDeltas(parts);

        yield {
          model: request.model,
          delta,
          done: candidate?.finishReason !== undefined,
          ...(candidate?.finishReason !== undefined ? { finishReason: candidate.finishReason } : {}),
          ...(toolCalls.length > 0 ? { toolCalls } : {}),
          raw: json,
        };
      }
    }
  }

  async embed(request: EmbedRequest, signal?: AbortSignal): Promise<EmbedResponse> {
    const modelName = normalizeModelName(request.model);
    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    const embeddings: number[][] = [];

    for (const input of inputs) {
      const response = await this.client.request({
        method: 'POST',
        path: `/v1beta/models/${encodeURIComponent(modelName)}:embedContent`,
        body: {
          content: {
            parts: [{ text: input }],
          },
        },
        ...(signal !== undefined ? { signal } : {}),
      });

      if (!response.ok) {
        const responseBody = await safeReadText(response);
        throw new HttpError(this.id, response.status, response.statusText, responseBody);
      }

      let json: GeminiEmbedResponse;
      try {
        json = (await response.json()) as GeminiEmbedResponse;
      } catch (error) {
        throw new ProviderError(this.id, 'Failed to parse embedding JSON response', { cause: error });
      }

      embeddings.push(json.embedding?.values ?? []);
    }

    return {
      model: request.model,
      embeddings,
    };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const json = await this.client.requestJson<GeminiModelsResponse>({
      method: 'GET',
      path: '/v1beta/models',
      ...(signal !== undefined ? { signal } : {}),
    });

    return (json.models ?? [])
      .filter((model) => typeof model.name === 'string')
      .map((model) => ({
        name: model.name ?? 'unknown',
        raw: model,
      }));
  }
}

function normalizeModelName(model: string): string {
  return model.startsWith('models/') ? model.slice('models/'.length) : model;
}

function mapGenerateRequest(request: ChatRequest, stream: boolean): Record<string, unknown> {
  const mappedMessages = mapMessages(request.messages);

  const body: Record<string, unknown> = {
    contents: mappedMessages.contents,
    generationConfig: {
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.topP !== undefined ? { topP: request.topP } : {}),
      ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
      ...(request.stop !== undefined ? { stopSequences: request.stop } : {}),
    },
    ...(stream ? { stream: true } : {}),
  };

  if (mappedMessages.systemInstruction !== undefined) {
    body['systemInstruction'] = mappedMessages.systemInstruction;
  }

  if (request.tools && request.tools.length > 0 && request.toolChoice !== 'none') {
    body['tools'] = [
      {
        functionDeclarations: request.tools.map((tool) => ({
          name: tool.name,
          ...(tool.description !== undefined ? { description: tool.description } : {}),
          ...(tool.parameters !== undefined
            ? { parameters: normalizeSchemaForGemini(tool.parameters) }
            : {}),
        })),
      },
    ];
  }

  return body;
}

function mapMessages(messages: LlmMessage[]): {
  contents: Array<Record<string, unknown>>;
  systemInstruction?: Record<string, unknown>;
} {
  const contents: Array<Record<string, unknown>> = [];
  const systemParts: Array<Record<string, unknown>> = [];

  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content.trim()) {
        systemParts.push({ text: message.content });
      }
      continue;
    }

    if (message.role === 'tool') {
      const part: Record<string, unknown> = {
        functionResponse: {
          name: message.name ?? message.toolCallId ?? 'tool',
          response: {
            content: message.content,
          },
        },
      };

      contents.push({
        role: 'user',
        parts: [part],
      });
      continue;
    }

    if (message.role === 'assistant') {
      const parts: Array<Record<string, unknown>> = [];

      if (message.content.trim()) {
        parts.push({ text: message.content });
      }

      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          parts.push({
            functionCall: {
              name: toolCall.name,
              args: parseToolArgsObject(toolCall.argumentsJson),
            },
          });
        }
      }

      if (parts.length > 0) {
        contents.push({
          role: 'model',
          parts,
        });
      }
      continue;
    }

    contents.push({
      role: 'user',
      parts: [{ text: message.content }],
    });
  }

  return {
    contents,
    ...(systemParts.length > 0
      ? {
          systemInstruction: {
            parts: systemParts,
          },
        }
      : {}),
  };
}

function mapGeminiFunctionCalls(
  parts: Array<{ text?: string; functionCall?: { name?: string; args?: unknown } }>
): ToolCall[] {
  const calls: ToolCall[] = [];

  for (const [index, part] of parts.entries()) {
    if (!part.functionCall?.name) {
      continue;
    }

    calls.push({
      id: `gemini_tool_call_${index}`,
      name: part.functionCall.name,
      argumentsJson: safeStringify(part.functionCall.args ?? {}),
      type: 'function',
    });
  }

  return calls;
}

function mapGeminiFunctionCallDeltas(
  parts: Array<{ text?: string; functionCall?: { name?: string; args?: unknown } }>
): ToolCallDelta[] {
  const deltas: ToolCallDelta[] = [];

  for (const [index, part] of parts.entries()) {
    if (!part.functionCall?.name) {
      continue;
    }

    deltas.push({
      index,
      id: `gemini_tool_call_${index}`,
      name: part.functionCall.name,
      argumentsDelta: safeStringify(part.functionCall.args ?? {}),
      type: 'function',
    });
  }

  return deltas;
}

function parseToolArgsObject(argumentsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argumentsJson) as unknown;
    if (isRecord(parsed)) {
      return parsed;
    }

    return {};
  } catch {
    return {};
  }
}

function parseJson<T>(line: string, providerId: string): T {
  try {
    return JSON.parse(line) as T;
  } catch (error) {
    throw new ProviderError(providerId, 'Failed to parse stream JSON chunk', { cause: error });
  }
}

function normalizeSchemaForGemini(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSchemaForGemini(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, itemValue] of Object.entries(value)) {
    if (key === 'type' && typeof itemValue === 'string') {
      out[key] = itemValue.toUpperCase();
      continue;
    }

    out[key] = normalizeSchemaForGemini(itemValue);
  }

  return out;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}
