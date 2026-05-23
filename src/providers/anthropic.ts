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
  ToolChoice,
  ToolDefinition,
} from '../types/types.js';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: Array<Record<string, unknown>>;
}

interface AnthropicCreateMessageResponse {
  id?: string;
  model: string;
  stop_reason?: string | null;
  content?: Array<
    | {
        type: 'text';
        text?: string;
      }
    | {
        type: 'tool_use';
        id?: string;
        name?: string;
        input?: unknown;
      }
  >;
}

interface AnthropicModelsResponse {
  data?: Array<{
    id: string;
    created_at?: string;
  }>;
}

export interface AnthropicProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  apiVersion?: string;
  anthropicVersion?: string;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  retry?: RetryPolicy;
  middlewares?: HttpMiddleware[];
}

export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic';
  readonly capabilities = createCapabilities({
    embeddings: false,
  });

  private readonly client: HttpClient;

  constructor(options: AnthropicProviderOptions = {}) {
    const baseUrl = (options.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
    const version = options.anthropicVersion ?? options.apiVersion ?? '2023-06-01';

    const authHeaders = options.apiKey !== undefined ? { 'x-api-key': options.apiKey } : {};

    const clientOptions = {
      providerId: this.id,
      baseUrl,
      baseHeaders: {
        'anthropic-version': version,
        ...authHeaders,
        ...(options.headers ?? {}),
      },
      ...(options.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.retry !== undefined ? { retry: options.retry } : {}),
      ...(options.middlewares !== undefined ? { middlewares: options.middlewares } : {}),
    };

    this.client = new HttpClient(clientOptions);
  }

  async chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const payload = mapMessageRequest(request, false);

    const response = await this.client.request({
      method: 'POST',
      path: '/v1/messages',
      body: payload,
      ...(signal !== undefined ? { signal } : {}),
    });

    if (!response.ok) {
      const responseBody = await safeReadText(response);
      throw new HttpError(this.id, response.status, response.statusText, responseBody);
    }

    let json: AnthropicCreateMessageResponse;
    try {
      json = (await response.json()) as AnthropicCreateMessageResponse;
    } catch (error) {
      throw new ProviderError(this.id, 'Failed to parse JSON response', { cause: error });
    }

    const content = extractTextFromContentBlocks(json.content);
    const toolCalls = mapToolCallsFromContentBlocks(json.content);

    return {
      model: json.model,
      content,
      done: true,
      ...(json.stop_reason !== undefined && json.stop_reason !== null
        ? { finishReason: json.stop_reason }
        : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      raw: json,
    };
  }

  async *chatStream(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatStreamChunk> {
    const payload = mapMessageRequest(request, true);

    const response = await this.client.request({
      method: 'POST',
      path: '/v1/messages',
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
    const toolState = new Map<number, { id?: string; name?: string }>();

    let buffer = '';
    let model = request.model;
    let emittedDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const eventRaw of events) {
        const parsed = parseSseEvent(eventRaw.trim(), this.id);
        if (!parsed) {
          continue;
        }

        const eventType = parsed['type'];

        if (eventType === 'message_start' && isRecord(parsed['message']) && typeof parsed['message']['model'] === 'string') {
          model = parsed['message']['model'];
          continue;
        }

        if (eventType === 'content_block_start' && typeof parsed['index'] === 'number' && isRecord(parsed['content_block'])) {
          if (parsed['content_block']['type'] === 'tool_use') {
            const id = typeof parsed['content_block']['id'] === 'string' ? parsed['content_block']['id'] : undefined;
            const name =
              typeof parsed['content_block']['name'] === 'string' ? parsed['content_block']['name'] : undefined;
            const state = {
              ...(id !== undefined ? { id } : {}),
              ...(name !== undefined ? { name } : {}),
            };
            toolState.set(parsed['index'], state);

            yield {
              model,
              delta: '',
              done: false,
              ...(id !== undefined || name !== undefined
                ? {
                    toolCalls: [
                      {
                        index: parsed['index'],
                        ...(id !== undefined ? { id } : {}),
                        ...(name !== undefined ? { name } : {}),
                        type: 'function',
                      },
                    ],
                  }
                : {}),
              raw: parsed,
            };
          }

          continue;
        }

        if (eventType === 'content_block_delta' && isRecord(parsed['delta'])) {
          if (parsed['delta']['type'] === 'text_delta' && typeof parsed['delta']['text'] === 'string') {
            yield {
              model,
              delta: parsed['delta']['text'],
              done: false,
              raw: parsed,
            };
            continue;
          }

          if (
            parsed['delta']['type'] === 'input_json_delta' &&
            typeof parsed['delta']['partial_json'] === 'string' &&
            typeof parsed['index'] === 'number'
          ) {
            const state = toolState.get(parsed['index']);
            yield {
              model,
              delta: '',
              done: false,
              toolCalls: [
                {
                  index: parsed['index'],
                  ...(state?.id !== undefined ? { id: state.id } : {}),
                  ...(state?.name !== undefined ? { name: state.name } : {}),
                  argumentsDelta: parsed['delta']['partial_json'],
                  type: 'function',
                },
              ],
              raw: parsed,
            };
          }

          continue;
        }

        if (eventType === 'message_delta' && isRecord(parsed['delta'])) {
          const stopReason =
            typeof parsed['delta']['stop_reason'] === 'string' ? parsed['delta']['stop_reason'] : undefined;
          if (stopReason !== undefined && !emittedDone) {
            emittedDone = true;
            yield {
              model,
              delta: '',
              done: true,
              finishReason: stopReason,
              raw: parsed,
            };
          }

          continue;
        }

        if (eventType === 'message_stop' && !emittedDone) {
          emittedDone = true;
          yield {
            model,
            delta: '',
            done: true,
            raw: parsed,
          };
        }
      }
    }

    if (!emittedDone) {
      yield {
        model,
        delta: '',
        done: true,
      };
    }
  }

  async embed(_request: EmbedRequest, _signal?: AbortSignal): Promise<EmbedResponse> {
    throw new ProviderError(this.id, 'Embeddings are not supported by Anthropic Messages API');
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const json = await this.client.requestJson<AnthropicModelsResponse>({
      method: 'GET',
      path: '/v1/models',
      ...(signal !== undefined ? { signal } : {}),
    });

    return (json.data ?? []).map((model) => ({
      name: model.id,
      ...(model.created_at !== undefined ? { modifiedAt: model.created_at } : {}),
      raw: model,
    }));
  }
}

function mapMessageRequest(request: ChatRequest, stream: boolean): Record<string, unknown> {
  const mapped = mapMessages(request.messages);

  const body: Record<string, unknown> = {
    model: request.model,
    messages: mapped.messages,
    max_tokens: request.maxTokens ?? 1024,
    stream,
  };

  if (mapped.system !== undefined) {
    body['system'] = mapped.system;
  }

  if (request.temperature !== undefined) {
    body['temperature'] = request.temperature;
  }

  if (request.topP !== undefined) {
    body['top_p'] = request.topP;
  }

  if (request.stop !== undefined) {
    body['stop_sequences'] = request.stop;
  }

  const tools = request.tools ?? [];
  if (tools.length > 0 && request.toolChoice !== 'none') {
    body['tools'] = tools.map((tool) => ({
      name: tool.name,
      ...(tool.description !== undefined ? { description: tool.description } : {}),
      ...(tool.parameters !== undefined ? { input_schema: tool.parameters } : {}),
    }));

    const toolChoice = mapToolChoice(request.toolChoice);
    if (toolChoice !== undefined) {
      body['tool_choice'] = toolChoice;
    }
  }

  return body;
}

function mapMessages(messages: LlmMessage[]): { messages: AnthropicMessage[]; system?: string } {
  const mappedMessages: AnthropicMessage[] = [];
  const systemChunks: string[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content.trim()) {
        systemChunks.push(message.content);
      }
      continue;
    }

    if (message.role === 'tool') {
      if (!message.toolCallId) {
        throw new ProviderError('anthropic', 'Tool message requires toolCallId for Anthropic mapping');
      }

      mappedMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.toolCallId,
            content: message.content,
          },
        ],
      });
      continue;
    }

    if (message.role === 'assistant') {
      const contentBlocks: Array<Record<string, unknown>> = [];
      if (message.content.trim()) {
        contentBlocks.push({
          type: 'text',
          text: message.content,
        });
      }

      if (message.toolCalls && message.toolCalls.length > 0) {
        for (const call of message.toolCalls) {
          const parsedArgs = parseToolArgsObject(call.argumentsJson);
          contentBlocks.push({
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: parsedArgs,
          });
        }
      }

      if (contentBlocks.length > 0) {
        mappedMessages.push({
          role: 'assistant',
          content: contentBlocks,
        });
      }

      continue;
    }

    mappedMessages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: message.content,
        },
      ],
    });
  }

  return {
    messages: mappedMessages,
    ...(systemChunks.length > 0 ? { system: systemChunks.join('\n\n') } : {}),
  };
}

