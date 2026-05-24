import { SdkError } from '../errors/index.js';
import type { JsonObject, JsonValue, ToolDefinition, ToolHandler } from '../types/types.js';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import { readFile } from 'node:fs/promises';

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse<T> {
  jsonrpc?: string;
  id?: number;
  result?: T;
  error?: JsonRpcError;
}

export interface McpClientInfo {
  name: string;
  version: string;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: JsonObject;
}

export interface McpToolCallResult {
  content?: Array<{
    type?: string;
    text?: string;
    [key: string]: unknown;
  }>;
  isError?: boolean;
  [key: string]: unknown;
}

export interface McpToolClient {
  listTools(signal?: AbortSignal): Promise<McpTool[]>;
  callTool(name: string, args: unknown, signal?: AbortSignal): Promise<McpToolCallResult>;
}

export interface McpHttpClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  sessionId?: string;
  protocolVersion?: string;
  clientInfo?: McpClientInfo;
}

type SpawnFn = (command: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;

export interface McpStdioClientOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  protocolVersion?: string;
  clientInfo?: McpClientInfo;
  spawnFn?: SpawnFn;
}

export type McpServerOptions = ({ transport?: 'http' } & McpHttpClientOptions) | ({ transport?: 'stdio' } & McpStdioClientOptions);

export interface McpServerHttpConfig {
  type?: 'http';
  transport?: 'http';
  url?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  sessionId?: string;
  protocolVersion?: string;
  clientInfo?: McpClientInfo;
}

export interface McpServerStdioConfig {
  type?: 'stdio';
  transport?: 'stdio';
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  autoStart?: boolean;
  timeoutMs?: number;
  protocolVersion?: string;
  clientInfo?: McpClientInfo;
  spawnFn?: SpawnFn;
}

export type McpServerConfig = McpServerHttpConfig | McpServerStdioConfig;
export type McpServerConfigMap = Record<string, McpServerConfig>;

export type McpSkillConfig = Record<string, unknown>;
export type McpAgentConfig = Record<string, unknown>;
export type McpPromptConfig = string | Record<string, unknown>;

export type McpSkillConfigMap = Record<string, McpSkillConfig>;
export type McpAgentConfigMap = Record<string, McpAgentConfig>;
export type McpPromptConfigMap = Record<string, McpPromptConfig>;

export interface McpServersJsonConfig {
  mcpServers: McpServerConfigMap;
}

export interface McpRuntimeJsonConfig {
  mcpServers?: McpServerConfigMap;
  skills?: McpSkillConfigMap;
  agents?: McpAgentConfigMap;
  prompts?: McpPromptConfigMap;
}

export interface McpRuntimeResources {
  mcpServers: Record<string, McpServer>;
  skills: McpSkillConfigMap;
  agents: McpAgentConfigMap;
  prompts: McpPromptConfigMap;
}

interface McpListToolsResult {
  tools?: Array<{
    name?: string;
    description?: string;
    inputSchema?: unknown;
  }>;
  nextCursor?: string;
}

