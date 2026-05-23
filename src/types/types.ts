export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: JsonObject;
}

export type ToolChoice =
  | 'auto'
  | 'none'
  | {
      type: 'function';
      function: {
        name: string;
      };
    };

export interface ToolCall {
  id: string;
  name: string;
  argumentsJson: string;
  type: 'function';
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  name?: string;
  argumentsDelta?: string;
  type?: 'function';
}

export interface LlmMessage {
  role: MessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ChatRequest {
  model: string;
  messages: LlmMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stop?: string[];
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
}

export interface ChatResponse {
  model: string;
  content: string;
  done: boolean;
  finishReason?: string;
  toolCalls?: ToolCall[];
  raw?: unknown;
}

export interface ChatStreamChunk {
  model: string;
  delta: string;
  done: boolean;
  finishReason?: string;
  toolCalls?: ToolCallDelta[];
  raw?: unknown;
}

export interface EmbedRequest {
  model: string;
  input: string | string[];
}

export interface EmbedResponse {
  model: string;
  embeddings: number[][];
  raw?: unknown;
}

export interface ModelInfo {
  name: string;
  size?: number;
  modifiedAt?: string;
  raw?: unknown;
}

export interface ProviderCapabilities {
  chat: boolean;
  stream: boolean;
  embeddings: boolean;
  modelListing: boolean;
  tools: boolean;
  toolStreaming: boolean;
  systemMessages: boolean;
}

export interface LlmProvider {
  readonly id: string;
  readonly capabilities?: ProviderCapabilities;
  chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;
  chatStream(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatStreamChunk>;
  embed(request: EmbedRequest, signal?: AbortSignal): Promise<EmbedResponse>;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
}

export interface ToolExecutionContext {
  call: ToolCall;
  iteration: number;
}

export type ToolHandler = (args: unknown, context: ToolExecutionContext) => Promise<unknown> | unknown;

export interface RunWithToolsResult {
  final: ChatResponse;
  messages: LlmMessage[];
  toolExecutions: Array<{
    id: string;
    name: string;
    result: unknown;
  }>;
}
