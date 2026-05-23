import { HttpError, ProviderError } from '../errors/index.js';
import { HttpClient } from '../http/client.js';
import type { HttpMiddleware, RetryPolicy } from '../http/client.js';
import type {
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  EmbedRequest,
  EmbedResponse,
  LlmMessage,
  ModelInfo,
  LlmProvider,
  ToolCall,
  ToolDefinition,
} from '../types/types.js';

interface OllamaChatChunk {
  model: string;
  done: boolean;
  message?: {
    role: string;
    content: string;
    tool_calls?: Array<{
      function?: {
        name?: string;
        arguments?: unknown;
      };
    }>;
  };
  done_reason?: string;
}

interface OllamaEmbedResult {
  model?: string;
  embeddings?: number[][];
}

interface OllamaTagsResponse {
  models?: Array<{
    name: string;
    size?: number;
    modified_at?: string;
  }>;
}

export interface OllamaProviderOptions {
  host?: string;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  retry?: RetryPolicy;
  middlewares?: HttpMiddleware[];
}

export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama';

  private readonly client: HttpClient;

  constructor(options: OllamaProviderOptions = {}) {
    const baseUrl = (options.host ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
    const clientOptions = {
      providerId: this.id,
      baseUrl,
      ...(options.headers !== undefined ? { baseHeaders: options.headers } : {}),
      ...(options.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.retry !== undefined ? { retry: options.retry } : {}),
      ...(options.middlewares !== undefined ? { middlewares: options.middlewares } : {}),
    };

    this.client = new HttpClient({
      ...clientOptions,
    });
  }

  async chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const body = {
      model: request.model,
      messages: mapMessages(request.messages),
      stream: false,
      options: mapOptions(request),
      ...(request.tools !== undefined ? { tools: mapTools(request.tools) } : {}),
    };

    const response = await this.requestJson<OllamaChatChunk>('/api/chat', body, signal);
    const toolCalls = mapToolCalls(response.message?.tool_calls);

    return {
      model: response.model,
      content: response.message?.content ?? '',
      done: response.done,
      ...(response.done_reason !== undefined ? { finishReason: response.done_reason } : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      raw: response,
    };
  }

  async *chatStream(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatStreamChunk> {
    const body = {
      model: request.model,
      messages: mapMessages(request.messages),
      stream: true,
      options: mapOptions(request),
      ...(request.tools !== undefined ? { tools: mapTools(request.tools) } : {}),
    };

    const response = await this.client.request({
      method: 'POST',
      path: '/api/chat',
      body,
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

        const chunk = parseJson<OllamaChatChunk>(trimmed, this.id);
        yield {
          model: chunk.model,
          delta: chunk.message?.content ?? '',
          done: chunk.done,
          ...(chunk.done_reason !== undefined ? { finishReason: chunk.done_reason } : {}),
          raw: chunk,
        };
      }
    }

    const tail = buffer.trim();
    if (tail) {
      const chunk = parseJson<OllamaChatChunk>(tail, this.id);
      yield {
        model: chunk.model,
        delta: chunk.message?.content ?? '',
        done: chunk.done,
        ...(chunk.done_reason !== undefined ? { finishReason: chunk.done_reason } : {}),
        raw: chunk,
      };
    }
  }

  async embed(request: EmbedRequest, signal?: AbortSignal): Promise<EmbedResponse> {
    const body = {
      model: request.model,
      input: request.input,
    };

    const response = await this.requestJson<OllamaEmbedResult>('/api/embed', body, signal);

    return {
      model: response.model ?? request.model,
      embeddings: response.embeddings ?? [],
      raw: response,
    };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const response = await this.requestJson<OllamaTagsResponse>('/api/tags', undefined, signal, 'GET');

    return (response.models ?? []).map((model) => ({
      name: model.name,
      ...(model.size !== undefined ? { size: model.size } : {}),
      ...(model.modified_at !== undefined ? { modifiedAt: model.modified_at } : {}),
      raw: model,
    }));
  }

  private async requestJson<T>(
    path: string,
    payload: unknown,
    signal?: AbortSignal,
    method: 'POST' | 'GET' = 'POST'
  ): Promise<T> {
    const response = await this.client.request({
      method,
      path,
      ...(method !== 'GET' ? { body: payload } : {}),
      ...(signal !== undefined ? { signal } : {}),
    });

    if (!response.ok) {
      const responseBody = await safeReadText(response);
      throw new HttpError(this.id, response.status, response.statusText, responseBody);
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new ProviderError(this.id, 'Failed to parse JSON response', { cause: error });
    }
  }
}

function mapMessages(messages: LlmMessage[]): Array<{ role: string; content: string; name?: string }> {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.name !== undefined ? { name: message.name } : {}),
  }));
}

function mapOptions(request: ChatRequest): Record<string, unknown> {
  const options: Record<string, unknown> = {};

  if (request.temperature !== undefined) {
    options['temperature'] = request.temperature;
  }

  if (request.topP !== undefined) {
    options['top_p'] = request.topP;
  }

  if (request.maxTokens !== undefined) {
    options['num_predict'] = request.maxTokens;
  }

  if (request.stop !== undefined) {
    options['stop'] = request.stop;
  }

  return options;
}

function mapTools(tools: ToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      ...(tool.description !== undefined ? { description: tool.description } : {}),
      ...(tool.parameters !== undefined ? { parameters: tool.parameters } : {}),
    },
  }));
}

function mapToolCalls(
  calls:
    | Array<{
        function?: {
          name?: string;
          arguments?: unknown;
        };
      }>
    | undefined
): ToolCall[] {
  if (!calls) {
    return [];
  }

  return calls
    .filter((call) => call.function?.name !== undefined)
    .map((call, index) => {
      const argumentsJson = safeStringify(call.function?.arguments ?? {});
      return {
        id: `ollama_tool_call_${index}`,
        name: call.function?.name ?? 'unknown_tool',
        argumentsJson,
        type: 'function',
      };
    });
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

function parseJson<T>(line: string, providerId: string): T {
  try {
    return JSON.parse(line) as T;
  } catch (error) {
    throw new ProviderError(providerId, 'Failed to parse stream JSON chunk', { cause: error });
  }
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}