class McpHttpClient implements McpToolClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number | undefined;
  private readonly protocolVersion: string;
  private readonly clientInfo: McpClientInfo;
  private sessionId: string | undefined;
  private initialized = false;
  private requestId = 1;

  constructor(options: McpHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.headers = options.headers ?? {};
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs;
    this.sessionId = options.sessionId;
    this.protocolVersion = options.protocolVersion ?? '2024-11-05';
    this.clientInfo = options.clientInfo ?? { name: 'swallow-sdk', version: '1.0.0' };
  }

  async listTools(signal?: AbortSignal): Promise<McpTool[]> {
    await this.ensureInitialized(signal);

    const tools: McpTool[] = [];
    let cursor: string | undefined;

    while (true) {
      const response = await this.request<McpListToolsResult>('tools/list', cursor ? { cursor } : {}, signal);
      const pageTools = response.tools ?? [];

      for (const tool of pageTools) {
        if (!tool.name) {
          continue;
        }

        tools.push({
          name: tool.name,
          ...(tool.description !== undefined ? { description: tool.description } : {}),
          ...(isJsonObject(tool.inputSchema) ? { inputSchema: tool.inputSchema } : {}),
        });
      }

      if (!response.nextCursor) {
        break;
      }

      cursor = response.nextCursor;
    }

    return tools;
  }

  async callTool(name: string, args: unknown, signal?: AbortSignal): Promise<McpToolCallResult> {
    await this.ensureInitialized(signal);

    const result = await this.request<McpToolCallResult>('tools/call', { name, arguments: args }, signal);
    return result;
  }

  private async ensureInitialized(signal?: AbortSignal): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.request<unknown>(
      'initialize',
      {
        protocolVersion: this.protocolVersion,
        capabilities: {
          tools: {},
        },
        clientInfo: this.clientInfo,
      },
      signal,
    );

    this.initialized = true;
  }

  private async request<T>(method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const id = this.requestId;
    this.requestId += 1;

    const mergedSignal = createMergedSignal(signal, this.timeoutMs);
    const response = await this.fetchFn(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(this.sessionId !== undefined ? { 'mcp-session-id': this.sessionId } : {}),
        ...this.headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      }),
      signal: mergedSignal,
    });

    const headerSessionId = response.headers.get('mcp-session-id');
    if (headerSessionId) {
      this.sessionId = headerSessionId;
    }

    if (!response.ok) {
      const bodyText = await safeReadText(response);
      throw new SdkError(`MCP request failed: HTTP ${response.status} ${response.statusText}${bodyText ? ` - ${bodyText}` : ''}`);
    }

    let json: JsonRpcResponse<T>;
    try {
      json = (await response.json()) as JsonRpcResponse<T>;
    } catch (error) {
      throw new SdkError('MCP response is not valid JSON', { cause: error });
    }

    if (json.error) {
      throw new SdkError(`MCP error (${json.error.code}): ${json.error.message}`);
    }

    if (json.result === undefined) {
      throw new SdkError('MCP response does not contain result');
    }

    return json.result;
  }
}

