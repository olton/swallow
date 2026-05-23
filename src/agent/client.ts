import type {
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  EmbedRequest,
  EmbedResponse,
  LlmProvider,
  LlmMessage,
  ModelInfo,
  RunWithToolsResult,
  ToolHandler,
  ToolDefinition,
} from '../types/types.js';
import { SdkError } from '../errors/index.js';
import { validateToolArguments } from './tool-arguments-validator.js';
import type { ValidateFunction } from 'ajv';

export class Agent {
  constructor(private readonly provider: LlmProvider) {}

  get providerId(): string {
    return this.provider.id;
  }

  async chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    return this.provider.chat(request, signal);
  }

  stream(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatStreamChunk> {
    return this.provider.chatStream(request, signal);
  }

  async embed(request: EmbedRequest, signal?: AbortSignal): Promise<EmbedResponse> {
    return this.provider.embed(request, signal);
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    return this.provider.listModels(signal);
  }

  async runWithTools(
    request: ChatRequest,
    handlers: Record<string, ToolHandler>,
    options?: {
      maxIterations?: number;
      signal?: AbortSignal;
    }
  ): Promise<RunWithToolsResult> {
    if (!request.tools || request.tools.length === 0) {
      throw new SdkError('runWithTools requires at least one tool definition in request.tools');
    }

    const maxIterations = options?.maxIterations ?? 8;
    const messages: LlmMessage[] = [...request.messages];
    const toolExecutions: RunWithToolsResult['toolExecutions'] = [];
    const validatorCache = new Map<string, ValidateFunction>();
    const toolMap = new Map<string, ToolDefinition>(request.tools.map((tool) => [tool.name, tool]));

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const response = await this.provider.chat(
        {
          ...request,
          messages,
        },
        options?.signal
      );

      messages.push({
        role: 'assistant',
        content: response.content,
        ...(response.toolCalls !== undefined ? { toolCalls: response.toolCalls } : {}),
      });

      if (!response.toolCalls || response.toolCalls.length === 0) {
        return {
          final: response,
          messages,
          toolExecutions,
        };
      }

      for (const toolCall of response.toolCalls) {
        const handler = handlers[toolCall.name];
        if (!handler) {
          throw new SdkError(`No handler registered for tool: ${toolCall.name}`);
        }

        const toolDefinition = toolMap.get(toolCall.name);
        if (!toolDefinition) {
          throw new SdkError(`Tool '${toolCall.name}' was called by model but not present in request.tools`);
        }

        const args = parseToolArguments(toolCall.argumentsJson);
        validateToolArguments(toolDefinition, args, validatorCache);
        const result = await handler(args, {
          call: toolCall,
          iteration,
        });

        toolExecutions.push({
          id: toolCall.id,
          name: toolCall.name,
          result,
        });

        messages.push({
          role: 'tool',
          content: serializeToolResult(result),
          toolCallId: toolCall.id,
          name: toolCall.name,
        });
      }
    }

    throw new SdkError(`runWithTools exceeded maxIterations=${maxIterations}`);
  }
}

function parseToolArguments(argumentsJson: string): unknown {
  if (!argumentsJson.trim()) {
    return {};
  }

  try {
    return JSON.parse(argumentsJson) as unknown;
  } catch (error) {
    throw new SdkError('Tool arguments are not valid JSON', { cause: error });
  }
}

function serializeToolResult(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }

  try {
    return JSON.stringify(result);
  } catch (error) {
    throw new SdkError('Tool result is not JSON-serializable', { cause: error });
  }
}
