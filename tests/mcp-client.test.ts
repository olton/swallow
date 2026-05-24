import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Agent } from '../src/agent/client';
import {
  McpServer,
  createMcpRuntimeFromConfig,
  createMcpRuntimeFromJsonFile,
  createMcpServerFromConfig,
  createMcpServersFromConfig,
  createMcpServersFromJsonFile,
  createMcpToolSuite,
} from '../src/agent/mcp';
import type { LlmProvider, McpToolClient } from '../src/index';

describe('McpServer http transport', () => {
  it('initializes, lists tools, and calls tool', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'mcp-session-id': 'session-1' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            result: {
              tools: [
                {
                  name: 'context7_query',
                  description: 'Query Context7 docs',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      libraryId: { type: 'string' },
                      query: { type: 'string' },
                    },
                    required: ['libraryId', 'query'],
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            result: {
              content: [{ type: 'text', text: 'ok' }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const client = new McpServer({
      transport: 'http',
      baseUrl: 'https://mcp.example.com',
      fetchFn,
    });

    const tools = await client.listTools();
    expect(tools[0]?.name).toBe('context7_query');

    const result = await client.callTool('context7_query', {
      libraryId: '/vercel/next.js',
      query: 'routing',
    });

    expect(result.content?.[0]?.text).toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(3);

    const headers = fetchFn.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(headers['mcp-session-id']).toBe('session-1');
  });
});

describe('McpServer stdio transport', () => {
  it('supports command/args transport (npx style)', async () => {
    const fakeProcess = createFakeMcpProcess();
    const spawnFn = vi.fn(() => fakeProcess);

    const client = new McpServer({
      transport: 'stdio',
      command: 'npx.cmd',
      args: ['-y', '@modelcontextprotocol/server-memory'],
      spawnFn,
    });

    const tools = await client.listTools();
    expect(tools[0]?.name).toBe('memory_add');

    const result = await client.callTool('memory_add', { entity: 'note', value: 'hello' });
    expect(result.content?.[0]?.text).toBe('saved');

    expect(spawnFn).toHaveBeenCalledTimes(1);
    const args = spawnFn.mock.calls[0]?.[1];
    expect(args).toEqual(['-y', '@modelcontextprotocol/server-memory']);

    client.close();
  });
});

describe('createMcpServerFromConfig', () => {
  it('creates stdio server from single config (command/args/autoStart)', async () => {
    const fakeProcess = createFakeMcpProcess();
    const spawnFn = vi.fn(() => fakeProcess);

    const server = createMcpServerFromConfig({
      command: 'npx.cmd',
      args: ['-y', '@modelcontextprotocol/server-memory'],
      autoStart: true,
      transport: 'stdio',
      spawnFn,
    });

    const tools = await server.listTools();
    expect(tools[0]?.name).toBe('memory_add');
    expect(spawnFn).toHaveBeenCalledTimes(1);

    server.close();
  });

  it('creates server from map by name', async () => {
    const fakeProcess = createFakeMcpProcess();
    const spawnFn = vi.fn(() => fakeProcess);

    const server = createMcpServerFromConfig(
      {
        memory: {
          command: 'npx.cmd',
          args: ['-y', '@modelcontextprotocol/server-memory'],
          autoStart: true,
          transport: 'stdio',
          spawnFn,
        },
      },
      'memory',
    );

    const result = await server.callTool('memory_add', { entity: 'note', value: 'from-map' });
    expect(result.content?.[0]?.text).toBe('saved');

    server.close();
  });
});

describe('batch MCP server creation', () => {
  it('creates multiple servers from mcpServers object', async () => {
    const fakeProcess = createFakeMcpProcess();
    const spawnFn = vi.fn(() => fakeProcess);

    const servers = createMcpServersFromConfig({
      mcpServers: {
        memory: {
          command: 'npx.cmd',
          args: ['-y', '@modelcontextprotocol/server-memory'],
          autoStart: true,
          transport: 'stdio',
          spawnFn,
        },
      },
    });

    const memoryServer = servers['memory'];
    expect(memoryServer).toBeTruthy();

    const tools = await memoryServer.listTools();
    expect(tools[0]?.name).toBe('memory_add');

    memoryServer.close();
  });

  it('creates multiple servers from JSON file with mcpServers', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'swallow-mcp-'));
    const filePath = join(tempDir, 'mcp.json');

    try {
      const fileConfig = {
        mcpServers: {
          context7: {
            transport: 'http',
            baseUrl: 'https://mcp.example.com',
          },
        },
      };

      await writeFile(filePath, JSON.stringify(fileConfig), 'utf8');

      const servers = await createMcpServersFromJsonFile(filePath);
      const context7Server = servers['context7'];
      expect(context7Server).toBeTruthy();
      context7Server.close();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('runtime config with skills/agents/prompts', () => {
  it('creates runtime resources from object config', () => {
    const runtime = createMcpRuntimeFromConfig({
      skills: {
        'check-security': {
          description: 'Identify vulnerabilities',
          file: './skills/check-security/SKILL.md',
        },
      },
      agents: {
        Explore: {
          description: 'Read-only exploration',
        },
      },
      prompts: {
        standup: 'Generate standup summary from session logs',
      },
    });

    expect(Object.keys(runtime.mcpServers)).toHaveLength(0);
    expect(runtime.skills['check-security']?.['description']).toBe('Identify vulnerabilities');
    expect(runtime.agents['Explore']?.['description']).toBe('Read-only exploration');
    expect(runtime.prompts['standup']).toBe('Generate standup summary from session logs');
  });

  it('loads runtime resources from JSON file with uppercase sections', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'swallow-runtime-'));
    const filePath = join(tempDir, 'runtime.json');

    try {
      const fileConfig = {
        SKILLS: {
          refactoring: {
            description: 'Refactor function readability',
          },
        },
        AGENTS: {
          Explore: {
            description: 'Fast repo exploration',
          },
        },
        PROMPTS: {
          triage: 'Summarize open defects by severity',
        },
      };

      await writeFile(filePath, JSON.stringify(fileConfig), 'utf8');

      const runtime = await createMcpRuntimeFromJsonFile(filePath);
      expect(runtime.skills['refactoring']?.['description']).toBe('Refactor function readability');
      expect(runtime.agents['Explore']?.['description']).toBe('Fast repo exploration');
      expect(runtime.prompts['triage']).toBe('Summarize open defects by severity');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Agent.runWithMcpTools', () => {
  it('runs tool loop using MCP tools', async () => {
    const provider: LlmProvider = {
      id: 'mock',
      chat: vi
        .fn()
        .mockResolvedValueOnce({
          model: 'm',
          content: '',
          done: true,
          toolCalls: [
            {
              id: 'call_1',
              name: 'context7_query',
              argumentsJson: JSON.stringify({ libraryId: '/a/b', query: 'c' }),
              type: 'function' as const,
            },
          ],
        })
        .mockResolvedValueOnce({
          model: 'm',
          content: 'done',
          done: true,
        }),
      chatStream: vi.fn(async function* () {
        yield { model: 'm', delta: '', done: true };
      }),
      embed: vi.fn(async () => ({ model: 'm', embeddings: [] })),
      listModels: vi.fn(async () => [{ name: 'm' }]),
    };

    const mcpClient: McpToolClient = {
      listTools: vi.fn(async () => [
        {
          name: 'context7_query',
          inputSchema: {
            type: 'object',
            properties: {
              libraryId: { type: 'string' },
              query: { type: 'string' },
            },
            required: ['libraryId', 'query'],
          },
        },
      ]),
      callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'result from context7' }] })),
    };

    const agent = new Agent(provider);
    const result = await agent.runWithMcpTools(
      {
        model: 'm',
        messages: [{ role: 'user', content: 'find docs' }],
      },
      mcpClient,
    );

    expect(result.final.content).toBe('done');
    expect(mcpClient.callTool).toHaveBeenCalledTimes(1);
    expect(result.toolExecutions[0]?.name).toBe('context7_query');
  });

  it('createMcpToolSuite returns handlers and tool definitions', async () => {
    const mcpClient: McpToolClient = {
      listTools: vi.fn(async () => [
        {
          name: 'context7_query',
          description: 'Query Context7 docs',
          inputSchema: {
            type: 'object',
            properties: {
              libraryId: { type: 'string' },
              query: { type: 'string' },
            },
          },
        },
      ]),
      callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'doc text' }] })),
    };

    const suite = await createMcpToolSuite(mcpClient);
    expect(suite.tools[0]?.name).toBe('context7_query');

    const handler = suite.handlers['context7_query'];
    const response = await handler(
      { libraryId: '/x/y', query: 'z' },
      { call: { id: '1', name: 'context7_query', argumentsJson: '{}', type: 'function' }, iteration: 1 },
    );
    expect(response).toBe('doc text');
  });
});