class McpStdioClient implements McpToolClient {
  private readonly timeoutMs: number | undefined;
  private readonly protocolVersion: string;
  private readonly clientInfo: McpClientInfo;
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: unknown) => void;
      timeoutId?: ReturnType<typeof setTimeout>;
    }
  >();

  private initialized = false;
  private requestId = 1;
  private stdoutBuffer = '';
  private stderrChunks: string[] = [];
  private closed = false;

  constructor(options: McpStdioClientOptions) {
    const spawnFn = options.spawnFn ?? spawn;
    this.process = spawnFn(options.command, options.args ?? [], {
      cwd: options.cwd,
      env: options.env,
      stdio: 'pipe',
      shell: false,
    });

    this.timeoutMs = options.timeoutMs;
    this.protocolVersion = options.protocolVersion ?? '2024-11-05';
    this.clientInfo = options.clientInfo ?? { name: 'swallow-sdk', version: '1.0.0' };

    this.process.stdout.setEncoding('utf8');
    this.process.stdout.on('data', (chunk: string) => {
      this.onStdout(chunk);
    });

    this.process.stderr.setEncoding('utf8');
    this.process.stderr.on('data', (chunk: string) => {
      this.stderrChunks.push(chunk);
      if (this.stderrChunks.length > 25) {
        this.stderrChunks.shift();
      }
    });

    this.process.once('error', (error) => {
      this.closeWithError(new SdkError('MCP stdio process error', { cause: error }));
    });

    this.process.once('exit', (code, signal) => {
      const details = this.stderrChunks.join('').trim();
      const suffix = details ? ` stderr: ${details}` : '';
      this.closeWithError(new SdkError(`MCP stdio process exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})${suffix}`));
    });
  }

  async listTools(signal?: AbortSignal): Promise<McpTool[]> {
    await this.ensureInitialized(signal);

    const tools: McpTool[] = [];
    let cursor: string | undefined;

    while (true) {
      const response = await this.request<McpListToolsResult>('tools/list', cursor ? { cursor } : {}, signal);
      const pageTools = response.tools ?? [];

      for (const tool of pageTools) {
        if (!tool.name) {
          continue;
        }

        tools.push({
          name: tool.name,
          ...(tool.description !== undefined ? { description: tool.description } : {}),
          ...(isJsonObject(tool.inputSchema) ? { inputSchema: tool.inputSchema } : {}),
        });
      }

      if (!response.nextCursor) {
        break;
      }

      cursor = response.nextCursor;
    }

    return tools;
  }

  async callTool(name: string, args: unknown, signal?: AbortSignal): Promise<McpToolCallResult> {
    await this.ensureInitialized(signal);

    const result = await this.request<McpToolCallResult>('tools/call', { name, arguments: args }, signal);
    return result;
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.process.kill();
  }

  private async ensureInitialized(signal?: AbortSignal): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.request<unknown>(
      'initialize',
      {
        protocolVersion: this.protocolVersion,
        capabilities: {
          tools: {},
        },
        clientInfo: this.clientInfo,
      },
      signal,
    );

    this.initialized = true;
  }

  private request<T>(method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    if (this.closed) {
      throw new SdkError('MCP stdio client is closed');
    }

    if (signal?.aborted) {
      throw new SdkError('MCP request aborted');
    }

    const id = this.requestId;
    this.requestId += 1;

    return new Promise<T>((resolve, reject) => {
      const timeoutId =
        this.timeoutMs !== undefined ?
          setTimeout(() => {
            this.pending.delete(id);
            reject(new SdkError(`MCP request timed out (${method})`));
          }, this.timeoutMs)
        : undefined;

      this.pending.set(id, {
        resolve: (value) => {
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
          }
          resolve(value as T);
        },
        reject: (error) => {
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
          }
          reject(error);
        },
        ...(timeoutId !== undefined ? { timeoutId } : {}),
      });

      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            const pending = this.pending.get(id);
            if (!pending) {
              return;
            }

            this.pending.delete(id);
            pending.reject(new SdkError('MCP request aborted'));
          },
          { once: true },
        );
      }

      try {
        this.writeFramedJson({
          jsonrpc: '2.0',
          id,
          method,
          params,
        });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  private writeFramedJson(payload: unknown): void {
    const body = JSON.stringify(payload);
    const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
    const ok = this.process.stdin.write(frame, 'utf8');

    if (!ok) {
      throw new SdkError('MCP stdio write failed');
    }
  }

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;

    while (true) {
      const separatorIndex = this.stdoutBuffer.indexOf('\r\n\r\n');
      if (separatorIndex < 0) {
        return;
      }

      const headerBlock = this.stdoutBuffer.slice(0, separatorIndex);
      const contentLength = parseContentLength(headerBlock);
      if (contentLength === undefined) {
        this.closeWithError(new SdkError('MCP stdio response missing Content-Length header'));
        return;
      }

      const bodyStart = separatorIndex + 4;
      const bodyEnd = bodyStart + contentLength;
      if (this.stdoutBuffer.length < bodyEnd) {
        return;
      }

      const body = this.stdoutBuffer.slice(bodyStart, bodyEnd);
      this.stdoutBuffer = this.stdoutBuffer.slice(bodyEnd);

      this.handleResponseBody(body);
    }
  }

  private handleResponseBody(body: string): void {
    let message: JsonRpcResponse<unknown>;
    try {
      message = JSON.parse(body) as JsonRpcResponse<unknown>;
    } catch (error) {
      this.closeWithError(new SdkError('MCP stdio sent invalid JSON', { cause: error }));
      return;
    }

    if (typeof message.id !== 'number') {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new SdkError(`MCP error (${message.error.code}): ${message.error.message}`));
      return;
    }

    if (message.result === undefined) {
      pending.reject(new SdkError('MCP response does not contain result'));
      return;
    }

    pending.resolve(message.result);
  }

  private closeWithError(error: SdkError): void {
    if (this.closed) {
      return;
    }

    this.closed = true;

    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      if (pending.timeoutId !== undefined) {
        clearTimeout(pending.timeoutId);
      }
      pending.reject(error);
    }
  }
}

export class McpServer implements McpToolClient {
  private readonly client: McpToolClient;
  private readonly closeFn: (() => void) | undefined;

  constructor(options: McpServerOptions) {
    if (isHttpServerOptions(options)) {
      this.client = new McpHttpClient(options);
      this.closeFn = undefined;
      return;
    }

    const stdioClient = new McpStdioClient(options);
    this.client = stdioClient;
    this.closeFn = () => {
      stdioClient.close();
    };
  }

  listTools(signal?: AbortSignal): Promise<McpTool[]> {
    return this.client.listTools(signal);
  }

  callTool(name: string, args: unknown, signal?: AbortSignal): Promise<McpToolCallResult> {
    return this.client.callTool(name, args, signal);
  }

  close(): void {
    this.closeFn?.();
  }
}

