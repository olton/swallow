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

interface AzureDeploymentListResponse {
  data?: Array<{
    id?: string;
    created?: number;
  }>;
  value?: Array<{
    id?: string;
    model?: string;
    created_at?: number;
  }>;
}

type EndpointKind = 'chat' | 'embeddings' | 'models';

export type OpenAiCompatibleProfile =
  | 'openai'
  | 'ollama'
  | 'lmstudio'
  | 'azure-openai'
  | 'custom';

export interface OpenAiCompatibleAdapter {
  profile: OpenAiCompatibleProfile;
  providerId: string;
  supportsModelListing: boolean;
  getAuthHeaders(options: OpenAiCompatibleProviderOptions): Record<string, string>;
  buildPath(kind: EndpointKind, modelName: string | undefined): string;
  transformChatBody?(body: Record<string, unknown>): Record<string, unknown>;
  transformEmbeddingBody?(body: Record<string, unknown>): Record<string, unknown>;
  mapModels?(json: unknown): ModelInfo[];
}

export interface OpenAiCompatibleProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  retry?: RetryPolicy;
  middlewares?: HttpMiddleware[];
  profile?: OpenAiCompatibleProfile;
  providerId?: string;
  apiVersion?: string;
  adapter?: OpenAiCompatibleAdapter;
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id: string;
  readonly capabilities = createCapabilities();

  private readonly client: HttpClient;
  private readonly adapter: OpenAiCompatibleAdapter;

  constructor(options: OpenAiCompatibleProviderOptions = {}) {
    this.adapter = options.adapter ?? createProfileAdapter(options);
    this.id = this.adapter.providerId;

    const baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const authHeaders = this.adapter.getAuthHeaders(options);

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
    const baseBody: Record<string, unknown> = {
      model: request.model,
      messages: mapMessages(request.messages),
      stream: false,
      ...mapChatOptions(request),
    };

    const body = this.adapter.transformChatBody ? this.adapter.transformChatBody(baseBody) : baseBody;

    const response = await this.client.request({
      method: 'POST',
      path: this.adapter.buildPath('chat', request.model),
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
    const baseBody: Record<string, unknown> = {
      model: request.model,
      messages: mapMessages(request.messages),
      stream: true,
      ...mapChatOptions(request),
    };

    const body = this.adapter.transformChatBody ? this.adapter.transformChatBody(baseBody) : baseBody;

    const response = await this.client.request({
      method: 'POST',
      path: this.adapter.buildPath('chat', request.model),
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
    const baseBody: Record<string, unknown> = {
      model: request.model,
      input: request.input,
    };

    const body = this.adapter.transformEmbeddingBody
      ? this.adapter.transformEmbeddingBody(baseBody)
      : baseBody;

    const json = await this.client.requestJson<OpenAiEmbeddingsResponse>({
      method: 'POST',
      path: this.adapter.buildPath('embeddings', request.model),
      body,
      ...(signal !== undefined ? { signal } : {}),
    });

    return {
      model: request.model,
      embeddings: (json.data ?? []).map((item) => item.embedding),
      raw: json,
    };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    if (!this.adapter.supportsModelListing) {
      throw new ProviderError(this.id, 'Model listing is not supported by this OpenAI-compatible profile');
    }

    const json = await this.client.requestJson<OpenAiModelsResponse | AzureDeploymentListResponse>({
      method: 'GET',
      path: this.adapter.buildPath('models', undefined),
      ...(signal !== undefined ? { signal } : {}),
    });

    if (this.adapter.mapModels) {
      return this.adapter.mapModels(json);
    }

    return (json.data ?? [])
      .filter((model): model is { id: string; created?: number } => typeof model.id === 'string')
      .map((model) => ({
        name: model.id,
        ...(model.created !== undefined ? { modifiedAt: new Date(model.created * 1000).toISOString() } : {}),
        raw: model,
      }));
  }
}

function createProfileAdapter(options: OpenAiCompatibleProviderOptions): OpenAiCompatibleAdapter {
  const profile = options.profile ?? 'custom';

  if (profile === 'azure-openai') {
    const apiVersion = options.apiVersion ?? '2024-10-21';
    const providerId = options.providerId ?? 'openai-compatible';

    return {
      profile,
      providerId,
      supportsModelListing: true,
      getAuthHeaders(currentOptions) {
        return currentOptions.apiKey !== undefined ? { 'api-key': currentOptions.apiKey } : {};
      },
      buildPath(kind, modelName) {
        if (kind === 'models') {
          return `/openai/deployments?api-version=${encodeURIComponent(apiVersion)}`;
        }

        if (!modelName) {
          throw new ProviderError(providerId, 'Azure OpenAI profile requires model as deployment name');
        }

        const deployment = encodeURIComponent(modelName);
        if (kind === 'chat') {
          return `/openai/deployments/${deployment}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
        }

        return `/openai/deployments/${deployment}/embeddings?api-version=${encodeURIComponent(apiVersion)}`;
      },
      transformChatBody(body) {
        const nextBody = { ...body };
        delete nextBody['model'];
        return nextBody;
      },
      transformEmbeddingBody(body) {
        const nextBody = { ...body };
        delete nextBody['model'];
        return nextBody;
      },
      mapModels(json) {
        return parseAzureDeployments(json);
      },
    };
  }

  const providerId = options.providerId ?? 'openai-compatible';
  return {
    profile,
    providerId,
    supportsModelListing: true,
    getAuthHeaders(currentOptions) {
      return currentOptions.apiKey !== undefined
        ? { Authorization: `Bearer ${currentOptions.apiKey}` }
        : {};
    },
    buildPath(kind) {
      if (kind === 'chat') {
        return '/chat/completions';
      }

      if (kind === 'embeddings') {
        return '/embeddings';
      }

      return '/models';
    },
  };
}

function parseAzureDeployments(json: unknown): ModelInfo[] {
  if (!isRecord(json)) {
    return [];
  }

  const models: ModelInfo[] = [];

  const value = json['value'];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item)) {
        continue;
      }

      const deploymentName =
        typeof item['id'] === 'string'
          ? item['id']
          : typeof item['model'] === 'string'
            ? item['model']
            : undefined;

      if (!deploymentName) {
        continue;
      }

      const created = typeof item['created_at'] === 'number' ? item['created_at'] : undefined;
      models.push({
        name: deploymentName,
        ...(created !== undefined ? { modifiedAt: new Date(created * 1000).toISOString() } : {}),
        raw: item,
      });
    }

    return models;
  }

  const data = json['data'];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!isRecord(item) || typeof item['id'] !== 'string') {
        continue;
      }

      const created = typeof item['created'] === 'number' ? item['created'] : undefined;
      models.push({
        name: item['id'],
        ...(created !== undefined ? { modifiedAt: new Date(created * 1000).toISOString() } : {}),
        raw: item,
      });
    }

    return models;
  }

  return models;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
