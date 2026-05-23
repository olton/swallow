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
  LlmProvider,
  ModelInfo,
  ToolCall,
  ToolCallDelta,
  ToolDefinition,
} from '../types/types.js';

interface OpenAiToolCall {
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface OpenAiChatResponse {
  model: string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: OpenAiToolCall[];
    };
  }>;
}

interface OpenAiChatChunk {
  model: string;
  choices?: Array<{
    finish_reason?: string;
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
}

interface OpenAiEmbeddingsResponse {
  data?: Array<{
    embedding: number[];
  }>;
}

interface OpenAiModelsResponse {
  data?: Array<{
    id: string;
    created?: number;
  }>;
}

export interface OpenAiCompatibleProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  retry?: RetryPolicy;
  middlewares?: HttpMiddleware[];
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id = 'openai-compatible';

  private readonly client: HttpClient;

  constructor(options: OpenAiCompatibleProviderOptions = {}) {
    const baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const authHeaders =
      options.apiKey !== undefined ? { Authorization: `Bearer ${options.apiKey}` } : {};

    const clientOptions = {
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
      ...mapChatOptions(request),
    };

    const response = await this.client.request({
      method: 'POST',
      path: '/chat/completions',
      body,
      ...(signal !== undefined ? { signal } : {}),
    });

    if (!response.ok) {
      const responseBody = await safeReadText(response);
      throw new HttpError(this.id, response.status, response.statusText, responseBody);
    }

    let json: OpenAiChatResponse;
    try {
      json = (await response.json()) as OpenAiChatResponse;
    } catch (error) {
      throw new ProviderError(this.id, 'Failed to parse JSON response', { cause: error });
    }

    const choice = json.choices?.[0];
    const toolCalls = mapToolCalls(choice?.message?.tool_calls);

    return {
      model: json.model,
      content: choice?.message?.content ?? '',
      done: true,
      ...(choice?.finish_reason !== undefined ? { finishReason: choice.finish_reason } : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      raw: json,
    };
  }

  async *chatStream(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatStreamChunk> {
    const body = {
      model: request.model,
      messages: mapMessages(request.messages),
      stream: true,
      ...mapChatOptions(request),
    };

    const response = await this.client.request({
      method: 'POST',
      path: '/chat/completions',
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
        if (!trimmed.startsWith('data:')) {
          continue;
        }

        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') {
          continue;
        }

        const chunk = parseJson<OpenAiChatChunk>(payload, this.id);
        const choice = chunk.choices?.[0];
        const toolCalls = mapToolCallDeltas(choice?.delta?.tool_calls);

        yield {
          model: chunk.model,
          delta: choice?.delta?.content ?? '',
          done: choice?.finish_reason !== undefined,
          ...(choice?.finish_reason !== undefined ? { finishReason: choice.finish_reason } : {}),
          ...(toolCalls.length > 0 ? { toolCalls } : {}),
          raw: chunk,
        };
      }
    }
  }

  async embed(request: EmbedRequest, signal?: AbortSignal): Promise<EmbedResponse> {
    const json = await this.client.requestJson<OpenAiEmbeddingsResponse>({
      method: 'POST',
      path: '/embeddings',
      body: {
        model: request.model,
        input: request.input,
      },
      ...(signal !== undefined ? { signal } : {}),
    });

    return {
      model: request.model,
      embeddings: (json.data ?? []).map((item) => item.embedding),
      raw: json,
    };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const json = await this.client.requestJson<OpenAiModelsResponse>({
      method: 'GET',
      path: '/models',
      ...(signal !== undefined ? { signal } : {}),
    });

    return (json.data ?? []).map((model) => ({
      name: model.id,
      ...(model.created !== undefined ? { modifiedAt: new Date(model.created * 1000).toISOString() } : {}),
      raw: model,
    }));
  }
}

function mapMessages(messages: LlmMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    const base: Record<string, unknown> = {
      role: message.role,
      content: message.content,
    };

    if (message.name !== undefined) {
      base['name'] = message.name;
    }

    if (message.role === 'tool' && message.toolCallId !== undefined) {
      base['tool_call_id'] = message.toolCallId;
    }

    if (message.role === 'assistant' && message.toolCalls !== undefined) {
      base['tool_calls'] = message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments: call.argumentsJson,
        },
      }));
    }

    return base;
  });
}

function mapChatOptions(request: ChatRequest): Record<string, unknown> {
  const options: Record<string, unknown> = {};

  if (request.temperature !== undefined) {
    options['temperature'] = request.temperature;
  }

  if (request.topP !== undefined) {
    options['top_p'] = request.topP;
  }

  if (request.maxTokens !== undefined) {
    options['max_tokens'] = request.maxTokens;
  }

  if (request.stop !== undefined) {
    options['stop'] = request.stop;
  }

  if (request.tools !== undefined) {
    options['tools'] = mapTools(request.tools);
  }

  if (request.toolChoice !== undefined) {
    options['tool_choice'] = request.toolChoice;
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

function mapToolCalls(calls: OpenAiToolCall[] | undefined): ToolCall[] {
  if (!calls) {
    return [];
  }

  return calls
    .filter((call) => call.function?.name !== undefined)
    .map((call, index) => {
      const id = call.id ?? `tool_call_${index}`;
      const name = call.function?.name ?? 'unknown_tool';
      const argumentsJson = call.function?.arguments ?? '{}';

      return {
        id,
        name,
        argumentsJson,
        type: 'function',
      };
    });
}

function mapToolCallDeltas(
  deltas:
    | Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>
    | undefined
): ToolCallDelta[] {
  if (!deltas) {
    return [];
  }

  return deltas.map((delta) => ({
    index: delta.index,
    ...(delta.id !== undefined ? { id: delta.id } : {}),
    ...(delta.type !== undefined ? { type: delta.type } : {}),
    ...(delta.function?.name !== undefined ? { name: delta.function.name } : {}),
    ...(delta.function?.arguments !== undefined ? { argumentsDelta: delta.function.arguments } : {}),
  }));
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
