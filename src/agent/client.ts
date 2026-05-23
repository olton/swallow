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
import { createMcpToolSuite } from './mcp.js';
import type { McpToolClient } from './mcp.js';
import { validateToolArguments } from './tool-validator.js';
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

  async runWithMcpTools(
    request: ChatRequest,
    mcpClient: McpToolClient,
    options?: {
      handlers?: Record<string, ToolHandler>;
      maxIterations?: number;
      signal?: AbortSignal;
    }
  ): Promise<RunWithToolsResult> {
    const mcpSuite = await createMcpToolSuite(mcpClient, options?.signal);
    const mergedTools = mergeTools(request.tools ?? [], mcpSuite.tools);
    const mergedHandlers = {
      ...mcpSuite.handlers,
      ...(options?.handlers ?? {}),
    };

    return this.runWithTools(
      {
        ...request,
        tools: mergedTools,
      },
      mergedHandlers,
      {
        ...(options?.maxIterations !== undefined ? { maxIterations: options.maxIterations } : {}),
        ...(options?.signal !== undefined ? { signal: options.signal } : {}),
      }
    );
  }
}

function mergeTools(primaryTools: ToolDefinition[], secondaryTools: ToolDefinition[]): ToolDefinition[] {
  const merged = new Map<string, ToolDefinition>();

  for (const tool of secondaryTools) {
    merged.set(tool.name, tool);
  }

  for (const tool of primaryTools) {
    merged.set(tool.name, tool);
  }

  return [...merged.values()];
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