function mapToolChoice(toolChoice: ToolChoice | undefined): Record<string, unknown> | undefined {
  if (toolChoice === undefined || toolChoice === 'none') {
    return undefined;
  }

  if (toolChoice === 'auto') {
    return { type: 'auto' };
  }

  return {
    type: 'tool',
    name: toolChoice.function.name,
  };
}

function extractTextFromContentBlocks(contentBlocks: AnthropicCreateMessageResponse['content']): string {
  if (!contentBlocks) {
    return '';
  }

  return contentBlocks
    .filter(isTextContentBlock)
    .map((block) => block.text ?? '')
    .join('');
}

function mapToolCallsFromContentBlocks(contentBlocks: AnthropicCreateMessageResponse['content']): ToolCall[] {
  if (!contentBlocks) {
    return [];
  }

  return contentBlocks
    .filter(isToolUseContentBlock)
    .map((block, index) => ({
      id: block.id ?? `anthropic_tool_${index}`,
      name: block.name ?? 'unknown_tool',
      argumentsJson: safeStringify(block.input ?? {}),
      type: 'function',
    }));
}

function parseToolArgsObject(argumentsJson: string): Record<string, unknown> {
  if (!argumentsJson.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(argumentsJson) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
}

function parseSseEvent(chunk: string, providerId: string): Record<string, unknown> | null {
  if (!chunk) {
    return null;
  }

  const lines = chunk.split('\n');
  let data = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) {
      continue;
    }

    data += `${trimmed.slice(5).trim()}\n`;
  }

  const payload = data.trim();
  if (!payload || payload === '[DONE]') {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!isRecord(parsed)) {
      throw new Error('SSE event payload must be object');
    }

    return parsed;
  } catch (error) {
    throw new ProviderError(providerId, 'Failed to parse stream SSE payload', { cause: error });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTextContentBlock(
  block: NonNullable<AnthropicCreateMessageResponse['content']>[number]
): block is Extract<NonNullable<AnthropicCreateMessageResponse['content']>[number], { type: 'text' }> {
  return block.type === 'text';
}

function isToolUseContentBlock(
  block: NonNullable<AnthropicCreateMessageResponse['content']>[number]
): block is Extract<NonNullable<AnthropicCreateMessageResponse['content']>[number], { type: 'tool_use' }> {
  return block.type === 'tool_use';
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}