export function createMcpServerFromConfig(config: McpServerConfig): McpServer;
export function createMcpServerFromConfig(configMap: McpServerConfigMap, serverName: string): McpServer;
export function createMcpServerFromConfig(configOrMap: McpServerConfig | McpServerConfigMap, serverName?: string): McpServer {
  const config = resolveServerConfig(configOrMap, serverName);

  if (isStdioConfig(config)) {
    return new McpServer({
      transport: 'stdio',
      command: config.command,
      ...(config.args !== undefined ? { args: config.args } : {}),
      ...(config.cwd !== undefined ? { cwd: config.cwd } : {}),
      ...(config.env !== undefined ? { env: config.env } : {}),
      ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
      ...(config.protocolVersion !== undefined ? { protocolVersion: config.protocolVersion } : {}),
      ...(config.clientInfo !== undefined ? { clientInfo: config.clientInfo } : {}),
      ...(config.spawnFn !== undefined ? { spawnFn: config.spawnFn } : {}),
    });
  }

  const baseUrl = config.baseUrl ?? config.url;
  if (!baseUrl) {
    throw new SdkError('MCP HTTP config requires baseUrl or url');
  }

  return new McpServer({
    transport: 'http',
    baseUrl,
    ...(config.headers !== undefined ? { headers: config.headers } : {}),
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    ...(config.sessionId !== undefined ? { sessionId: config.sessionId } : {}),
    ...(config.protocolVersion !== undefined ? { protocolVersion: config.protocolVersion } : {}),
    ...(config.clientInfo !== undefined ? { clientInfo: config.clientInfo } : {}),
  });
}

export function createMcpServersFromConfig(configOrFile: McpServerConfigMap | McpServersJsonConfig): Record<string, McpServer> {
  const configMap = getConfigMap(configOrFile);
  const result: Record<string, McpServer> = {};

  for (const [name, config] of Object.entries(configMap)) {
    result[name] = createMcpServerFromConfig(config);
  }

  return result;
}

export async function createMcpServersFromJsonFile(filePath: string): Promise<Record<string, McpServer>> {
  let parsed: unknown;

  try {
    const content = await readFile(filePath, 'utf8');
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    throw new SdkError(`Failed to read MCP config JSON: ${filePath}`, { cause: error });
  }

  if (!isMcpServersJsonConfig(parsed)) {
    throw new SdkError('Invalid MCP config JSON: expected object with mcpServers map');
  }

  return createMcpServersFromConfig(parsed);
}

export function createMcpRuntimeFromConfig(config: McpRuntimeJsonConfig): McpRuntimeResources {
  const normalized = normalizeRuntimeConfig(config);

  return {
    mcpServers: Object.keys(normalized.mcpServers).length > 0 ? createMcpServersFromConfig(normalized.mcpServers) : {},
    skills: normalized.skills,
    agents: normalized.agents,
    prompts: normalized.prompts,
  };
}

export async function createMcpRuntimeFromJsonFile(filePath: string): Promise<McpRuntimeResources> {
  let parsed: unknown;

  try {
    const content = await readFile(filePath, 'utf8');
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    throw new SdkError(`Failed to read MCP runtime config JSON: ${filePath}`, { cause: error });
  }

  if (!isRuntimeJsonConfigShape(parsed)) {
    throw new SdkError('Invalid MCP runtime config JSON: expected object with mcpServers/skills/agents/prompts');
  }

  return createMcpRuntimeFromConfig(parsed);
}

export async function createMcpToolSuite(
  client: McpToolClient,
  signal?: AbortSignal,
): Promise<{ tools: ToolDefinition[]; handlers: Record<string, ToolHandler> }> {
  const mcpTools = await client.listTools(signal);
  const handlers: Record<string, ToolHandler> = {};
  const tools: ToolDefinition[] = [];

  for (const mcpTool of mcpTools) {
    if (handlers[mcpTool.name] !== undefined) {
      throw new SdkError(`Duplicate MCP tool name: ${mcpTool.name}`);
    }

    tools.push({
      name: mcpTool.name,
      ...(mcpTool.description !== undefined ? { description: mcpTool.description } : {}),
      ...(mcpTool.inputSchema !== undefined ? { parameters: mcpTool.inputSchema } : {}),
    });

    handlers[mcpTool.name] = async (args) => {
      const result = await client.callTool(mcpTool.name, args, signal);
      return normalizeMcpToolResult(result);
    };
  }

  return { tools, handlers };
}

function normalizeMcpToolResult(result: McpToolCallResult): unknown {
  if (!Array.isArray(result.content)) {
    return result;
  }

  const textParts = result.content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string);

  if (textParts.length > 0) {
    return textParts.join('\n');
  }

  return result;
}

function isJsonObject(value: unknown): value is JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  for (const item of Object.values(value as Record<string, unknown>)) {
    if (!isJsonValue(item)) {
      return false;
    }
  }

  return true;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (typeof value === 'object') {
    return isJsonObject(value);
  }

  return false;
}