function createFakeMcpProcess() {
  class FakeChildProcess extends EventEmitter {
    stdin = new PassThrough();
    stdout = new PassThrough();
    stderr = new PassThrough();

    kill() {
      this.emit('exit', 0, null);
      return true;
    }
  }

  const process = new FakeChildProcess();
  process.stdout.setEncoding('utf8');
  process.stderr.setEncoding('utf8');

  let inputBuffer = '';
  process.stdin.on('data', (chunk: Buffer | string) => {
    inputBuffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');

    while (true) {
      const separatorIndex = inputBuffer.indexOf('\r\n\r\n');
      if (separatorIndex < 0) {
        return;
      }

      const headerBlock = inputBuffer.slice(0, separatorIndex);
      const match = /Content-Length:\s*(\d+)/i.exec(headerBlock);
      if (!match) {
        return;
      }

      const length = Number(match[1]);
      const bodyStart = separatorIndex + 4;
      const bodyEnd = bodyStart + length;
      if (inputBuffer.length < bodyEnd) {
        return;
      }

      const body = inputBuffer.slice(bodyStart, bodyEnd);
      inputBuffer = inputBuffer.slice(bodyEnd);

      const request = JSON.parse(body) as {
        id: number;
        method: string;
        params?: Record<string, unknown>;
      };

      const result =
        request.method === 'tools/list' ?
          {
            tools: [
              {
                name: 'memory_add',
                description: 'Add observation',
                inputSchema: {
                  type: 'object',
                  properties: {
                    entity: { type: 'string' },
                    value: { type: 'string' },
                  },
                  required: ['entity', 'value'],
                },
              },
            ],
          }
        : request.method === 'tools/call' ? { content: [{ type: 'text', text: 'saved' }] }
        : { protocolVersion: '2024-11-05' };

      const responseBody = JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result,
      });

      process.stdout.write(`Content-Length: ${Buffer.byteLength(responseBody, 'utf8')}\r\n\r\n${responseBody}`);
    }
  });

  return process as unknown as import('node:child_process').ChildProcessWithoutNullStreams;
}