function createMergedSignal(signal: AbortSignal | undefined, timeoutMs: number | undefined): AbortSignal | null {
  if (timeoutMs === undefined) {
    return signal ?? null;
  }

  const controller = new AbortController();
  const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
      return controller.signal;
    }

    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeoutId);
        controller.abort();
      },
      { once: true },
    );
  }

  controller.signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timeoutId);
    },
    { once: true },
  );

  return controller.signal;
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}

function parseContentLength(headerBlock: string): number | undefined {
  const headers = headerBlock.split('\r\n');

  for (const header of headers) {
    const separatorIndex = header.indexOf(':');
    if (separatorIndex < 0) {
      continue;
    }

    const name = header.slice(0, separatorIndex).trim().toLowerCase();
    if (name !== 'content-length') {
      continue;
    }

    const rawValue = header.slice(separatorIndex + 1).trim();
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return undefined;
    }

    return parsed;
  }

  return undefined;
}

function isHttpServerOptions(options: McpServerOptions): options is { transport?: 'http' } & McpHttpClientOptions {
  return 'baseUrl' in options;
}

function resolveServerConfig(configOrMap: McpServerConfig | McpServerConfigMap, serverName?: string): McpServerConfig {
  if (isServerConfig(configOrMap)) {
    return configOrMap;
  }

  if (serverName !== undefined) {
    const named = configOrMap[serverName];
    if (!named) {
      throw new SdkError(`MCP server config not found: ${serverName}`);
    }

    return named;
  }

  const keys = Object.keys(configOrMap);
  if (keys.length === 1) {
    const firstKey = keys[0];
    if (firstKey === undefined) {
      throw new SdkError('MCP server config map is empty');
    }

    const single = configOrMap[firstKey];
    if (!single) {
      throw new SdkError('MCP server config map is empty');
    }

    return single;
  }

  throw new SdkError('MCP serverName is required when config map contains multiple servers');
}

function isServerConfig(value: McpServerConfig | McpServerConfigMap): value is McpServerConfig {
  const candidate = value as Record<string, unknown>;
  return 'command' in candidate || 'url' in candidate || 'baseUrl' in candidate || 'transport' in candidate || 'type' in candidate;
}

function isStdioConfig(config: McpServerConfig): config is McpServerStdioConfig {
  const candidate = config as Record<string, unknown>;
  return 'command' in candidate || candidate['type'] === 'stdio' || candidate['transport'] === 'stdio';
}

function getConfigMap(configOrFile: McpServerConfigMap | McpServersJsonConfig): McpServerConfigMap {
  if (isMcpServersJsonConfig(configOrFile)) {
    return configOrFile.mcpServers;
  }

  return configOrFile;
}

function isMcpServersJsonConfig(value: unknown): value is McpServersJsonConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (!('mcpServers' in candidate)) {
    return false;
  }

  const mcpServers = candidate['mcpServers'];
  return typeof mcpServers === 'object' && mcpServers !== null && !Array.isArray(mcpServers);
}

function normalizeRuntimeConfig(config: McpRuntimeJsonConfig): {
  mcpServers: McpServerConfigMap;
  skills: McpSkillConfigMap;
  agents: McpAgentConfigMap;
  prompts: McpPromptConfigMap;
} {
  const source = config as Record<string, unknown>;

  const mcpServers = pickRecord(source, ['mcpServers', 'MCPSERVERS']);
  const skills = pickRecord(source, ['skills', 'SKILLS']);
  const agents = pickRecord(source, ['agents', 'AGENTS']);
  const prompts = pickRecord(source, ['prompts', 'PROMPTS']);

  return {
    mcpServers: (mcpServers ?? {}) as McpServerConfigMap,
    skills: (skills ?? {}) as McpSkillConfigMap,
    agents: (agents ?? {}) as McpAgentConfigMap,
    prompts: (prompts ?? {}) as McpPromptConfigMap,
  };
}

function pickRecord(source: Record<string, unknown>, keys: string[]): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = source[key];
    if (value === undefined) {
      continue;
    }

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new SdkError(`Invalid runtime config field '${key}': expected object map`);
    }

    return value as Record<string, unknown>;
  }

  return undefined;
}

function isRuntimeJsonConfigShape(value: unknown): value is McpRuntimeJsonConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    'mcpServers' in candidate ||
    'skills' in candidate ||
    'agents' in candidate ||
    'prompts' in candidate ||
    'MCPSERVERS' in candidate ||
    'SKILLS' in candidate ||
    'AGENTS' in candidate ||
    'PROMPTS' in candidate
  );
}
